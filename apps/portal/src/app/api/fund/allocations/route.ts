import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserRole } from '@/lib/auth/roles'
import { validateBody } from '@/lib/validation/validate'
import { createAllocationSchema } from '@/lib/validation/schemas'
import { updateLimiter } from '@/lib/rate-limit/index'
import { applyRateLimit } from '@/lib/rate-limit/apply'
import { emitAuditEvent } from '@/lib/audit/emit'

export async function POST(request: Request) {
  const validation = await validateBody(request, createAllocationSchema)
  if (!validation.success) return validation.response

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (!['admin', 'manager'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const blocked = await applyRateLimit(updateLimiter, user.id)
  if (blocked) return blocked

  const { subscription_id, loan_id, allocation_amount, allocation_date } = validation.data

  // Verify subscription is in an allocatable state
  const { data: sub } = await supabase
    .from('fund_subscriptions')
    .select('id, subscription_status, commitment_amount, funded_amount')
    .eq('id', subscription_id)
    .single()

  if (!sub) return NextResponse.json({ error: 'Subscription not found' }, { status: 404 })

  if (!['approved', 'active'].includes(sub.subscription_status)) {
    return NextResponse.json(
      { error: 'Subscription must be approved or active to allocate capital' },
      { status: 422 }
    )
  }

  const newFunded = Number(sub.funded_amount) + allocation_amount
  if (newFunded > Number(sub.commitment_amount)) {
    return NextResponse.json(
      { error: `Allocation would exceed commitment ($${sub.commitment_amount})` },
      { status: 422 }
    )
  }

  // Verify loan exists and is active
  const { data: loan } = await supabase
    .from('loans')
    .select('id, loan_number, loan_status, principal_amount')
    .eq('id', loan_id)
    .single()

  if (!loan) return NextResponse.json({ error: 'Loan not found' }, { status: 404 })

  if (!['active', 'pending_funding'].includes(loan.loan_status)) {
    return NextResponse.json(
      { error: 'Can only allocate to active or pending_funding loans' },
      { status: 422 }
    )
  }

  const { data: allocation, error: allocErr } = await supabase
    .from('fund_allocations')
    .insert({
      subscription_id,
      loan_id,
      allocation_amount,
      allocation_date,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (allocErr || !allocation) {
    return NextResponse.json({ error: allocErr?.message ?? 'Failed to create allocation' }, { status: 500 })
  }

  // Update funded_amount and mark subscription active
  await supabase
    .from('fund_subscriptions')
    .update({
      funded_amount:      newFunded,
      subscription_status: newFunded >= Number(sub.commitment_amount) ? 'active' : 'approved',
      updated_at:         new Date().toISOString(),
    })
    .eq('id', subscription_id)

  emitAuditEvent({
    actorProfileId: user.id,
    eventType:      'subscription_action',
    entityType:     'subscription',
    entityId:       subscription_id,
    eventPayload: {
      action:            'allocation_created',
      allocation_id:     allocation.id,
      loan_id,
      loan_number:       loan.loan_number,
      allocation_amount,
    },
  })

  return NextResponse.json({ success: true, allocation_id: allocation.id }, { status: 201 })
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (!['admin', 'manager'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('fund_allocations')
    .select(`
      id, allocation_amount, allocation_date, allocation_status, notes, created_at,
      fund_subscriptions (
        id, commitment_amount, funded_amount,
        investors ( profiles ( full_name, email ) )
      ),
      loans ( id, loan_number, loan_status, principal_amount )
    `)
    .order('allocation_date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ allocations: data ?? [] })
}
