import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserRole } from '@/lib/auth/roles'
import { validateBody } from '@/lib/validation/validate'
import { recordDecisionSchema } from '@/lib/validation/schemas'
import { underwritingLimiter } from '@/lib/rate-limit/index'
import { applyRateLimit } from '@/lib/rate-limit/apply'
import { emitAuditEvent } from '@/lib/audit/emit'

// Status map: decision type → application status
const DECISION_STATUS_MAP: Record<string, string> = {
  conditional_approval: 'conditionally_approved',
  approval:             'approved',
  decline:              'declined',
  hold:                 'under_review',
  override:             'approved',
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const validation = await validateBody(request, recordDecisionSchema)
  if (!validation.success) return validation.response

  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (!['admin', 'manager', 'underwriter'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const blocked = await applyRateLimit(underwritingLimiter, user.id)
  if (blocked) return blocked

  // Find underwriting case
  const { data: uwCase } = await supabase
    .from('underwriting_cases')
    .select('id')
    .eq('application_id', id)
    .maybeSingle()

  if (!uwCase) {
    return NextResponse.json({ error: 'No underwriting case found for this application' }, { status: 404 })
  }

  const data = validation.data

  // Insert decision record
  const { data: decision, error: decisionErr } = await supabase
    .from('underwriting_decisions')
    .insert({
      case_id:              uwCase.id,
      decision_type:        data.decision_type,
      approved_amount:      data.approved_amount ?? null,
      approved_rate:        data.approved_rate ?? null,
      approved_term_months: data.approved_term_months ?? null,
      approved_ltv:         data.approved_ltv ?? null,
      approved_ltc:         data.approved_ltc ?? null,
      conditions_summary:   data.conditions_summary ?? null,
      decision_notes:       data.decision_notes ?? null,
      decided_by:           user.id,
      created_by:           user.id,
    })
    .select('id')
    .single()

  if (decisionErr) return NextResponse.json({ error: decisionErr.message }, { status: 500 })

  // Update case status to decision_made
  await supabase
    .from('underwriting_cases')
    .update({ case_status: 'decision_made', updated_at: new Date().toISOString() })
    .eq('id', uwCase.id)

  // Update application status to match decision
  const newAppStatus = DECISION_STATUS_MAP[data.decision_type]
  if (newAppStatus) {
    await supabase
      .from('applications')
      .update({ application_status: newAppStatus, updated_at: new Date().toISOString() })
      .eq('id', id)
  }

  await emitAuditEvent({
    actorProfileId: user.id,
    eventType:      'underwriting_decision',
    entityType:     'underwriting_decision',
    entityId:       decision.id,
    eventPayload:   { application_id: id, case_id: uwCase.id, decision_type: data.decision_type, actor_role: role },
  })

  return NextResponse.json({ success: true, decision_id: decision.id })
}
