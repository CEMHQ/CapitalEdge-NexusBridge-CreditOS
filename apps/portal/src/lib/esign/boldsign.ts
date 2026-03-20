import 'server-only'
import crypto from 'crypto'

const BOLDSIGN_BASE = 'https://api.boldsign.com'

// ─── Client helper ────────────────────────────────────────────────────────────

function getApiKey(): string {
  const key = process.env.BOLDSIGN_API_KEY
  if (!key) throw new Error('BOLDSIGN_API_KEY is not configured')
  return key
}

function boldSignFetch(path: string, options: RequestInit = {}) {
  return fetch(`${BOLDSIGN_BASE}${path}`, {
    ...options,
    headers: {
      'X-API-KEY': getApiKey(),
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  })
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SignerParams {
  name: string
  email: string
  role: string
  order?: number
}

export interface SendSignatureRequestParams {
  title: string
  message?: string
  signers: SignerParams[]
  templateId?: string
}

export interface SignatureRequestResult {
  providerRequestId: string
  status: string
  signers: Array<{ email: string; role: string; signatureId: string }>
}

// ─── Send a signature request ─────────────────────────────────────────────────
// Uses BoldSign template send if templateId is provided.
// https://developers.boldsign.com/documents/send-document-using-template/

export async function sendSignatureRequest(
  params: SendSignatureRequestParams
): Promise<SignatureRequestResult> {
  if (!params.templateId) {
    throw new Error('Sending without a template is not yet supported. Configure BOLDSIGN_TEMPLATE_* env vars.')
  }

  const body = {
    TemplateId: params.templateId,
    Title:      params.title,
    Message:    params.message ?? '',
    Roles: params.signers.map((s) => ({
      RoleName:    s.role,
      SignerName:  s.name,
      SignerEmail: s.email,
      SignerOrder: s.order ?? 0,
    })),
  }

  const res = await boldSignFetch('/v1/template/send', {
    method: 'POST',
    body:   JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`BoldSign send failed (${res.status}): ${err}`)
  }

  const data = await res.json()
  const documentId: string = data.documentId

  return {
    providerRequestId: documentId,
    status: 'sent',
    signers: params.signers.map((s) => ({
      email:       s.email,
      role:        s.role,
      signatureId: '', // BoldSign does not return per-signer IDs at send time
    })),
  }
}

// ─── Void a signature request ─────────────────────────────────────────────────
// https://developers.boldsign.com/documents/revoke-document/

export async function voidSignatureRequest(providerRequestId: string): Promise<void> {
  const res = await boldSignFetch(
    `/v1/document/revoke?documentId=${encodeURIComponent(providerRequestId)}`,
    {
      method: 'DELETE',
      body:   JSON.stringify({ message: 'Voided by administrator' }),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`BoldSign void failed (${res.status}): ${err}`)
  }
}

// ─── Resend a signature request ───────────────────────────────────────────────
// https://developers.boldsign.com/documents/remind-document/

export async function resendSignatureRequest(
  providerRequestId: string,
  signerEmail: string
): Promise<void> {
  const res = await boldSignFetch(
    `/v1/document/remind?documentId=${encodeURIComponent(providerRequestId)}`,
    {
      method: 'POST',
      body:   JSON.stringify({ receiverEmails: [signerEmail] }),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`BoldSign resend failed (${res.status}): ${err}`)
  }
}

// ─── Verify BoldSign webhook signature ────────────────────────────────────────
// BoldSign signs payloads with HMAC-SHA256 using the webhook secret.
// Header: X-BoldSign-Signature (hex-encoded)

export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
  webhookSecret: string
): boolean {
  if (!signature) return false
  try {
    const expected = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody, 'utf8')
      .digest('hex')
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(signature, 'hex')
    )
  } catch {
    return false
  }
}
