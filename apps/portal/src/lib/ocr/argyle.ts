import 'server-only'

const BASE_URL = 'https://api.argyle.com/v2'

function getAuthHeader(): string {
  const key = process.env.ARGYLE_API_KEY
  if (!key) throw new Error('Argyle credentials not configured')
  return `Bearer ${key}`
}

/**
 * Submit a pay stub or income document to Argyle for extraction.
 * Returns the provider job ID used to correlate the inbound webhook.
 */
export async function submitArgyleDocument(params: {
  documentId: string
  storageUrl: string
}): Promise<{ jobId: string }> {
  const res = await fetch(`${BASE_URL}/income-reports`, {
    method: 'POST',
    headers: {
      Authorization: getAuthHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      external_id: params.documentId,
      document_url: params.storageUrl,
      // webhook_url is configured in the Argyle dashboard to POST /api/webhooks/ocr
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Argyle submit failed (${res.status}): ${text}`)
  }

  const data = await res.json()
  // Argyle returns { id: "...", ... }
  return { jobId: data.id as string }
}

/**
 * Fetch income extraction results for a completed Argyle job.
 * Called after the webhook confirms the job finished.
 */
export async function fetchArgyleResults(jobId: string): Promise<{
  extractedJson: Record<string, unknown>
  confidenceScore: number | null
}> {
  const res = await fetch(`${BASE_URL}/income-reports/${jobId}`, {
    headers: { Authorization: getAuthHeader() },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Argyle fetch failed (${res.status}): ${text}`)
  }

  const data = await res.json()

  // Argyle confidence is 0–1 if present; convert to 0–100
  const rawConfidence = data.confidence ?? null
  const confidenceScore =
    rawConfidence != null ? Math.round(rawConfidence * 100 * 100) / 100 : null

  return { extractedJson: data, confidenceScore }
}

/**
 * Verify that a webhook payload came from Argyle.
 * Argyle signs with HMAC-SHA256 using ARGYLE_WEBHOOK_SECRET.
 */
export async function verifyArgyleWebhook(
  rawBody: string,
  signature: string
): Promise<boolean> {
  const secret = process.env.ARGYLE_WEBHOOK_SECRET
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
  if (expected.length !== signature.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  }
  return diff === 0
}
