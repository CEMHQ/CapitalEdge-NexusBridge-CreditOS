import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserRole } from '@/lib/auth/roles'
import { validateBody } from '@/lib/validation/validate'
import { updateConditionSchema } from '@/lib/validation/schemas'
import { underwritingLimiter } from '@/lib/rate-limit/index'
import { applyRateLimit } from '@/lib/rate-limit/apply'
import { emitAuditEvent } from '@/lib/audit/emit'
import { fireWorkflowTrigger } from '@/lib/workflows/engine'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; conditionId: string }> }
) {
  const validation = await validateBody(request, updateConditionSchema)
  if (!validation.success) return validation.response

  const { id: caseId, conditionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (!['admin', 'manager', 'underwriter'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const blocked = await applyRateLimit(underwritingLimiter, user.id)
  if (blocked) return blocked

  const { status, notes } = validation.data

  const { error } = await supabase
    .from('conditions')
    .update({
      status,
      notes:        notes ?? null,
      satisfied_at: ['satisfied', 'waived'].includes(status) ? new Date().toISOString() : null,
      updated_at:   new Date().toISOString(),
    })
    .eq('id', conditionId)
    .eq('case_id', caseId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await emitAuditEvent({
    actorProfileId: user.id,
    eventType:      'condition_updated',
    entityType:     'condition',
    entityId:       conditionId,
    eventPayload:   { case_id: caseId, status, notes: notes ?? null, actor_role: role },
  })

  void fireWorkflowTrigger('condition_updated', {
    entity_id:  conditionId,
    new_status: status,
  })

  return NextResponse.json({ success: true })
}
