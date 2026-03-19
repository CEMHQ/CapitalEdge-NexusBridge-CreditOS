import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserRole } from '@/lib/auth/roles'
import { validateBody } from '@/lib/validation/validate'
import { updateLoanStatusSchema } from '@/lib/validation/schemas'
import { updateLimiter } from '@/lib/rate-limit/index'
import { applyRateLimit } from '@/lib/rate-limit/apply'
import { emitAuditEvent } from '@/lib/audit/emit'
import { canTransitionLoan, canRoleTransitionLoan } from '@/lib/loan/state-machine'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const validation = await validateBody(request, updateLoanStatusSchema)
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
    .select('loan_status, loan_number')
    .eq('id', id)
    .single()

  if (!loan) return NextResponse.json({ error: 'Loan not found' }, { status: 404 })

  const { loan_status, notes } = validation.data

  if (!canTransitionLoan(loan.loan_status, loan_status)) {
    return NextResponse.json(
      { error: `Invalid status transition: ${loan.loan_status} → ${loan_status}` },
      { status: 422 }
    )
  }

  if (!canRoleTransitionLoan(role as any, loan.loan_status, loan_status)) {
    return NextResponse.json(
      { error: 'Your role is not permitted to make this status change' },
      { status: 403 }
    )
  }

  const updatePayload: Record<string, unknown> = {
    loan_status,
    updated_at: new Date().toISOString(),
  }

  // Set payoff_date when loan is paid off
  if (loan_status === 'paid_off') {
    updatePayload.payoff_date = new Date().toISOString().split('T')[0]
  }

  const { error } = await supabase
    .from('loans')
    .update(updatePayload)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await emitAuditEvent({
    actor_id:    user.id,
    actor_role:  role,
    event_type:  'loan.status_changed',
    entity_type: 'loan',
    entity_id:   id,
    payload: { from: loan.loan_status, to: loan_status, notes: notes ?? null },
  })

  return NextResponse.json({ success: true })
}
