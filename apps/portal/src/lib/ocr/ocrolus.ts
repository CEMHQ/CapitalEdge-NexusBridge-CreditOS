import 'server-only'

const BASE_URL = 'https://api.ocrolus.com/v1'

function getAuthHeader(): string {
  const key = process.env.OCROLUS_API_KEY
  const secret = process.env.OCROLUS_CLIENT_SECRET
  if (!key || !secret) throw new Error('Ocrolus credentials not configured')
  return 'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64')
}

export type OcrolusDocumentType = 'bank_statement' | 'tax_return' | 'pay_stub'

/**
 * Submit a document to Ocrolus for extraction.
 * Returns the provider job ID used to correlate the inbound webhook.
 */
export async function submitOcrolusDocument(params: {
  documentId: string
  storageUrl: string
  documentType: OcrolusDocumentType
}): Promise<{ jobId: string }> {
  const res = await fetch(`${BASE_URL}/book`, {
    method: 'POST',
    headers: {
      Authorization: getAuthHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: params.documentId,
      source: 'URL',
      url: params.storageUrl,
      doc_type: mapDocType(params.documentType),
      // webhook_url is configured in the Ocrolus dashboard to POST /api/webhooks/ocr
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Ocrolus submit failed (${res.status}): ${text}`)
  }

  const data = await res.json()
  // Ocrolus returns { book_uuid: "...", ... }
  return { jobId: data.book_uuid as string }
}

/**
 * Fetch extraction results for a completed Ocrolus job.
 * Called after the webhook confirms the job finished.
 */
export async function fetchOcrolusResults(jobId: string): Promise<{
  extractedJson: Record<string, unknown>
  confidenceScore: number | null
}> {
  const res = await fetch(`${BASE_URL}/book/${jobId}/analytics`, {
    headers: { Authorization: getAuthHeader() },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Ocrolus fetch failed (${res.status}): ${text}`)
  }

  const data = await res.json()

  // Overall confidence from Ocrolus is 0–1; convert to 0–100
  const rawConfidence = data.confidence_score ?? data.overall_confidence ?? null
  const confidenceScore =
    rawConfidence != null ? Math.round(rawConfidence * 100 * 100) / 100 : null

  return { extractedJson: data, confidenceScore }
}

/**
 * Verify that a webhook payload came from Ocrolus.
 * Ocrolus signs with HMAC-SHA256 using OCROLUS_WEBHOOK_SECRET.
 */
export async function verifyOcrolusWebhook(
  rawBody: string,
  signature: string
): Promise<boolean> {
  const secret = process.env.OCROLUS_WEBHOOK_SECRET
  if (!secret) return false

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sigBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody))
  const expected = Buffer.from(sigBytes).toString('hex')
  // Timing-safe compare
  if (expected.length !== signature.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  }
  return diff === 0
}

function mapDocType(t: OcrolusDocumentType): string {
  const map: Record<OcrolusDocumentType, string> = {
    bank_statement: 'BANK_STATEMENT',
    tax_return:     'TAX_RETURN',
    pay_stub:       'PAY_STUB',
  }
  return map[t]
}
