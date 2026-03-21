import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyPersonaWebhookSignature } from '@/lib/kyc/persona'
import { emitAuditEvent } from '@/lib/audit/emit'
import { emitNotification } from '@/lib/notifications/emit'

// POST — Persona webhook handler for inquiry lifecycle events
export async function POST(request: Request) {
  const rawBody = await request.text()
  const signature = request.headers.get('Persona-Signature') ?? ''
  const webhookSecret = process.env.PERSONA_WEBHOOK_SECRET ?? ''

  if (!verifyPersonaWebhookSignature(rawBody, signature, webhookSecret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let event: unknown
  try {
    event = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Extract event metadata
  // Persona webhook shape: { data: { attributes: { name, payload: { data: { id, ... } } } } }
  const data = (event as Record<string, unknown>)?.data as Record<string, unknown> | undefined
  const attributes = data?.attributes as Record<string, unknown> | undefined
  const eventType = attributes?.name as string | undefined
  const payload = attributes?.payload as Record<string, unknown> | undefined
  const inquiryData = payload?.data as Record<string, unknown> | undefined
  const inquiryId = inquiryData?.id as string | undefined

  if (!eventType || !inquiryId) {
    // Unrecognised shape — acknowledge to avoid retries
    return NextResponse.json({ received: true })
  }

  const adminClient = createAdminClient()

  // Look up the KYC verification record by the Persona inquiry ID
  const { data: kycRecord } = await adminClient
    .from('kyc_verifications')
    .select('id, entity_id')
    .eq('provider_reference_id', inquiryId)
    .maybeSingle()

  if (!kycRecord) {
    // Unknown inquiry — acknowledge idempotently
    return NextResponse.json({ received: true })
  }

  const now = new Date().toISOString()
  const investorId = kycRecord.entity_id as string

  if (eventType === 'inquiry.completed') {
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()

    await adminClient
      .from('kyc_verifications')
      .update({
        status:      'verified',
        verified_at: now,
        expires_at:  expiresAt,
        updated_at:  now,
      })
      .eq('id', kycRecord.id)

    await adminClient
      .from('investors')
      .update({ kyc_status: 'approved', updated_at: now })
      .eq('id', investorId)

    void emitAuditEvent({
      actorProfileId: null,
      eventType:      'kyc_completed',
      entityType:     'investor',
      entityId:       investorId,
      newValue:       { inquiryId, kycId: kycRecord.id },
    })

    // Notify the investor — look up their profile_id via the investors table
    const { data: investorRow } = await adminClient
      .from('investors')
      .select('profile_id')
      .eq('id', investorId)
      .maybeSingle()

    if (investorRow?.profile_id) {
      void emitNotification({
        recipientProfileId: investorRow.profile_id,
        subject:            'Identity verification complete',
        message:            'Your identity verification is complete.',
        linkUrl:            '/dashboard/investor/compliance',
      })
    }
  } else if (eventType === 'inquiry.failed') {
    const inquiryAttrs = inquiryData?.attributes as Record<string, unknown> | undefined
    const failureReason = (inquiryAttrs?.['failed-reason'] as string | undefined) ?? 'Verification failed'

    await adminClient
      .from('kyc_verifications')
      .update({
        status:         'failed',
        failure_reason: failureReason,
        updated_at:     now,
      })
      .eq('id', kycRecord.id)

    // Reset so the investor can retry
    await adminClient
      .from('investors')
      .update({ kyc_status: 'not_started', updated_at: now })
      .eq('id', investorId)

    void emitAuditEvent({
      actorProfileId: null,
      eventType:      'kyc_failed',
      entityType:     'investor',
      entityId:       investorId,
      newValue:       { inquiryId, kycId: kycRecord.id, failureReason },
    })
  } else if (eventType === 'inquiry.expired') {
    await adminClient
      .from('kyc_verifications')
      .update({
        status:     'expired',
        updated_at: now,
      })
      .eq('id', kycRecord.id)

    void emitAuditEvent({
      actorProfileId: null,
      eventType:      'kyc_failed',
      entityType:     'investor',
      entityId:       investorId,
      newValue:       { inquiryId, kycId: kycRecord.id, reason: 'expired' },
    })
  }
  // All other event types are acknowledged without action

  return NextResponse.json({ received: true })
}
