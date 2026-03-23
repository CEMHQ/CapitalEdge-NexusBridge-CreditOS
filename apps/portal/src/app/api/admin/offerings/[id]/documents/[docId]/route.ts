import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserRole } from '@/lib/auth/roles'
import { offeringsLimiter } from '@/lib/rate-limit/index'
import { applyRateLimit } from '@/lib/rate-limit/apply'
import { emitAuditEvent } from '@/lib/audit/emit'

/**
 * DELETE /api/admin/offerings/[id]/documents/[docId]
 *
 * Removes an offering document record (does NOT delete from Storage — the
 * file may be referenced externally).
 * Admin only.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const { id: offering_id, docId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const blocked = await applyRateLimit(offeringsLimiter, user.id)
  if (blocked) return blocked

  const adminClient = createAdminClient()

  const { data: doc } = await adminClient
    .from('offering_documents')
    .select('id, document_type, label')
    .eq('id', docId)
    .eq('offering_id', offering_id)
    .maybeSingle()

  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  const { error } = await adminClient
    .from('offering_documents')
    .delete()
    .eq('id', docId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  emitAuditEvent({
    actorProfileId: user.id,
    eventType: 'offering_document_removed',
    entityType: 'offering',
    entityId: offering_id,
    eventPayload: { document_id: docId, document_type: doc.document_type, label: doc.label },
  })

  return NextResponse.json({ success: true })
}
