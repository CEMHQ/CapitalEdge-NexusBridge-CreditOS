import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserRole } from '@/lib/auth/roles'
import { validateBody } from '@/lib/validation/validate'
import { createDrawSchema } from '@/lib/validation/schemas'
import { updateLimiter } from '@/lib/rate-limit/index'
import { applyRateLimit } from '@/lib/rate-limit/apply'
import { emitAuditEvent } from '@/lib/audit/emit'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const validation = await validateBody(request, createDrawSchema)
  if (!validation.success) return validation.response

  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (!['admin', 'manager', 'servicing'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const blocked = await applyRateLimit(updateLimiter, user.id)
  if (blocked) return blocked

  const { data: loan } = await supabase
    .from('loans')
    .select('loan_status')
    .eq('id', id)
    .single()

  if (!loan) return NextResponse.json({ error: 'Loan not found' }, { status: 404 })
  if (loan.loan_status !== 'active') {
    return NextResponse.json({ error: 'Draws can only be requested on active loans' }, { status: 422 })
  }

  const { data: draw, error } = await supabase
    .from('draws')
    .insert({
      loan_id:     id,
      draw_amount: validation.data.draw_amount,
      description: validation.data.description ?? null,
      created_by:  user.id,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await emitAuditEvent({
    actorProfileId: user.id,
    eventType:      'draw_action',
    entityType:     'draw',
    entityId:       draw.id,
    eventPayload:   { loan_id: id, draw_amount: validation.data.draw_amount, action: 'requested', actor_role: role },
  })

  return NextResponse.json({ success: true, draw_id: draw.id }, { status: 201 })
}
