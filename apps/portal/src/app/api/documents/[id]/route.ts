import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserRole } from '@/lib/auth/roles'
import { validateBody } from '@/lib/validation/validate'
import { reviewDocumentSchema } from '@/lib/validation/schemas'
import { emitAuditEvent } from '@/lib/audit/emit'
import { sendDocumentReviewEmail } from '@/lib/email'

const BUCKET_MAP: Record<string, string> = {
  borrower:    'borrower-documents',
  investor:    'investor-documents',
  application: 'borrower-documents',
  loan:        'loan-documents',
}

// GET /api/documents/[id] — fetch metadata + signed download URL
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)

  const { data: doc, error } = await supabase
    .from('documents')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Non-admin can only access their own documents
  if (!['admin', 'manager', 'underwriter', 'servicing'].includes(role) && doc.uploaded_by !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Generate signed download URL (1 hour expiry)
  const adminClient = createAdminClient()
  const bucket = BUCKET_MAP[doc.owner_type] ?? 'borrower-documents'
  const { data: signedData } = await adminClient
    .storage
    .from(bucket)
    .createSignedUrl(doc.storage_path, 3600)

  return NextResponse.json({ ...doc, download_url: signedData?.signedUrl ?? null })
}

// PATCH /api/documents/[id] — confirm upload or update review status
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

  // Confirm upload — called by client after direct upload to Storage succeeds
  if (body.action === 'confirm') {
    const { data: doc } = await supabase.from('documents').select('uploaded_by').eq('id', id).single()
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (doc.uploaded_by !== user.id && !['admin', 'manager'].includes(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const adminClient = createAdminClient()
    await adminClient.from('documents').update({
      upload_status: 'uploaded',
      updated_at: new Date().toISOString(),
    }).eq('id', id)

    await emitAuditEvent({
      actorProfileId: user.id,
      eventType: 'document_action',
      entityType: 'document',
      entityId: id,
      newValue: { action: 'upload_confirmed' },
    })

    return NextResponse.json({ success: true })
  }

  // Review — admin/underwriter only
  if (!['admin', 'manager', 'underwriter'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const validation = reviewDocumentSchema.safeParse(body)
  if (!validation.success) {
    return NextResponse.json({ error: 'Invalid data', issues: validation.error.issues }, { status: 400 })
  }

  const { review_status, rejection_reason } = validation.data
  const adminClient = createAdminClient()

  const { data: existing } = await adminClient
    .from('documents')
    .select('review_status, file_name, uploaded_by')
    .eq('id', id)
    .single()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await adminClient.from('documents').update({
    review_status,
    rejection_reason: rejection_reason ?? null,
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', id)

  await emitAuditEvent({
    actorProfileId: user.id,
    eventType: 'document_action',
    entityType: 'document',
    entityId: id,
    oldValue: { review_status: existing.review_status },
    newValue: { review_status, rejection_reason },
  })

  // Fire-and-forget uploader notification
  if (existing.uploaded_by) {
    const { data: uploaderProfile } = await adminClient
      .from('profiles')
      .select('full_name, email')
      .eq('id', existing.uploaded_by)
      .single()
    if (uploaderProfile?.email) {
      sendDocumentReviewEmail({
        uploaderEmail:    uploaderProfile.email,
        uploaderName:     uploaderProfile.full_name ?? '',
        fileName:         existing.file_name,
        reviewStatus:     review_status,
        rejectionReason:  rejection_reason ?? null,
      })
    }
  }

  return NextResponse.json({ success: true })
}
