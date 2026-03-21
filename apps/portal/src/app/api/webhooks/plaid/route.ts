import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyPlaidWebhook } from '@/lib/kyc/plaid'
import { emitAuditEvent } from '@/lib/audit/emit'
import { emitNotification } from '@/lib/notifications/emit'

// POST — Plaid sends IDENTITY_VERIFICATION webhook events here
export async function POST(request: Request) {
  const rawBody  = await request.text()
  const token    = request.headers.get('Plaid-Verification') ?? ''

  if (!token) {
    return NextResponse.json({ error: 'Missing Plaid-Verification header' }, { status: 401 })
  }

  const valid = await verifyPlaidWebhook(rawBody, token)
  if (!valid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let event: {
    webhook_type?: string
    webhook_code?: string
    identity_verification_id?: string
    status?: string
  }

  try {
    event = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Only handle IDV webhooks
  if (event.webhook_type !== 'IDENTITY_VERIFICATION') {
    return NextResponse.json({ received: true })
  }

  const idvId = event.identity_verification_id
  if (!idvId) return NextResponse.json({ received: true })

  const adminClient = createAdminClient()

  // Look up the KYC record by the Plaid session ID stored at provider_reference_id
  const { data: kycRecord } = await adminClient
    .from('kyc_verifications')
    .select('id, entity_id, status')
    .eq('provider_reference_id', idvId)
    .maybeSingle()

  if (!kycRecord) {
    // Unknown session — acknowledge idempotently so Plaid does not retry
    return NextResponse.json({ received: true })
  }

  const now       = new Date().toISOString()
  const plaidStatus = event.status ?? ''

  // Map Plaid IDV status → our internal status
  // success → verified, failed/cancelled/closed → failed, everything else → stay pending
  let newKycStatus: 'verified' | 'failed' | null = null

  if (plaidStatus === 'success') {
    newKycStatus = 'verified'
  } else if (['failed', 'cancelled', 'closed'].includes(plaidStatus)) {
    newKycStatus = 'failed'
  }

  if (!newKycStatus) {
    // active / pending_review / expired — acknowledge without changing status
    return NextResponse.json({ received: true })
  }

  // Update kyc_verifications record
  await adminClient
    .from('kyc_verifications')
    .update({
      status:                       newKycStatus,
      ...(newKycStatus === 'verified' ? { verified_at: now } : {}),
      updated_at:                   now,
    })
    .eq('id', kycRecord.id)

  // Sync investor kyc_status
  const investorKycStatus = newKycStatus === 'verified' ? 'approved' : 'not_started'

  await adminClient
    .from('investors')
    .update({ kyc_status: investorKycStatus, updated_at: now })
    .eq('id', kycRecord.entity_id)

  // Notify the investor
  const { data: investor } = await adminClient
    .from('investors')
    .select('profile_id')
    .eq('id', kycRecord.entity_id)
    .single()

  if (investor?.profile_id) {
    const msg = newKycStatus === 'verified'
      ? 'Your identity verification was successful. You may proceed with your investor onboarding.'
      : 'Your identity verification could not be completed. Please try again or contact support.'

    void emitNotification({
      recipientProfileId: investor.profile_id,
      subject:            newKycStatus === 'verified' ? 'Identity verification complete' : 'Identity verification unsuccessful',
      message:            msg,
      linkUrl:            '/dashboard/investor/compliance',
    })
  }

  void emitAuditEvent({
    actorProfileId: null,
    eventType:      newKycStatus === 'verified' ? 'kyc_completed' : 'kyc_failed',
    entityType:     'investor',
    entityId:       kycRecord.entity_id,
    oldValue:       { kyc_status: kycRecord.status },
    newValue:       { kyc_status: investorKycStatus, plaid_status: plaidStatus, idv_id: idvId },
  })

  return NextResponse.json({ received: true })
}
