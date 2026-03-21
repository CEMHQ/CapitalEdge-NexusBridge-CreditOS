import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserRole } from '@/lib/auth/roles'
import { reviewAccreditationSchema } from '@/lib/validation/schemas'
import { updateLimiter } from '@/lib/rate-limit/index'
import { applyRateLimit } from '@/lib/rate-limit/apply'
import { emitAuditEvent } from '@/lib/audit/emit'
import { emitNotification } from '@/lib/notifications/emit'

export async function PATCH(
  request: Request,
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

  const blocked = await applyRateLimit(updateLimiter, user.id)
  if (blocked) return blocked

  const body = await request.json().catch(() => null)
  const parsed = reviewAccreditationSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }

  const { status, reviewer_notes, expires_at } = parsed.data

  const adminClient = createAdminClient()

  const { data: record } = await adminClient
    .from('accreditation_records')
    .select('id, investor_id, status, verification_method')
    .eq('id', id)
    .maybeSingle()

  if (!record) return NextResponse.json({ error: 'Record not found' }, { status: 404 })

  const now = new Date().toISOString()
  const updates: Record<string, unknown> = {
    status,
    reviewed_by:    user.id,
    reviewed_at:    now,
    updated_at:     now,
  }

  if (reviewer_notes) updates.reviewer_notes = reviewer_notes

  if (status === 'verified') {
    updates.verified_at = now
    // Default expiry: 90 days from today per SEC 506(c) guidance
    updates.expires_at = expires_at ?? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
  }

  const { error } = await adminClient
    .from('accreditation_records')
    .update(updates)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Sync accreditation_status on the investors table
  if (status === 'verified') {
    await adminClient
      .from('investors')
      .update({
        accreditation_status: 'verified',
        onboarding_status:    'complete',
        updated_at:           now,
      })
      .eq('id', record.investor_id)
  } else if (status === 'rejected') {
    await adminClient
      .from('investors')
      .update({
        accreditation_status: 'pending',
        onboarding_status:    'in_progress',
        updated_at:           now,
      })
      .eq('id', record.investor_id)
  }

  // Fetch investor profile_id for notification
  const { data: investor } = await adminClient
    .from('investors')
    .select('profile_id')
    .eq('id', record.investor_id)
    .single()

  if (investor?.profile_id) {
    const notificationMsg = status === 'verified'
      ? 'Your accreditation has been verified. You may now subscribe to NexusBridge Capital LP.'
      : status === 'rejected'
      ? `Your accreditation submission was not approved. ${reviewer_notes ? `Reason: ${reviewer_notes}` : 'Please contact support for details.'}`
      : 'Your accreditation submission is under review. We will notify you of the outcome.'

    void emitNotification({
      recipientProfileId: investor.profile_id,
      subject:            status === 'verified' ? 'Accreditation verified' : status === 'rejected' ? 'Accreditation not approved' : 'Accreditation under review',
      message:            notificationMsg,
      linkUrl:            '/dashboard/investor/compliance',
    })
  }

  void emitAuditEvent({
    actorProfileId: user.id,
    eventType:      status === 'verified' ? 'accreditation_verified' : 'accreditation_updated',
    entityType:     'investor',
    entityId:       record.investor_id,
    oldValue:       { status: record.status },
    newValue:       { status, record_id: id },
  })

  return NextResponse.json({ success: true })
}
