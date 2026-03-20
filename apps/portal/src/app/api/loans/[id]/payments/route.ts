import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserRole } from '@/lib/auth/roles'
import { validateBody } from '@/lib/validation/validate'
import { recordPaymentSchema } from '@/lib/validation/schemas'
import { recordPaymentLimiter } from '@/lib/rate-limit/index'
import { applyRateLimit } from '@/lib/rate-limit/apply'
import { emitAuditEvent } from '@/lib/audit/emit'
import { fireWorkflowTrigger } from '@/lib/workflows/engine'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (!['admin', 'manager', 'servicing'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('loan_id', id)
    .order('payment_date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ payments: data ?? [] })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const validation = await validateBody(request, recordPaymentSchema)
  if (!validation.success) return validation.response

  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (!['admin', 'manager', 'servicing'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const blocked = await applyRateLimit(recordPaymentLimiter, user.id)
  if (blocked) return blocked

  const data = validation.data

  // Verify loan exists and is active
  const { data: loan } = await supabase
    .from('loans')
    .select('id, loan_status, outstanding_balance, total_paid')
    .eq('id', id)
    .single()

  if (!loan) return NextResponse.json({ error: 'Loan not found' }, { status: 404 })
  if (!['active', 'delinquent', 'matured'].includes(loan.loan_status)) {
    return NextResponse.json({ error: 'Payments can only be recorded on active, delinquent, or matured loans' }, { status: 422 })
  }

  // Insert payment record (append-only — never mutate financial history)
  const { data: payment, error: payErr } = await supabase
    .from('payments')
    .insert({
      loan_id:              id,
      payment_schedule_id:  data.payment_schedule_id ?? null,
      payment_date:         data.payment_date,
      payment_amount:       data.payment_amount,
      principal_applied:    data.principal_applied,
      interest_applied:     data.interest_applied,
      fees_applied:         data.fees_applied,
      payment_method:       data.payment_method ?? null,
      external_reference:   data.external_reference ?? null,
      created_by:           user.id,
    })
    .select('id')
    .single()

  if (payErr || !payment) {
    return NextResponse.json({ error: payErr?.message ?? 'Failed to record payment' }, { status: 500 })
  }

  // Update loan balance
  const newBalance   = Number(loan.outstanding_balance) - Number(data.principal_applied)
  const newTotalPaid = Number(loan.total_paid) + Number(data.payment_amount)

  await supabase
    .from('loans')
    .update({
      outstanding_balance: Math.max(0, newBalance),
      total_paid:          newTotalPaid,
      updated_at:          new Date().toISOString(),
    })
    .eq('id', id)

  // Update linked schedule period if provided
  if (data.payment_schedule_id) {
    await supabase
      .from('payment_schedule')
      .update({ schedule_status: 'paid', updated_at: new Date().toISOString() })
      .eq('id', data.payment_schedule_id)
  }

  await emitAuditEvent({
    actorProfileId: user.id,
    eventType:      'payment_recorded',
    entityType:     'payment',
    entityId:       payment.id,
    eventPayload: {
      loan_id:           id,
      payment_amount:    data.payment_amount,
      payment_date:      data.payment_date,
      principal_applied: data.principal_applied,
      actor_role:        role,
    },
  })

  // Fire workflow triggers (fire-and-forget)
  void fireWorkflowTrigger('payment_received', {
    entity_type:    'loan',
    entity_id:      id,
    payment_id:     payment.id,
    payment_amount: data.payment_amount,
    actor_id:       user.id,
  })

  return NextResponse.json({ success: true, payment_id: payment.id }, { status: 201 })
}
