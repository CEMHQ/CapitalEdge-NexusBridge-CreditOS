import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { emitAuditEvent } from '@/lib/audit/emit'
import { emitNotification } from '@/lib/notifications/emit'
import { verifyWebhookSignature } from '@/lib/esign/dropbox-sign'
import { fireWorkflowTrigger } from '@/lib/workflows/engine'

// Dropbox Sign webhook event types we care about
type DropboxSignEventType =
  | 'signature_request_signed'
  | 'signature_request_all_signed'
  | 'signature_request_declined'
  | 'signature_request_expired'
  | 'signature_request_viewed'

interface DropboxSignWebhookPayload {
  event: {
    event_type:    DropboxSignEventType
    event_time:    string
    event_hash:    string
    event_metadata: {
      reported_for_account_id: string
    }
  }
  signature_request: {
    signature_request_id: string
    is_complete:          boolean
    is_declined:          boolean
    has_error:            boolean
    title:                string
    signatures: Array<{
      signature_id:          string
      signer_email_address:  string
      signer_name:           string
      order:                 number | null
      status_code:           string
      signed_at:             number | null
    }>
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text()

  // Verify HMAC signature
  const apiKey = process.env.DROPBOX_SIGN_API_KEY
  if (!apiKey) {
    console.error('[esign-webhook] DROPBOX_SIGN_API_KEY not configured')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  const signature = request.headers.get('x-hellosign-signature')
  if (!verifyWebhookSignature(rawBody, signature, apiKey)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // Dropbox Sign requires responding with "Hello API Event Received"
  // Parse after we know signature is valid
  let payload: DropboxSignWebhookPayload
  try {
    const parsed = JSON.parse(rawBody)
    // Dropbox Sign wraps event in a JSON string for some endpoints
    payload = typeof parsed === 'string' ? JSON.parse(parsed) : parsed
  } catch {
    return new Response('Hello API Event Received', { status: 200 })
  }

  const eventType    = payload.event?.event_type
  const providerReqId = payload.signature_request?.signature_request_id

  if (!eventType || !providerReqId) {
    return new Response('Hello API Event Received', { status: 200 })
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
    return new Response('Hello API Event Received', { status: 200 })
  }

  const now = new Date().toISOString()

  // ── Handle each event type ──────────────────────────────────────────────────

  if (eventType === 'signature_request_viewed') {
    await adminClient
      .from('signature_requests')
      .update({ status: 'viewed' })
      .eq('id', sigReq.id)
      .eq('status', 'sent') // only update if still sent
  }

  if (eventType === 'signature_request_all_signed') {
    // Update signers with signed_at timestamps
    const updatedSigners = (sigReq.signers as Array<Record<string, unknown>>).map((s) => {
      const match = payload.signature_request.signatures.find(
        (ps) => ps.signer_email_address === s.email
      )
      return { ...s, signed_at: match?.signed_at ? new Date(match.signed_at * 1000).toISOString() : null }
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
    if (sigReq.entity_type === 'application' &&
      ['promissory_note', 'deed_of_trust', 'loan_agreement'].includes(sigReq.document_type)) {
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

  if (eventType === 'signature_request_declined') {
    const decliner = payload.signature_request.signatures.find(
      (s) => s.status_code === 'declined'
    )
    await adminClient
      .from('signature_requests')
      .update({
        status:         'declined',
        declined_at:    now,
        decline_reason: decliner ? `Declined by ${decliner.signer_name} (${decliner.signer_email_address})` : null,
      })
      .eq('id', sigReq.id)

    void emitAuditEvent({
      actorProfileId: null,
      eventType:      'signature_declined',
      entityType:     'signature_request',
      entityId:       sigReq.id,
    })
  }

  if (eventType === 'signature_request_expired') {
    await adminClient
      .from('signature_requests')
      .update({ status: 'expired' })
      .eq('id', sigReq.id)
  }

  return new Response('Hello API Event Received', { status: 200 })
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
