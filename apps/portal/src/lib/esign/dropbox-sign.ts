import 'server-only'
import * as DropboxSign from '@dropbox/sign'

// ─── Client factory ───────────────────────────────────────────────────────────

function getClient() {
  const apiKey = process.env.DROPBOX_SIGN_API_KEY
  if (!apiKey) throw new Error('DROPBOX_SIGN_API_KEY is not configured')
  const api = new DropboxSign.SignatureRequestApi()
  api.username = apiKey
  return api
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
  // If no template, provide file paths (not used in initial implementation)
  testMode?: boolean
}

export interface SignatureRequestResult {
  providerRequestId: string
  status: string
  signers: Array<{ email: string; role: string; signatureId: string }>
}

// ─── Send a signature request ─────────────────────────────────────────────────

export async function sendSignatureRequest(
  params: SendSignatureRequestParams
): Promise<SignatureRequestResult> {
  const api = getClient()

  const signers: DropboxSign.SubSignatureRequestTemplateSigner[] = params.signers.map((s) => ({
    role: s.role,
    name: s.name,
    emailAddress: s.email,
    order: s.order,
  }))

  // Use template if provided, otherwise send without template (files required separately)
  if (params.templateId) {
    const data: DropboxSign.SignatureRequestSendWithTemplateRequest = {
      templateIds: [params.templateId],
      subject:     params.title,
      message:     params.message ?? '',
      signers,
      testMode:    params.testMode ?? (process.env.NODE_ENV !== 'production'),
    }

    const response = await api.signatureRequestSendWithTemplate(data)
    const sr = response.body.signatureRequest!

    return {
      providerRequestId: sr.signatureRequestId!,
      status: sr.isComplete ? 'signed' : 'sent',
      signers: (sr.signatures ?? []).map((sig) => ({
        email:       sig.signerEmailAddress ?? '',
        role:        sig.signerRole ?? '',
        signatureId: sig.signatureId ?? '',
      })),
    }
  }

  // Fallback: send without template (requires file URLs — placeholder for now)
  throw new Error('Sending without a template is not yet supported. Configure DROPBOX_SIGN_TEMPLATE_* env vars.')
}

// ─── Void a signature request ─────────────────────────────────────────────────

export async function voidSignatureRequest(providerRequestId: string): Promise<void> {
  const api = getClient()
  await api.signatureRequestCancel(providerRequestId)
}

// ─── Resend a signature request ───────────────────────────────────────────────

export async function resendSignatureRequest(
  providerRequestId: string,
  signatureId: string
): Promise<void> {
  const api = getClient()
  await api.signatureRequestRemind(providerRequestId, {
    emailAddress: signatureId, // Dropbox Sign uses email for resend
  })
}

// ─── Verify Dropbox Sign webhook signature ────────────────────────────────────
// Dropbox Sign signs webhook payloads with HMAC-SHA256 using the API key.
// Header: X-HelloSign-Signature (hex-encoded)

export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
  apiKey: string
): boolean {
  if (!signature) return false
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require('crypto') as typeof import('crypto')
    const expected = crypto
      .createHmac('sha256', apiKey)
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
