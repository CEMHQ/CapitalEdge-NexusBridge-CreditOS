import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserRole } from '@/lib/auth/roles'
import { emitAuditEvent } from '@/lib/audit/emit'
import { voidSignatureRequest } from '@/lib/esign/dropbox-sign'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const adminClient = createAdminClient()
  const { data: sigReq } = await adminClient
    .from('signature_requests')
    .select('id, status, provider_request_id')
    .eq('id', id)
    .single()

  if (!sigReq) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (['voided', 'signed', 'declined', 'expired'].includes(sigReq.status)) {
    return NextResponse.json({ error: `Cannot void a ${sigReq.status} request` }, { status: 422 })
  }

  // Void with provider if already sent
  if (sigReq.provider_request_id && sigReq.status === 'sent') {
    try {
      await voidSignatureRequest(sigReq.provider_request_id)
    } catch (err) {
      console.error('[signatures/void] Provider void failed:', err)
      // Continue — update DB status regardless
    }
  }

  await adminClient
    .from('signature_requests')
    .update({ status: 'voided' })
    .eq('id', id)

  void emitAuditEvent({
    actorProfileId: user.id,
    eventType:      'signature_voided',
    entityType:     'signature_request',
    entityId:       id,
  })

  return NextResponse.json({ success: true })
}
