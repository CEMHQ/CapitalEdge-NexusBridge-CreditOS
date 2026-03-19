import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserRole } from '@/lib/auth/roles'
import { validateBody } from '@/lib/validation/validate'
import { updateDrawSchema } from '@/lib/validation/schemas'
import { updateLimiter } from '@/lib/rate-limit/index'
import { applyRateLimit } from '@/lib/rate-limit/apply'
import { emitAuditEvent } from '@/lib/audit/emit'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; drawId: string }> }
) {
  const validation = await validateBody(request, updateDrawSchema)
  if (!validation.success) return validation.response

  const { id: loanId, drawId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (!['admin', 'manager', 'servicing'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const blocked = await applyRateLimit(updateLimiter, user.id)
  if (blocked) return blocked

  const { draw_status, notes } = validation.data

  const updatePayload: Record<string, unknown> = {
    draw_status,
    notes:      notes ?? null,
    updated_at: new Date().toISOString(),
  }

  if (draw_status === 'approved') {
    updatePayload.approved_by = user.id
    updatePayload.approved_at = new Date().toISOString()
  }
  if (draw_status === 'funded') {
    updatePayload.funded_at = new Date().toISOString()
  }

  const { error } = await supabase
    .from('draws')
    .update(updatePayload)
    .eq('id', drawId)
    .eq('loan_id', loanId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await emitAuditEvent({
    actor_id:    user.id,
    actor_role:  role,
    event_type:  'loan.draw_updated',
    entity_type: 'draw',
    entity_id:   drawId,
    payload:     { loan_id: loanId, draw_status },
  })

  return NextResponse.json({ success: true })
}
