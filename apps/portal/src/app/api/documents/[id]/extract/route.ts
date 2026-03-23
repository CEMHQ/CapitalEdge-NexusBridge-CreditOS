import 'server-only'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserRole } from '@/lib/auth/roles'
import { applyRateLimit } from '@/lib/rate-limit/apply'
import { extractionTriggerLimiter } from '@/lib/rate-limit/index'
import { triggerExtractionSchema } from '@/lib/validation/schemas'
import { emitAuditEvent } from '@/lib/audit/emit'
import { submitOcrolusDocument, type OcrolusDocumentType } from '@/lib/ocr/ocrolus'
import { submitArgyleDocument } from '@/lib/ocr/argyle'

const BUCKET_MAP: Record<string, string> = {
  borrower:    'borrower-documents',
  investor:    'investor-documents',
  application: 'borrower-documents',
  loan:        'loan-documents',
}

// Ocrolus supports these document types for structured extraction
const OCROLUS_DOC_TYPE_MAP: Record<string, OcrolusDocumentType | null> = {
  bank_statement: 'bank_statement',
  tax_return:     'tax_return',
  pay_stub:       'pay_stub',
  w2:             'pay_stub',   // closest match
  other:          null,
}

// POST /api/documents/[id]/extract — trigger OCR extraction for a document
// Restricted to admin, manager, underwriter
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (!['admin', 'manager', 'underwriter'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const blocked = await applyRateLimit(extractionTriggerLimiter, user.id)
  if (blocked) return blocked

  const body = await request.json().catch(() => null)
  const parsed = triggerExtractionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 })
  }

  const { provider } = parsed.data
  const adminClient = createAdminClient()

  // Load document and verify it exists and is uploaded
  const { data: doc, error: docError } = await adminClient
    .from('documents')
    .select('id, file_name, document_type, owner_type, storage_path, upload_status, review_status')
    .eq('id', id)
    .single()

  if (docError || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  if (doc.upload_status !== 'uploaded') {
    return NextResponse.json({ error: 'Document has not been uploaded yet' }, { status: 422 })
  }

  // For manual provider, create a pending extraction record with no provider job
  if (provider === 'manual') {
    const { data: extraction, error: insertError } = await adminClient
      .from('document_extractions')
      .insert({
        document_id:       id,
        provider_name:     'manual',
        extraction_status: 'completed',
        created_by:        user.id,
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('[extract] Manual extraction insert failed:', insertError)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    await emitAuditEvent({
      actorProfileId: user.id,
      eventType:      'extraction_triggered',
      entityType:     'document',
      entityId:       id,
      newValue:       { provider: 'manual', extraction_id: extraction.id },
    })

    return NextResponse.json({ extraction_id: extraction.id, status: 'completed' })
  }

  // Generate a short-lived signed URL for the provider to fetch the file
  const bucket = BUCKET_MAP[doc.owner_type] ?? 'borrower-documents'
  const { data: signedData, error: signedError } = await adminClient
    .storage
    .from(bucket)
    .createSignedUrl(doc.storage_path, 3600) // 1 hour for provider to fetch

  if (signedError || !signedData?.signedUrl) {
    console.error('[extract] Failed to generate signed URL:', signedError)
    return NextResponse.json({ error: 'Failed to generate download URL' }, { status: 500 })
  }

  // Create the extraction record in 'processing' state
  const { data: extraction, error: insertError } = await adminClient
    .from('document_extractions')
    .insert({
      document_id:       id,
      provider_name:     provider,
      extraction_status: 'processing',
      created_by:        user.id,
    })
    .select('id')
    .single()

  if (insertError) {
    console.error('[extract] Extraction insert failed:', insertError)
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // Submit to provider — update to failed if submission fails
  try {
    let jobId: string

    if (provider === 'ocrolus') {
      const docType = OCROLUS_DOC_TYPE_MAP[doc.document_type ?? 'other']
      if (!docType) {
        await adminClient
          .from('document_extractions')
          .update({
            extraction_status: 'failed',
            failure_reason: `Document type "${doc.document_type}" is not supported by Ocrolus`,
          })
          .eq('id', extraction.id)
        return NextResponse.json({ error: 'Document type not supported by Ocrolus' }, { status: 422 })
      }
      const result = await submitOcrolusDocument({
        documentId:   extraction.id,
        storageUrl:   signedData.signedUrl,
        documentType: docType,
      })
      jobId = result.jobId
    } else {
      // argyle
      const result = await submitArgyleDocument({
        documentId:  extraction.id,
        storageUrl:  signedData.signedUrl,
      })
      jobId = result.jobId
    }

    // Persist the provider job ID so the webhook can correlate it
    await adminClient
      .from('document_extractions')
      .update({ provider_job_id: jobId })
      .eq('id', extraction.id)

    await emitAuditEvent({
      actorProfileId: user.id,
      eventType:      'extraction_triggered',
      entityType:     'document',
      entityId:       id,
      newValue:       { provider, extraction_id: extraction.id, job_id: jobId },
    })

    return NextResponse.json({ extraction_id: extraction.id, status: 'processing' })

  } catch (err) {
    console.error('[extract] Provider submission failed:', err)
    await adminClient
      .from('document_extractions')
      .update({
        extraction_status: 'failed',
        failure_reason:    err instanceof Error ? err.message : 'Unknown error',
      })
      .eq('id', extraction.id)

    return NextResponse.json({ error: 'Failed to submit to provider' }, { status: 502 })
  }
}
