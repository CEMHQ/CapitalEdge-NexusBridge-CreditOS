import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserRole } from '@/lib/auth/roles'
import { signatureLimiter } from '@/lib/rate-limit/index'
import { applyRateLimit } from '@/lib/rate-limit/apply'
import { emitAuditEvent } from '@/lib/audit/emit'
import { createSignatureRequestSchema } from '@/lib/validation/schemas'
import { sendSignatureRequest } from '@/lib/esign/dropbox-sign'

// Template ID env var names per document type
const TEMPLATE_ENV: Record<string, string> = {
  promissory_note:        'DROPBOX_SIGN_TEMPLATE_PROMISSORY_NOTE',
  deed_of_trust:          'DROPBOX_SIGN_TEMPLATE_DEED_OF_TRUST',
  loan_agreement:         'DROPBOX_SIGN_TEMPLATE_LOAN_AGREEMENT',
  subscription_agreement: 'DROPBOX_SIGN_TEMPLATE_SUBSCRIPTION_AGREEMENT',
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

  const { entity_type, entity_id, document_type, signers, message } = parsed.data

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

  // Create the DB record first (draft status)
  const { data: sigReq, error: insertError } = await adminClient
    .from('signature_requests')
    .insert({
      entity_type,
      entity_id,
      document_type,
      provider:     'dropbox_sign',
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

  // Send via Dropbox Sign
  let providerRequestId: string | null = null
  let sendError: string | null = null

  try {
    const docTypeLabels: Record<string, string> = {
      promissory_note:        'Promissory Note',
      deed_of_trust:          'Deed of Trust',
      loan_agreement:         'Loan Agreement',
      subscription_agreement: 'Subscription Agreement',
    }

    const result = await sendSignatureRequest({
      title:      docTypeLabels[document_type] ?? document_type,
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
