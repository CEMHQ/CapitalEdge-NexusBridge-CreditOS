import 'server-only'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserRole } from '@/lib/auth/roles'
import { applyRateLimit } from '@/lib/rate-limit/apply'
import { updateLimiter } from '@/lib/rate-limit/index'
import { applyExtractionSchema } from '@/lib/validation/schemas'
import { emitAuditEvent } from '@/lib/audit/emit'

// POST /api/documents/[id]/extraction/apply
// Apply accepted/overridden field mappings from a reviewed extraction
// to the linked application, borrower, or property record.
// Human review (accept/reject on each field) is mandatory before this route is called.
// Restricted to admin and manager only.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (!['admin', 'manager'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const blocked = await applyRateLimit(updateLimiter, user.id)
  if (blocked) return blocked

  const body = await request.json().catch(() => null)
  const parsed = applyExtractionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 })
  }

  const { extraction_id } = parsed.data
  const adminClient = createAdminClient()

  // Verify extraction belongs to document and is in accepted/reviewed state
  const { data: extraction, error: extractionError } = await adminClient
    .from('document_extractions')
    .select('id, extraction_status, document_id')
    .eq('id', extraction_id)
    .eq('document_id', id)
    .single()

  if (extractionError || !extraction) {
    return NextResponse.json({ error: 'Extraction not found' }, { status: 404 })
  }

  if (!['accepted', 'reviewed'].includes(extraction.extraction_status)) {
    return NextResponse.json(
      { error: 'Extraction must be accepted or reviewed before applying fields' },
      { status: 422 }
    )
  }

  // Fetch only accepted/overridden field mappings (rejected ones are skipped)
  const { data: mappings, error: mappingsError } = await adminClient
    .from('extraction_field_mappings')
    .select('target_entity, target_field, extracted_value, override_value, status')
    .eq('extraction_id', extraction_id)
    .in('status', ['accepted', 'overridden'])

  if (mappingsError) {
    return NextResponse.json({ error: mappingsError.message }, { status: 500 })
  }

  if (!mappings || mappings.length === 0) {
    return NextResponse.json({ error: 'No accepted field mappings to apply' }, { status: 422 })
  }

  // Load the document to find the owner entity IDs
  const { data: doc, error: docError } = await adminClient
    .from('documents')
    .select('owner_id, owner_type, uploaded_by')
    .eq('id', id)
    .single()

  if (docError || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  // Group fields by target entity
  const applicationFields: Record<string, string | null> = {}
  const borrowerFields: Record<string, string | null> = {}
  const propertyFields: Record<string, string | null> = {}

  for (const m of mappings) {
    const value = m.status === 'overridden' ? (m.override_value ?? null) : (m.extracted_value ?? null)
    if (m.target_entity === 'application') applicationFields[m.target_field] = value
    else if (m.target_entity === 'borrower') borrowerFields[m.target_field] = value
    else if (m.target_entity === 'property') propertyFields[m.target_field] = value
  }

  const applied: string[] = []
  const errors: string[] = []
  const now = new Date().toISOString()

  // Resolve application ID — depends on how the document is linked
  let applicationId: string | null = null
  if (doc.owner_type === 'application') {
    applicationId = doc.owner_id
  } else if (doc.owner_type === 'borrower' || doc.owner_type === 'loan') {
    // Try to find the linked application via borrower profile
    if (doc.uploaded_by) {
      const { data: borrower } = await adminClient
        .from('borrowers')
        .select('id')
        .eq('profile_id', doc.uploaded_by)
        .maybeSingle()
      if (borrower) {
        const { data: app } = await adminClient
          .from('applications')
          .select('id')
          .eq('borrower_id', borrower.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        applicationId = app?.id ?? null
      }
    }
  }

  // Apply to application
  if (Object.keys(applicationFields).length > 0) {
    if (!applicationId) {
      errors.push('Could not resolve application ID for application fields')
    } else {
      const { error } = await adminClient
        .from('applications')
        .update({ ...applicationFields, updated_at: now })
        .eq('id', applicationId)
      if (error) errors.push(`application: ${error.message}`)
      else applied.push('application')
    }
  }

  // Apply to borrower
  if (Object.keys(borrowerFields).length > 0) {
    let borrowerId: string | null = null
    if (doc.uploaded_by) {
      const { data: b } = await adminClient
        .from('borrowers')
        .select('id')
        .eq('profile_id', doc.uploaded_by)
        .maybeSingle()
      borrowerId = b?.id ?? null
    }

    if (!borrowerId) {
      errors.push('Could not resolve borrower ID for borrower fields')
    } else {
      const { error } = await adminClient
        .from('borrowers')
        .update({ ...borrowerFields, updated_at: now })
        .eq('id', borrowerId)
      if (error) errors.push(`borrower: ${error.message}`)
      else applied.push('borrower')
    }
  }

  // Apply to property (linked to the application)
  if (Object.keys(propertyFields).length > 0) {
    if (!applicationId) {
      errors.push('Could not resolve application ID for property fields')
    } else {
      const { data: prop } = await adminClient
        .from('properties')
        .select('id')
        .eq('application_id', applicationId)
        .maybeSingle()

      if (!prop) {
        errors.push('No property record found for this application')
      } else {
        const { error } = await adminClient
          .from('properties')
          .update({ ...propertyFields, updated_at: now })
          .eq('id', prop.id)
        if (error) errors.push(`property: ${error.message}`)
        else applied.push('property')
      }
    }
  }

  // Mark extraction as applied if at least one entity was updated
  if (applied.length > 0) {
    await adminClient
      .from('document_extractions')
      .update({ extraction_status: 'accepted' })
      .eq('id', extraction_id)
  }

  await emitAuditEvent({
    actorProfileId: user.id,
    eventType:      'extraction_applied',
    entityType:     'document',
    entityId:       id,
    newValue:       {
      extraction_id,
      applied_to:    applied,
      fields_applied: mappings.length,
      errors:         errors.length > 0 ? errors : undefined,
    },
  })

  if (errors.length > 0 && applied.length === 0) {
    return NextResponse.json({ error: 'Failed to apply fields', details: errors }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    applied_to: applied,
    fields_applied: mappings.length,
    ...(errors.length > 0 && { warnings: errors }),
  })
}
