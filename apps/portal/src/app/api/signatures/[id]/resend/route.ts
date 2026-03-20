import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserRole } from '@/lib/auth/roles'
import { emitAuditEvent } from '@/lib/audit/emit'
import { resendSignatureRequest } from '@/lib/esign/boldsign'
import { z } from 'zod'

const resendSchema = z.object({
  signer_email: z.string().email(),
})

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

  const body = await request.json().catch(() => null)
  const parsed = resendSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'signer_email is required' }, { status: 400 })
  }

  const adminClient = createAdminClient()
  const { data: sigReq } = await adminClient
    .from('signature_requests')
    .select('id, status, provider_request_id')
    .eq('id', id)
    .single()

  if (!sigReq) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (sigReq.status !== 'sent') {
    return NextResponse.json({ error: 'Can only resend a sent request' }, { status: 422 })
  }

  try {
    await resendSignatureRequest(sigReq.provider_request_id!, parsed.data.signer_email)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Resend failed' }, { status: 502 })
  }

  void emitAuditEvent({
    actorProfileId: user.id,
    eventType:      'signature_resent',
    entityType:     'signature_request',
    entityId:       id,
    newValue:       { signer_email: parsed.data.signer_email },
  })

  return NextResponse.json({ success: true })
}
