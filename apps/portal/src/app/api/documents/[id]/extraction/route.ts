import 'server-only'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserRole } from '@/lib/auth/roles'
import { applyRateLimit } from '@/lib/rate-limit/apply'
import { updateLimiter } from '@/lib/rate-limit/index'
import { reviewExtractionSchema } from '@/lib/validation/schemas'
import { emitAuditEvent } from '@/lib/audit/emit'

// GET /api/documents/[id]/extraction — fetch latest extraction + field mappings
// Restricted to admin, manager, underwriter
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (!['admin', 'manager', 'underwriter'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const adminClient = createAdminClient()

  // Verify document exists
  const { data: doc, error: docError } = await adminClient
    .from('documents')
    .select('id, file_name')
    .eq('id', id)
    .single()

  if (docError || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  // Fetch all extractions ordered newest first
  const { data: extractions, error: extractionsError } = await adminClient
    .from('document_extractions')
    .select(`
      id,
      provider_name,
      extraction_status,
      confidence_score,
      provider_job_id,
      failure_reason,
      reviewed_by,
      reviewed_at,
      created_at,
      created_by
    `)
    .eq('document_id', id)
    .order('created_at', { ascending: false })

  if (extractionsError) {
    return NextResponse.json({ error: extractionsError.message }, { status: 500 })
  }

  if (!extractions || extractions.length === 0) {
    return NextResponse.json({ extractions: [], latest: null })
  }

  // Load field mappings for the most recent extraction
  const latest = extractions[0]
  const { data: fieldMappings, error: mappingsError } = await adminClient
    .from('extraction_field_mappings')
    .select(`
      id,
      source_field,
      target_entity,
      target_field,
      extracted_value,
      confidence,
      status,
      override_value,
      reviewed_by,
      reviewed_at,
      created_at
    `)
    .eq('extraction_id', latest.id)
    .order('target_entity')
    .order('target_field')

  if (mappingsError) {
    return NextResponse.json({ error: mappingsError.message }, { status: 500 })
  }

  // raw_text is intentionally excluded from GET — it's restricted PII
  // Only returned when explicitly needed and access-logged (not implemented in this route)

  return NextResponse.json({
    extractions,
    latest: {
      ...latest,
      field_mappings: fieldMappings ?? [],
    },
  })
}

// PATCH /api/documents/[id]/extraction — review field mappings (accept/reject/override)
// Restricted to admin, manager, underwriter
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (!['admin', 'manager', 'underwriter'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const blocked = await applyRateLimit(updateLimiter, user.id)
  if (blocked) return blocked

  const body = await request.json().catch(() => null)
  const parsed = reviewExtractionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 })
  }

  const { extraction_id, field_reviews, extraction_decision } = parsed.data
  const adminClient = createAdminClient()

  // Verify the extraction belongs to this document
  const { data: extraction, error: extractionError } = await adminClient
    .from('document_extractions')
    .select('id, extraction_status, document_id')
    .eq('id', extraction_id)
    .eq('document_id', id)
    .single()

  if (extractionError || !extraction) {
    return NextResponse.json({ error: 'Extraction not found' }, { status: 404 })
  }

  if (!['completed', 'reviewed'].includes(extraction.extraction_status)) {
    return NextResponse.json(
      { error: 'Extraction must be in completed or reviewed state to review fields' },
      { status: 422 }
    )
  }

  const now = new Date().toISOString()

  // Apply each field review — field_mappings are immutable; override_value carries the correction
  const updatePromises = field_reviews.map(({ field_mapping_id, status, override_value }) =>
    adminClient
      .from('extraction_field_mappings')
      .update({
        status,
        override_value:  override_value ?? null,
        reviewed_by:     user.id,
        reviewed_at:     now,
      })
      .eq('id', field_mapping_id)
      .eq('extraction_id', extraction_id)
  )

  const results = await Promise.all(updatePromises)
  const firstError = results.find(r => r.error)
  if (firstError?.error) {
    console.error('[extraction PATCH] Field mapping update failed:', firstError.error)
    return NextResponse.json({ error: firstError.error.message }, { status: 500 })
  }

  // Update extraction status
  const newStatus = extraction_decision === 'rejected'
    ? 'rejected'
    : extraction_decision === 'accepted'
      ? 'accepted'
      : 'reviewed'

  const { error: extractionUpdateError } = await adminClient
    .from('document_extractions')
    .update({
      extraction_status: newStatus,
      reviewed_by:       user.id,
      reviewed_at:       now,
    })
    .eq('id', extraction_id)

  if (extractionUpdateError) {
    console.error('[extraction PATCH] Extraction update failed:', extractionUpdateError)
    return NextResponse.json({ error: extractionUpdateError.message }, { status: 500 })
  }

  await emitAuditEvent({
    actorProfileId: user.id,
    eventType:      'extraction_reviewed',
    entityType:     'document',
    entityId:       id,
    newValue:       {
      extraction_id,
      extraction_decision: newStatus,
      fields_reviewed:     field_reviews.length,
    },
  })

  return NextResponse.json({ success: true, status: newStatus })
}
