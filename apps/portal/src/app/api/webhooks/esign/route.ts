import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { emitAuditEvent } from '@/lib/audit/emit'
import { emitNotification } from '@/lib/notifications/emit'
import { fireWorkflowTrigger } from '@/lib/workflows/engine'

// BoldSign webhook event types we care about
type BoldSignEventType =
  | 'document.Completed'
  | 'document.Declined'
  | 'document.Expired'
  | 'document.Viewed'
  | 'document.Sent'

interface BoldSignWebhookPayload {
  event: {
    eventType: BoldSignEventType
    eventTime: string
  }
  data: {
    documentId:     string
    documentStatus: string
    signerDetails?: Array<{
      signerEmail:  string
      signerName:   string
      signerRole:   string
      signedOn:     string | null
      status:       string
    }>
    declineReason?: string
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text()

  // Log all headers to identify what BoldSign actually sends
  const allHeaders: Record<string, string> = {}
  request.headers.forEach((value, key) => { allHeaders[key] = value })
  console.log('[esign-webhook] all headers:', JSON.stringify(allHeaders))
  console.log('[esign-webhook] raw body:', rawBody.slice(0, 200))

  let payload: BoldSignWebhookPayload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const eventType      = payload.event?.eventType
  const providerReqId  = payload.data?.documentId

  if (!eventType || !providerReqId) {
    return NextResponse.json({ ok: true })
  }

  const adminClient = createAdminClient()

  // Look up our signature_request record
  const { data: sigReq } = await adminClient
    .from('signature_requests')
    .select('id, entity_type, entity_id, document_type, status, signers')
    .eq('provider_request_id', providerReqId)
    .maybeSingle()

  // Unknown request — acknowledge and ignore
  if (!sigReq) {
    return NextResponse.json({ ok: true })
  }

  const now = new Date().toISOString()

  // ── Handle each event type ──────────────────────────────────────────────────

  if (eventType === 'document.Viewed') {
    await adminClient
      .from('signature_requests')
      .update({ status: 'viewed' })
      .eq('id', sigReq.id)
      .eq('status', 'sent')
  }

  if (eventType === 'document.Completed') {
    // Update signers with signed_on timestamps from BoldSign
    const updatedSigners = (sigReq.signers as Array<Record<string, unknown>>).map((s) => {
      const match = payload.data.signerDetails?.find(
        (sd) => sd.signerEmail === s.email
      )
      return { ...s, signed_at: match?.signedOn ?? null }
    })

    await adminClient
      .from('signature_requests')
      .update({
        status:       'signed',
        completed_at: now,
        signers:      updatedSigners,
      })
      .eq('id', sigReq.id)

    void emitAuditEvent({
      actorProfileId: null,
      eventType:      'signature_completed',
      entityType:     'signature_request',
      entityId:       sigReq.id,
      newValue:       { entity_type: sigReq.entity_type, entity_id: sigReq.entity_id },
    })

    // Auto-transition application from pending_closing to funded when loan docs signed
    if (
      sigReq.entity_type === 'application' &&
      ['promissory_note', 'deed_of_trust', 'loan_agreement'].includes(sigReq.document_type)
    ) {
      await adminClient
        .from('applications')
        .update({ application_status: 'funded', updated_at: now })
        .eq('id', sigReq.entity_id)
        .eq('application_status', 'pending_closing')

      void fireWorkflowTrigger('application_status_changed', {
        entity_type: 'application',
        entity_id:   sigReq.entity_id,
        old_status:  'pending_closing',
        new_status:  'funded',
        actor_id:    null,
      })
    }

    // Auto-activate subscription when agreement signed
    if (sigReq.entity_type === 'subscription' && sigReq.document_type === 'subscription_agreement') {
      await adminClient
        .from('fund_subscriptions')
        .update({ subscription_status: 'active', updated_at: now })
        .eq('id', sigReq.entity_id)
        .eq('subscription_status', 'pending_signature')
    }

    // Notify the entity owner
    void notifySignatureComplete(sigReq.entity_type, sigReq.entity_id, adminClient)
  }

  if (eventType === 'document.Declined') {
    await adminClient
      .from('signature_requests')
      .update({
        status:         'declined',
        declined_at:    now,
        decline_reason: payload.data.declineReason ?? null,
      })
      .eq('id', sigReq.id)

    void emitAuditEvent({
      actorProfileId: null,
      eventType:      'signature_declined',
      entityType:     'signature_request',
      entityId:       sigReq.id,
    })
  }

  if (eventType === 'document.Expired') {
    await adminClient
      .from('signature_requests')
      .update({ status: 'expired' })
      .eq('id', sigReq.id)
  }

  return NextResponse.json({ ok: true })
}

// ─── Notify borrower / investor that signing is complete ─────────────────────

async function notifySignatureComplete(
  entityType: string,
  entityId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminClient: any
): Promise<void> {
  try {
    if (entityType === 'application') {
      const { data: app } = await adminClient
        .from('applications')
        .select('borrowers ( profile_id )')
        .eq('id', entityId)
        .single()
      const profileId = Array.isArray(app?.borrowers) ? app.borrowers[0]?.profile_id : app?.borrowers?.profile_id
      if (profileId) {
        await emitNotification({
          recipientProfileId: profileId,
          subject: 'Documents signed',
          message: 'All closing documents have been signed. Your loan is being funded.',
          linkUrl: `/dashboard/borrower/applications/${entityId}`,
        })
      }
    }

    if (entityType === 'subscription') {
      const { data: sub } = await adminClient
        .from('fund_subscriptions')
        .select('investors ( profile_id )')
        .eq('id', entityId)
        .single()
      const profileId = Array.isArray(sub?.investors) ? sub.investors[0]?.profile_id : sub?.investors?.profile_id
      if (profileId) {
        await emitNotification({
          recipientProfileId: profileId,
          subject: 'Subscription agreement signed',
          message: 'Your subscription agreement has been signed. Your subscription is now active.',
          linkUrl: `/dashboard/investor/portfolio`,
        })
      }
    }
  } catch (err) {
    console.error('[esign-webhook] Failed to send notification:', err)
  }
}
