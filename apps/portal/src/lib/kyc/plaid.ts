import 'server-only'
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid'
import { createHash } from 'crypto'
import { importJWK, jwtVerify } from 'jose'

function getPlaidClient(): PlaidApi {
  const env = (process.env.PLAID_ENVIRONMENT ?? 'sandbox') as keyof typeof PlaidEnvironments
  return new PlaidApi(
    new Configuration({
      basePath: PlaidEnvironments[env],
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID ?? '',
          'PLAID-SECRET':    process.env.PLAID_SECRET ?? '',
        },
      },
    })
  )
}

export interface PlaidIdvResult {
  sessionId:    string
  shareableUrl: string
  status:       string
}

// Creates a Plaid Identity Verification session.
// Returns the session ID and the shareable URL the investor visits to complete verification.
export async function createPlaidIdvSession(opts: {
  email:      string
  fullName:   string
  referenceId: string  // kyc_verifications.id — used as client_user_id
}): Promise<PlaidIdvResult> {
  const templateId = process.env.PLAID_IDV_TEMPLATE_ID
  if (!templateId) throw new Error('PLAID_IDV_TEMPLATE_ID not configured')

  const client = getPlaidClient()

  // Split full name into given / family for Plaid's name object
  const parts      = opts.fullName.trim().split(/\s+/)
  const givenName  = parts[0] ?? ''
  const familyName = parts.slice(1).join(' ') || givenName

  const { data } = await client.identityVerificationCreate({
    template_id:   templateId,
    is_shareable:  true,
    gave_consent:  true,
    user: {
      client_user_id: opts.referenceId,
      email_address:  opts.email,
      name: {
        given_name:  givenName,
        family_name: familyName,
      },
    },
  })

  return {
    sessionId:    data.id,
    shareableUrl: data.shareable_url ?? '',
    status:       data.status,
  }
}

// Retrieves an existing IDV session by ID.
export async function getPlaidIdvSession(sessionId: string) {
  const client = getPlaidClient()
  const { data } = await client.identityVerificationGet({ identity_verification_id: sessionId })
  return data
}

// Verifies a Plaid webhook JWT signature.
// Plaid signs webhooks with ES256. The JWT payload contains request_body_sha256
// which must match the SHA-256 of the raw request body.
export async function verifyPlaidWebhook(rawBody: string, token: string): Promise<boolean> {
  try {
    // Decode the JWT header (without verification) to extract the key_id
    const [headerB64] = token.split('.')
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString()) as { kid?: string; alg?: string }
    if (!header.kid) return false

    // Fetch Plaid's public JWK for this key_id
    const client = getPlaidClient()
    const { data: keyData } = await client.webhookVerificationKeyGet({ key_id: header.kid })

    // Import and verify the JWT
    const publicKey = await importJWK(
      keyData.key as Parameters<typeof importJWK>[0],
      'ES256'
    )
    const { payload } = await jwtVerify(token, publicKey, { algorithms: ['ES256'] })

    // Verify the body hash matches
    const bodyHash = createHash('sha256').update(rawBody).digest('hex')
    return (payload as { request_body_sha256?: string }).request_body_sha256 === bodyHash
  } catch {
    return false
  }
}
