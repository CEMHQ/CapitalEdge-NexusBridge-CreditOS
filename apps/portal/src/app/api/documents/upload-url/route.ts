import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserRole } from '@/lib/auth/roles'
import { validateBody } from '@/lib/validation/validate'
import { requestUploadUrlSchema } from '@/lib/validation/schemas'
import { documentUploadLimiter } from '@/lib/rate-limit/index'
import { applyRateLimit } from '@/lib/rate-limit/apply'
import { emitAuditEvent } from '@/lib/audit/emit'

// Storage bucket per owner type
const BUCKET_MAP: Record<string, string> = {
  borrower:    'borrower-documents',
  investor:    'investor-documents',
  application: 'borrower-documents',
  loan:        'loan-documents',
}

export async function POST(request: Request) {
  const validation = await validateBody(request, requestUploadUrlSchema)
  if (!validation.success) return validation.response

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const blocked = await applyRateLimit(documentUploadLimiter, user.id)
  if (blocked) return blocked

  const role = await getUserRole(supabase, user.id)
  const { owner_type, owner_id, document_type, file_name, mime_type, file_size_bytes } = validation.data

  // Borrowers and investors can only upload for themselves
  if (!['admin', 'manager', 'underwriter'].includes(role) && owner_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const bucket = BUCKET_MAP[owner_type]
  if (!bucket) return NextResponse.json({ error: 'Invalid owner type' }, { status: 400 })

  const storagePath = `${owner_id}/${document_type}/${Date.now()}_${file_name}`

  const adminClient = createAdminClient()

  // Create document record first (upload_status: pending)
  const { data: doc, error: docError } = await adminClient
    .from('documents')
    .insert({
      owner_type,
      owner_id,
      document_type,
      file_name,
      storage_path: storagePath,
      mime_type,
      file_size_bytes,
      upload_status: 'pending',
      review_status: 'pending_review',
      uploaded_by: user.id,
    })
    .select('id')
    .single()

  if (docError || !doc) {
    return NextResponse.json({ error: 'Failed to create document record' }, { status: 500 })
  }

  // Generate signed upload URL — client uploads directly to Supabase Storage
  const { data: signedData, error: signedError } = await adminClient
    .storage
    .from(bucket)
    .createSignedUploadUrl(storagePath)

  if (signedError || !signedData) {
    // Clean up the pending document record
    await adminClient.from('documents').delete().eq('id', doc.id)
    return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 })
  }

  await emitAuditEvent({
    actorProfileId: user.id,
    eventType: 'document_action',
    entityType: 'document',
    entityId: doc.id,
    newValue: { action: 'upload_initiated', document_type, owner_type, owner_id },
  })

  return NextResponse.json({
    document_id: doc.id,
    upload_url: signedData.signedUrl,
    path: storagePath,
  })
}
