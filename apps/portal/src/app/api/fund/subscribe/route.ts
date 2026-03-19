import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserRole } from '@/lib/auth/roles'
import { validateBody } from '@/lib/validation/validate'
import { createSubscriptionSchema } from '@/lib/validation/schemas'
import { subscriptionLimiter } from '@/lib/rate-limit/index'
import { applyRateLimit } from '@/lib/rate-limit/apply'
import { emitAuditEvent } from '@/lib/audit/emit'

export async function POST(request: Request) {
  const validation = await validateBody(request, createSubscriptionSchema)
  if (!validation.success) return validation.response

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== 'investor') {
    return NextResponse.json({ error: 'Only investors can submit fund subscriptions' }, { status: 403 })
  }

  const blocked = await applyRateLimit(subscriptionLimiter, user.id)
  if (blocked) return blocked

  const { fund_id, commitment_amount } = validation.data

  // Resolve investor record
  const { data: investor } = await supabase
    .from('investors')
    .select('id, accreditation_status, onboarding_status')
    .eq('profile_id', user.id)
    .single()

  if (!investor) {
    return NextResponse.json({ error: 'Investor record not found' }, { status: 404 })
  }

  if (investor.accreditation_status !== 'verified') {
    return NextResponse.json(
      { error: 'Accredited investor verification required before subscribing' },
      { status: 422 }
    )
  }

  // Check for existing active subscription to this fund
  const { data: existing } = await supabase
    .from('fund_subscriptions')
    .select('id, subscription_status')
    .eq('investor_id', investor.id)
    .eq('fund_id', fund_id)
    .in('subscription_status', ['pending', 'approved', 'active'])
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: 'You already have an active subscription to this fund' },
      { status: 409 }
    )
  }

  // FCFS reservation — uses SELECT FOR UPDATE inside the function to prevent oversubscription
  const { data: result, error: rpcErr } = await supabase.rpc('reserve_fund_subscription', {
    p_investor_id:       investor.id,
    p_fund_id:           fund_id,
    p_commitment_amount: commitment_amount,
  })

  if (rpcErr) {
    return NextResponse.json({ error: rpcErr.message }, { status: 500 })
  }

  if (result?.error) {
    return NextResponse.json({ error: result.error }, { status: 422 })
  }

  emitAuditEvent({
    actorProfileId: user.id,
    eventType:      'subscription_action',
    entityType:     'subscription',
    entityId:       result.subscription_id,
    eventPayload: {
      fund_id,
      commitment_amount,
      fcfs_position: result.fcfs_position,
    },
  })

  return NextResponse.json(
    {
      success:                true,
      subscription_id:        result.subscription_id,
      fcfs_position:          result.fcfs_position,
      reservation_expires_at: result.reservation_expires_at,
    },
    { status: 201 }
  )
}
