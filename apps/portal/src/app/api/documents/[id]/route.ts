import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserRole } from '@/lib/auth/roles'
import { reviewDocumentSchema } from '@/lib/validation/schemas'
import { emitAuditEvent } from '@/lib/audit/emit'
import { emitNotification } from '@/lib/notifications/emit'
import { fireWorkflowTrigger } from '@/lib/workflows/engine'
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

  const adminClient = createAdminClient()

  // Generate signed download URL (1 hour expiry)
  const bucket = BUCKET_MAP[doc.owner_type] ?? 'borrower-documents'
  const { data: signedData } = await adminClient
    .storage
    .from(bucket)
    .createSignedUrl(doc.storage_path, 3600)

  // Enrich with owner label so the UI can show which entity this belongs to
  let ownerLabel: string = doc.owner_type
  let ownerLink: string | null = null

  if (doc.owner_type === 'application') {
    const { data: app } = await adminClient
      .from('applications')
      .select('application_number')
      .eq('id', doc.owner_id)
      .single()
    if (app) {
      ownerLabel = app.application_number
      ownerLink  = `/dashboard/admin/applications/${doc.owner_id}`
    }
  } else if (doc.owner_type === 'borrower') {
    // uploaded_by (profile_id) → borrowers → most-recent application
    const { data: borrower } = await adminClient
      .from('borrowers')
      .select('id')
      .eq('profile_id', doc.uploaded_by)
      .maybeSingle()
    if (borrower) {
      const { data: app } = await adminClient
        .from('applications')
        .select('id, application_number')
        .eq('borrower_id', borrower.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (app) {
        ownerLabel = app.application_number
        ownerLink  = `/dashboard/admin/applications/${app.id}`
      }
    }
  } else if (doc.owner_type === 'loan') {
    const { data: loan } = await adminClient
      .from('loans')
      .select('loan_number')
      .eq('id', doc.owner_id)
      .single()
    if (loan) {
      ownerLabel = loan.loan_number ?? `Loan`
      ownerLink  = `/dashboard/servicing/loans/${doc.owner_id}`
    }
  }

  return NextResponse.json({
    ...doc,
    download_url: signedData?.signedUrl ?? null,
    owner_label:  ownerLabel,
    owner_link:   ownerLink,
  })
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
    const { data: doc } = await supabase
      .from('documents')
      .select('uploaded_by, owner_type')
      .eq('id', id)
      .single()
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (doc.uploaded_by !== user.id && !['admin', 'manager'].includes(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const adminClient = createAdminClient()

    // Derive the correct initial review_status based on the borrower's application status.
    // If the application is already under_review, start the doc there too instead of pending_review.
    let reviewStatus = 'pending_review'
    if (doc.owner_type === 'borrower' && doc.uploaded_by) {
      const { data: borrower } = await adminClient
        .from('borrowers')
        .select('id')
        .eq('profile_id', doc.uploaded_by)
        .maybeSingle()
      if (borrower) {
        const { data: app } = await adminClient
          .from('applications')
          .select('application_status')
          .eq('borrower_id', borrower.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (app?.application_status === 'under_review') {
          reviewStatus = 'under_review'
        }
      }
    }

    await adminClient.from('documents').update({
      upload_status: 'uploaded',
      review_status: reviewStatus,
      updated_at: new Date().toISOString(),
    }).eq('id', id)

    await emitAuditEvent({
      actorProfileId: user.id,
      eventType: 'document_action',
      entityType: 'document',
      entityId: id,
      newValue: { action: 'upload_confirmed' },
    })

    void fireWorkflowTrigger('document_uploaded', {
      entity_type: 'document',
      entity_id:   id,
      owner_type:  doc.owner_type,
      actor_id:    user.id,
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

  const { error: updateError } = await adminClient.from('documents').update({
    review_status,
    rejection_reason: rejection_reason ?? null,
    reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', id)

  if (updateError) {
    console.error('[documents] Update failed:', updateError)
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  await emitAuditEvent({
    actorProfileId: user.id,
    eventType: 'document_action',
    entityType: 'document',
    entityId: id,
    oldValue: { review_status: existing.review_status },
    newValue: { review_status, rejection_reason },
  })

  // Fire-and-forget uploader email + in-app notification
  if (existing.uploaded_by) {
    void (async () => {
      try {
        const { data: uploaderProfile } = await adminClient
          .from('profiles')
          .select('full_name, email')
          .eq('id', existing.uploaded_by!)
          .single()
        if (uploaderProfile?.email) {
          await sendDocumentReviewEmail({
            uploaderEmail:    uploaderProfile.email,
            uploaderName:     uploaderProfile.full_name ?? '',
            fileName:         existing.file_name,
            reviewStatus:     review_status,
            rejectionReason:  rejection_reason ?? null,
          })
        } else {
          console.warn('[documents] No email found for uploader:', existing.uploaded_by)
        }
      } catch (err) {
        console.error('[documents] Failed to send review email:', err)
      }
    })()

    const statusLabel = review_status === 'verified' ? 'approved' : 'rejected'
    void emitNotification({
      recipientProfileId: existing.uploaded_by,
      subject:            `Document ${statusLabel}`,
      message:            review_status === 'verified'
        ? `Your document "${existing.file_name}" has been verified.`
        : `Your document "${existing.file_name}" was rejected${rejection_reason ? `: ${rejection_reason}` : '.'}`,
      linkUrl:            '/dashboard/borrower/documents',
    })
  }

  void fireWorkflowTrigger('document_reviewed', {
    entity_type:      'document',
    entity_id:        id,
    review_status,
    uploader_id:      existing.uploaded_by,
    actor_id:         user.id,
  })

  return NextResponse.json({ success: true })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (!['admin', 'manager'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const adminClient = createAdminClient()

  const { data: doc, error: fetchError } = await adminClient
    .from('documents')
    .select('storage_path, owner_type')
    .eq('id', id)
    .single()

  if (fetchError || !doc) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const bucket = BUCKET_MAP[doc.owner_type] ?? 'borrower-documents'

  const { error: storageError } = await adminClient
    .storage
    .from(bucket)
    .remove([doc.storage_path])

  if (storageError) {
    return NextResponse.json({ error: storageError.message }, { status: 500 })
  }

  const { error: dbError } = await adminClient
    .from('documents')
    .delete()
    .eq('id', id)

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  emitAuditEvent({
    actorProfileId: user.id,
    eventType:      'document_action',
    entityType:     'document',
    entityId:       id,
    newValue:       { action: 'deleted' },
  })

  return NextResponse.json({ success: true })
}
