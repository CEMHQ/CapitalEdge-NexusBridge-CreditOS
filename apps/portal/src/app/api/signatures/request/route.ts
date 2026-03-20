import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserRole } from '@/lib/auth/roles'
import { signatureLimiter } from '@/lib/rate-limit/index'
import { applyRateLimit } from '@/lib/rate-limit/apply'
import { emitAuditEvent } from '@/lib/audit/emit'
import { createSignatureRequestSchema } from '@/lib/validation/schemas'
import { sendSignatureRequest } from '@/lib/esign/boldsign'

// Template ID env var names per document type
const TEMPLATE_ENV: Record<string, string> = {
  promissory_note:        'BOLDSIGN_TEMPLATE_PROMISSORY_NOTE',
  deed_of_trust:          'BOLDSIGN_TEMPLATE_DEED_OF_TRUST',
  loan_agreement:         'BOLDSIGN_TEMPLATE_LOAN_AGREEMENT',
  subscription_agreement: 'BOLDSIGN_TEMPLATE_SUBSCRIPTION_AGREEMENT',
  ppm_acknowledgment:     'BOLDSIGN_TEMPLATE_PPM_ACKNOWLEDGMENT',
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (!['admin', 'manager'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const blocked = await applyRateLimit(signatureLimiter, user.id)
  if (blocked) return blocked

  const body = await request.json().catch(() => null)
  const parsed = createSignatureRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }

  const { entity_type, entity_id, document_type, signers, message: customMessage } = parsed.data

  // Check for existing non-voided request for this entity + document type
  const adminClient = createAdminClient()
  const { data: existing } = await adminClient
    .from('signature_requests')
    .select('id, status')
    .eq('entity_type', entity_type)
    .eq('entity_id', entity_id)
    .eq('document_type', document_type)
    .not('status', 'in', '("voided","declined","expired")')
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: `A ${existing.status} signature request already exists for this document. Void it before sending a new one.` },
      { status: 409 }
    )
  }

  // Look up template ID from env
  const templateEnvKey = TEMPLATE_ENV[document_type]
  const templateId = templateEnvKey ? process.env[templateEnvKey] : undefined

  // Fetch entity context to auto-generate title and message
  type LoanCtx = { loan_number: string | null; principal_amount: string | null; applications: { application_number: string | null; properties: { address: string | null; city: string | null; state: string | null } | null } | null } | null
  type SubCtx  = { commitment_amount: string | null; investors: { profiles: { full_name: string | null } | null } | null } | null

  let loanCtx: LoanCtx = null
  let subCtx:  SubCtx  = null

  if (entity_type === 'application') {
    const { data: loan } = await adminClient
      .from('loans')
      .select('loan_number, principal_amount, applications ( application_number, properties ( address, city, state ) )')
      .eq('application_id', entity_id)
      .maybeSingle()
    loanCtx = loan as unknown as LoanCtx
  } else if (entity_type === 'subscription') {
    const { data: sub } = await adminClient
      .from('fund_subscriptions')
      .select('commitment_amount, investors ( profiles ( full_name ) )')
      .eq('id', entity_id)
      .maybeSingle()
    subCtx = sub as unknown as SubCtx
  }

  function buildTitle(docType: string): string {
    const loanNum = loanCtx?.loan_number ?? loanCtx?.applications?.application_number ?? null
    if (entity_type === 'application') {
      const ref = loanNum ? ` — Loan #${loanNum}` : ''
      switch (docType) {
        case 'promissory_note': return `NexusBridge${ref} — Promissory Note`
        case 'deed_of_trust':   return `NexusBridge${ref} — Deed of Trust`
        case 'loan_agreement':  return `NexusBridge${ref} — Loan Agreement`
      }
    }
    if (entity_type === 'subscription') {
      switch (docType) {
        case 'subscription_agreement': return 'NexusBridge Capital LP — Subscription Agreement'
        case 'ppm_acknowledgment':     return 'NexusBridge Capital LP — PPM Receipt & Acknowledgment'
      }
    }
    return docType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }

  function buildMessage(docType: string): string {
    const loanNum   = loanCtx?.loan_number ?? loanCtx?.applications?.application_number ?? null
    const amount    = loanCtx?.principal_amount
    const prop      = loanCtx?.applications?.properties
    const propAddr  = prop ? [prop.address, prop.city, prop.state].filter(Boolean).join(', ') : null
    const amountFmt = amount ? `$${Number(amount).toLocaleString()}` : null

    switch (docType) {
      case 'promissory_note':
        return [
          loanNum   ? `Please review and sign your Promissory Note for NexusBridge Loan #${loanNum}.` : 'Please review and sign your Promissory Note.',
          amountFmt ? `This document evidences your obligation to repay the loan in the principal amount of ${amountFmt}.` : null,
          'Contact us if you have any questions before signing.',
        ].filter(Boolean).join(' ')

      case 'deed_of_trust':
        return [
          loanNum   ? `Please review and sign the Deed of Trust for NexusBridge Loan #${loanNum}.` : 'Please review and sign the Deed of Trust.',
          propAddr  ? `This document secures the loan with the property at ${propAddr}.` : null,
          'This document requires notarization — please sign electronically and coordinate with our team for notary completion.',
        ].filter(Boolean).join(' ')

      case 'loan_agreement':
        return [
          loanNum   ? `Please review and sign your Loan Agreement for NexusBridge Loan #${loanNum}.` : 'Please review and sign your Loan Agreement.',
          'This agreement governs all terms, conditions, and covenants of your loan. Read the full document carefully before signing.',
        ].filter(Boolean).join(' ')

      case 'subscription_agreement': {
        const commitAmt = subCtx?.commitment_amount
        const fmtAmt    = commitAmt ? `$${Number(commitAmt).toLocaleString()}` : null
        return [
          'Please review and sign your Subscription Agreement for NexusBridge Capital LP.',
          fmtAmt ? `This agreement confirms your investment of ${fmtAmt} as a Limited Partner.` : null,
          'The Accredited Investor Questionnaire (Exhibit A) is included — complete all applicable sections before signing.',
        ].filter(Boolean).join(' ')
      }

      case 'ppm_acknowledgment':
        return 'Please sign to acknowledge receipt of the NexusBridge Capital LP Private Placement Memorandum. You should have received the PPM as a separate document. This acknowledgment is required before your subscription can be processed.'

      default:
        return 'Please review and sign the attached document.'
    }
  }

  const title   = buildTitle(document_type)
  const message = customMessage ?? buildMessage(document_type)

  // Create the DB record first (draft status)
  const { data: sigReq, error: insertError } = await adminClient
    .from('signature_requests')
    .insert({
      entity_type,
      entity_id,
      document_type,
      provider:     'boldsign',
      template_id:  templateId ?? null,
      status:       'draft',
      signers:      signers,
      callback_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/esign`,
      created_by:   user.id,
    })
    .select('id')
    .single()

  if (insertError || !sigReq) {
    return NextResponse.json({ error: 'Failed to create signature request' }, { status: 500 })
  }

  // Send via BoldSign
  let providerRequestId: string | null = null
  let sendError: string | null = null

  try {
    const result = await sendSignatureRequest({
      title,
      message,
      signers,
      templateId,
    })

    providerRequestId = result.providerRequestId

    // Update record with provider ID and sent status
    await adminClient
      .from('signature_requests')
      .update({
        provider_request_id: providerRequestId,
        status:              'sent',
        sent_at:             new Date().toISOString(),
        signers:             signers.map((s, i) => ({
          ...s,
          signatureId: result.signers[i]?.signatureId ?? null,
          signed_at:   null,
        })),
      })
      .eq('id', sigReq.id)
  } catch (err) {
    sendError = err instanceof Error ? err.message : String(err)
    // Mark as failed but keep record for retry
    await adminClient
      .from('signature_requests')
      .update({ status: 'draft' })
      .eq('id', sigReq.id)
  }

  if (sendError) {
    return NextResponse.json(
      { error: `Signature request created but failed to send: ${sendError}`, id: sigReq.id },
      { status: 502 }
    )
  }

  void emitAuditEvent({
    actorProfileId: user.id,
    eventType:      'signature_sent',
    entityType:     'signature_request',
    entityId:       sigReq.id,
    newValue: { entity_type, entity_id, document_type, provider_request_id: providerRequestId },
  })

  return NextResponse.json({ id: sigReq.id, provider_request_id: providerRequestId }, { status: 201 })
}
