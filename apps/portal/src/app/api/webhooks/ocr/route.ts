import 'server-only'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { applyRateLimit } from '@/lib/rate-limit/apply'
import { ocrWebhookLimiter } from '@/lib/rate-limit/index'
import { verifyOcrolusWebhook } from '@/lib/ocr/ocrolus'
import { verifyArgyleWebhook } from '@/lib/ocr/argyle'
import { fetchOcrolusResults } from '@/lib/ocr/ocrolus'
import { fetchArgyleResults } from '@/lib/ocr/argyle'

// POST /api/webhooks/ocr — provider callback when extraction completes
// Providers post to this URL after the extraction job finishes.
// Webhook URL is configured in the Ocrolus/Argyle provider dashboards.
// Authenticated via HMAC-SHA256 signature verification — no user session.
export async function POST(request: Request) {
  // Rate limit by a fixed key (no user ID; providers are trusted callers)
  const blocked = await applyRateLimit(ocrWebhookLimiter, 'ocr-provider')
  if (blocked) return blocked

  // Read body as text first for HMAC verification
  const rawBody = await request.text()

  // Determine provider from header (providers send a custom header or we infer from signature)
  const ocrolusSignature = request.headers.get('x-ocrolus-signature')
  const argyleSignature  = request.headers.get('x-argyle-signature')

  let provider: 'ocrolus' | 'argyle' | null = null

  if (ocrolusSignature) {
    const valid = await verifyOcrolusWebhook(rawBody, ocrolusSignature)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
    provider = 'ocrolus'
  } else if (argyleSignature) {
    const valid = await verifyArgyleWebhook(rawBody, argyleSignature)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
    provider = 'argyle'
  } else {
    return NextResponse.json({ error: 'Missing signature header' }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const p = payload as Record<string, unknown>
  const jobId = (p.id ?? p.book_uuid ?? p.job_id) as string | undefined
  const status = p.status as string | undefined

  if (!jobId) {
    return NextResponse.json({ error: 'Missing job ID in payload' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // Look up the extraction record by provider_job_id
  const { data: extraction, error: fetchError } = await adminClient
    .from('document_extractions')
    .select('id, extraction_status, document_id, provider_name')
    .eq('provider_job_id', jobId)
    .eq('provider_name', provider)
    .maybeSingle()

  if (fetchError) {
    console.error('[ocr webhook] DB lookup failed:', fetchError)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }

  if (!extraction) {
    // Unknown job ID — could be a replay or test ping; return 200 to acknowledge
    console.warn(`[ocr webhook] No extraction found for provider=${provider} job_id=${jobId}`)
    return NextResponse.json({ received: true })
  }

  // Idempotency — if already completed/failed, acknowledge without re-processing
  if (['completed', 'failed', 'reviewed', 'accepted', 'rejected'].includes(extraction.extraction_status)) {
    return NextResponse.json({ received: true })
  }

  const failed = status === 'failed' || status === 'error'

  if (failed) {
    const reason = (p.error ?? p.message ?? 'Provider reported failure') as string
    await adminClient
      .from('document_extractions')
      .update({
        extraction_status: 'failed',
        failure_reason:    reason,
      })
      .eq('id', extraction.id)

    return NextResponse.json({ received: true })
  }

  // Fetch results from provider
  try {
    let extractedJson: Record<string, unknown>
    let confidenceScore: number | null

    if (provider === 'ocrolus') {
      const results = await fetchOcrolusResults(jobId)
      extractedJson  = results.extractedJson
      confidenceScore = results.confidenceScore
    } else {
      const results = await fetchArgyleResults(jobId)
      extractedJson  = results.extractedJson
      confidenceScore = results.confidenceScore
    }

    // Persist extracted data — raw_text excluded (not returned by these providers' analytics endpoints)
    await adminClient
      .from('document_extractions')
      .update({
        extraction_status: 'completed',
        extracted_json:    extractedJson,
        confidence_score:  confidenceScore,
      })
      .eq('id', extraction.id)

    // Auto-generate field mappings from extracted data
    // Providers return a normalized structure we map to target fields
    const fieldMappings = buildFieldMappings(extraction.id, extractedJson, provider)

    if (fieldMappings.length > 0) {
      const { error: mappingsError } = await adminClient
        .from('extraction_field_mappings')
        .insert(fieldMappings)

      if (mappingsError) {
        console.error('[ocr webhook] Field mappings insert failed:', mappingsError)
        // Non-fatal — extraction result is still persisted
      }
    }

  } catch (err) {
    console.error('[ocr webhook] Failed to fetch provider results:', err)
    await adminClient
      .from('document_extractions')
      .update({
        extraction_status: 'failed',
        failure_reason:    err instanceof Error ? err.message : 'Failed to fetch results',
      })
      .eq('id', extraction.id)
  }

  return NextResponse.json({ received: true })
}

// Build extraction_field_mappings rows from provider result JSON.
// Each provider returns a different structure; this function normalizes it.
function buildFieldMappings(
  extractionId: string,
  data: Record<string, unknown>,
  provider: 'ocrolus' | 'argyle'
): Array<{
  extraction_id:   string
  source_field:    string
  target_entity:   string
  target_field:    string
  extracted_value: string | null
  confidence:      number | null
}> {
  const rows: ReturnType<typeof buildFieldMappings> = []

  if (provider === 'ocrolus') {
    // Ocrolus analytics returns income/transaction summaries under various keys
    // Common fields: gross_income, net_income, employer_name, monthly_deposits
    const mappable: Array<[string, string, string]> = [
      ['gross_income',      'application', 'annual_income'],
      ['net_income',        'application', 'net_income'],
      ['employer_name',     'borrower',    'employer_name'],
      ['monthly_deposits',  'application', 'monthly_revenue'],
      ['average_balance',   'application', 'average_bank_balance'],
    ]
    for (const [sourceKey, targetEntity, targetField] of mappable) {
      const val = getNestedValue(data, sourceKey)
      if (val !== undefined) {
        rows.push({
          extraction_id:   extractionId,
          source_field:    sourceKey,
          target_entity:   targetEntity,
          target_field:    targetField,
          extracted_value: val !== null ? String(val) : null,
          confidence:      null,
        })
      }
    }
  } else {
    // Argyle income-reports returns employment and income data
    const mappable: Array<[string, string, string]> = [
      ['employer',           'borrower',    'employer_name'],
      ['base_pay',           'application', 'annual_income'],
      ['gross_pay',          'application', 'gross_income'],
      ['pay_frequency',      'application', 'pay_frequency'],
    ]
    for (const [sourceKey, targetEntity, targetField] of mappable) {
      const val = getNestedValue(data, sourceKey)
      if (val !== undefined) {
        rows.push({
          extraction_id:   extractionId,
          source_field:    sourceKey,
          target_entity:   targetEntity,
          target_field:    targetField,
          extracted_value: val !== null ? String(val) : null,
          confidence:      null,
        })
      }
    }
  }

  return rows
}

function getNestedValue(obj: Record<string, unknown>, key: string): unknown {
  if (key in obj) return obj[key]
  // Try nested under summary/data wrappers common in both providers
  for (const wrapper of ['summary', 'data', 'analytics', 'income']) {
    const sub = obj[wrapper]
    if (sub && typeof sub === 'object' && !Array.isArray(sub)) {
      const nested = (sub as Record<string, unknown>)[key]
      if (nested !== undefined) return nested
    }
  }
  return undefined
}
