import 'server-only'
import { createHmac, timingSafeEqual } from 'crypto'

export interface PersonaInquiryResult {
  inquiryId: string
  inquiryUrl: string  // URL for investor to complete verification
  status: 'created' | 'pending' | 'completed' | 'failed' | 'expired'
}

// Creates a Persona inquiry for identity verification.
// Returns the inquiry ID and a URL the investor visits to complete the flow.
export async function createPersonaInquiry(opts: {
  investorId: string
  email: string
  fullName: string
  referenceId: string  // kyc_verifications.id
}): Promise<PersonaInquiryResult> {
  const apiKey = process.env.PERSONA_API_KEY
  if (!apiKey) throw new Error('PERSONA_API_KEY not configured')

  const templateId = process.env.PERSONA_TEMPLATE_ID ?? ''

  const response = await fetch('https://withpersona.com/api/v1/inquiries', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Persona-Version': '2023-01-05',
    },
    body: JSON.stringify({
      data: {
        type: 'inquiry',
        attributes: {
          'inquiry-template-id': templateId,
          fields: {
            'name-full': opts.fullName,
            'email-address': opts.email,
          },
          'reference-id': opts.referenceId,
        },
      },
    }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => 'unknown error')
    throw new Error(`Persona API error ${response.status}: ${text}`)
  }

  const json = await response.json() as {
    data: {
      id: string
      attributes: {
        status: PersonaInquiryResult['status']
        'session-token': string
      }
    }
  }

  const inquiryId = json.data.id
  const sessionToken = json.data.attributes['session-token']
  const inquiryUrl = `https://withpersona.com/verify?inquiry-id=${inquiryId}&session-token=${sessionToken}`

  return {
    inquiryId,
    inquiryUrl,
    status: json.data.attributes.status,
  }
}

// Verifies the HMAC-SHA256 signature on an inbound Persona webhook.
// The signature header value is compared using a timing-safe comparison.
export function verifyPersonaWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  try {
    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    const expectedBuf = Buffer.from(expected, 'hex')
    const actualBuf = Buffer.from(signature, 'hex')
    if (expectedBuf.length !== actualBuf.length) return false
    return timingSafeEqual(expectedBuf, actualBuf)
  } catch {
    return false
  }
}
