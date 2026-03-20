import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserRole } from '@/lib/auth/roles'
import { validateBody } from '@/lib/validation/validate'
import { updateApplicationStatusSchemaV2 } from '@/lib/validation/schemas'
import { updateLimiter } from '@/lib/rate-limit/index'
import { applyRateLimit } from '@/lib/rate-limit/apply'
import { emitAuditEvent } from '@/lib/audit/emit'
import { emitNotification } from '@/lib/notifications/emit'
import { fireWorkflowTrigger } from '@/lib/workflows/engine'
import { canTransitionApplication, canRoleTransitionApplication } from '@/lib/loan/state-machine'
import { sendApplicationStatusEmail } from '@/lib/email'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const validation = await validateBody(request, updateApplicationStatusSchemaV2)
  if (!validation.success) return validation.response

  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const role = await getUserRole(supabase, user.id)
  if (!['admin', 'manager', 'underwriter'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const blocked = await applyRateLimit(updateLimiter, user.id)
  if (blocked) return blocked

  const { application_status, notes } = validation.data

  // Fetch current application status
  const { data: current } = await supabase
    .from('applications')
    .select('application_status, application_number, borrower_id')
    .eq('id', id)
    .single()

  if (!current) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  }

  if (!canTransitionApplication(current.application_status, application_status)) {
    return NextResponse.json(
      { error: `Invalid status transition: ${current.application_status} → ${application_status}` },
      { status: 422 }
    )
  }

  if (!canRoleTransitionApplication(role as any, application_status)) {
    return NextResponse.json(
      { error: 'Your role is not permitted to make this status change' },
      { status: 403 }
    )
  }

  const updatePayload: Record<string, unknown> = {
    application_status,
    updated_at: new Date().toISOString(),
  }
  if (application_status === 'submitted') {
    updatePayload.submitted_at = new Date().toISOString()
  }

  const { error } = await supabase
    .from('applications')
    .update(updatePayload)
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Auto-create underwriting case + sync document statuses when moved to under_review
  if (application_status === 'under_review') {
    const adminClient = createAdminClient()

    // Auto-create underwriting case if not already present
    const { data: existing } = await adminClient
      .from('underwriting_cases')
      .select('id')
      .eq('application_id', id)
      .maybeSingle()

    if (!existing) {
      await adminClient.from('underwriting_cases').insert({
        application_id: id,
        case_status:    'open',
        priority:       'normal',
        created_by:     user.id,
      })
    }

    // Move all pending documents linked to this application into under_review
    await adminClient
      .from('documents')
      .update({ review_status: 'under_review', updated_at: new Date().toISOString() })
      .eq('owner_type', 'application')
      .eq('owner_id', id)
      .eq('review_status', 'pending_review')

    // Also sync borrower-level docs uploaded by the borrower's profile
    const { data: borrower } = await adminClient
      .from('borrowers')
      .select('profile_id')
      .eq('id', current.borrower_id!)
      .single()

    if (borrower?.profile_id) {
      await adminClient
        .from('documents')
        .update({ review_status: 'under_review', updated_at: new Date().toISOString() })
        .eq('owner_type', 'borrower')
        .eq('uploaded_by', borrower.profile_id)
        .eq('review_status', 'pending_review')
    }
  }

  // Emit audit event
  await emitAuditEvent({
    actorProfileId: user.id,
    eventType:      'application_status_change',
    entityType:     'application',
    entityId:       id,
    eventPayload: {
      from:       current.application_status,
      to:         application_status,
      notes:      notes ?? null,
      actor_role: role,
    },
  })

  // Fire-and-forget borrower notification — does not block response.
  // applications → borrowers → profiles (two-hop join)
  if (current.borrower_id) {
    void (async () => {
      try {
        const adminClient = createAdminClient()
        const { data: bRow } = await adminClient
          .from('borrowers')
          .select('profile_id, profiles!profile_id ( full_name, email )')
          .eq('id', current.borrower_id!)
          .single()
        const profile = Array.isArray(bRow?.profiles) ? bRow?.profiles[0] : bRow?.profiles
        if (profile?.email) {
          await sendApplicationStatusEmail({
            borrowerEmail:     profile.email,
            borrowerName:      profile.full_name ?? '',
            applicationNumber: current.application_number,
            applicationId:     id,
            newStatus:         application_status,
            notes:             notes ?? null,
          })
        }
        if (bRow?.profile_id) {
          const statusLabel = application_status.replace(/_/g, ' ')
          await emitNotification({
            recipientProfileId: bRow.profile_id,
            subject:  `Application #${current.application_number} updated`,
            message:  `Your application status has changed to: ${statusLabel}.${notes ? ` Note: ${notes}` : ''}`,
            linkUrl:  `/dashboard/borrower/applications/${id}`,
          })
        }
      } catch {
        // notification failure must not surface to caller
      }
    })()
  }

  // Fire workflow triggers (fire-and-forget)
  void fireWorkflowTrigger('application_status_changed', {
    entity_type: 'application',
    entity_id:   id,
    old_status:  current.application_status,
    new_status:  application_status,
    actor_id:    user.id,
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

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const role = await getUserRole(supabase, user.id)
  if (!['admin', 'manager'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const adminClient = createAdminClient()

  // Block deletion if a loan record exists (ON DELETE RESTRICT in DB)
  const { data: existingLoan } = await adminClient
    .from('loans')
    .select('id')
    .eq('application_id', id)
    .limit(1)
    .maybeSingle()

  if (existingLoan) {
    return NextResponse.json(
      { error: 'Cannot delete an application that has a loan record. Close the loan first.' },
      { status: 409 }
    )
  }

  // Delete documents linked to this application (no FK cascade)
  const { error: docsError } = await adminClient
    .from('documents')
    .delete()
    .eq('owner_type', 'application')
    .eq('owner_id', id)

  if (docsError) {
    return NextResponse.json({ error: docsError.message }, { status: 500 })
  }

  // Delete loan_requests (no FK cascade)
  const { error: lrError } = await adminClient
    .from('loan_requests')
    .delete()
    .eq('application_id', id)

  if (lrError) {
    return NextResponse.json({ error: lrError.message }, { status: 500 })
  }

  // Delete properties (no FK cascade)
  const { error: propError } = await adminClient
    .from('properties')
    .delete()
    .eq('application_id', id)

  if (propError) {
    return NextResponse.json({ error: propError.message }, { status: 500 })
  }

  // Delete the application (underwriting_cases cascade automatically)
  const { error: appError } = await adminClient
    .from('applications')
    .delete()
    .eq('id', id)

  if (appError) {
    return NextResponse.json({ error: appError.message }, { status: 500 })
  }

  emitAuditEvent({
    actorProfileId: user.id,
    eventType:      'application_status_change',
    entityType:     'application',
    entityId:       id,
    eventPayload:   { action: 'deleted' },
  })

  return NextResponse.json({ success: true })
}
