import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserRole } from '@/lib/auth/roles'
import { validateBody } from '@/lib/validation/validate'
import { attachOfferingDocumentSchema } from '@/lib/validation/schemas'
import { offeringsLimiter } from '@/lib/rate-limit/index'
import { applyRateLimit } from '@/lib/rate-limit/apply'
import { emitAuditEvent } from '@/lib/audit/emit'

/**
 * POST /api/admin/offerings/[id]/documents
 *
 * Attaches an SEC filing or investor document to an offering.
 * file_path is a Supabase Storage path in the 'offering-documents' bucket.
 * Admin only.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: offering_id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const blocked = await applyRateLimit(offeringsLimiter, user.id)
  if (blocked) return blocked

  const validation = await validateBody(request, attachOfferingDocumentSchema)
  if (!validation.success) return validation.response

  const adminClient = createAdminClient()

  // Verify the offering exists
  const { data: offering } = await adminClient
    .from('offerings')
    .select('id')
    .eq('id', offering_id)
    .maybeSingle()

  if (!offering) return NextResponse.json({ error: 'Offering not found' }, { status: 404 })

  const { data: doc, error } = await adminClient
    .from('offering_documents')
    .insert({
      offering_id,
      ...validation.data,
      created_by: user.id,
    })
    .select('id, document_type, label')
    .single()

  if (error || !doc) {
    return NextResponse.json({ error: error?.message ?? 'Failed to attach document' }, { status: 500 })
  }

  emitAuditEvent({
    actorProfileId: user.id,
    eventType: 'offering_document_attached',
    entityType: 'offering',
    entityId: offering_id,
    newValue: { document_id: doc.id, document_type: doc.document_type, label: doc.label },
  })

  return NextResponse.json({ document: doc }, { status: 201 })
}
