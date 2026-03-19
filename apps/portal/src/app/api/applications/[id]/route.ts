import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserRole } from '@/lib/auth/roles'
import { validateBody } from '@/lib/validation/validate'
import { updateApplicationStatusSchemaV2 } from '@/lib/validation/schemas'
import { updateLimiter } from '@/lib/rate-limit/index'
import { applyRateLimit } from '@/lib/rate-limit/apply'
import { emitAuditEvent } from '@/lib/audit/emit'
import { canTransitionApplication, canRoleTransitionApplication } from '@/lib/loan/state-machine'

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

  // Fetch current status to validate transition
  const { data: current } = await supabase
    .from('applications')
    .select('application_status, application_number')
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

  if (!canRoleTransitionApplication(role as any, current.application_status, application_status)) {
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

  // Auto-create underwriting case when moved to under_review
  if (application_status === 'under_review') {
    const adminClient = createAdminClient()
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
  }

  // Emit audit event
  await emitAuditEvent({
    actor_id:    user.id,
    actor_role:  role,
    event_type:  'application.status_changed',
    entity_type: 'application',
    entity_id:   id,
    payload: {
      from:  current.application_status,
      to:    application_status,
      notes: notes ?? null,
    },
  })

  return NextResponse.json({ success: true })
}
