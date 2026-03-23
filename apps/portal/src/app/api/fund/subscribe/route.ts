import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserRole } from '@/lib/auth/roles'
import { validateBody } from '@/lib/validation/validate'
import { createSubscriptionSchema } from '@/lib/validation/schemas'
import { subscriptionLimiter } from '@/lib/rate-limit/index'
import { applyRateLimit } from '@/lib/rate-limit/apply'
import { emitAuditEvent } from '@/lib/audit/emit'
import { checkRegALimit } from '@/lib/compliance/reg-a'

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

  const { fund_id, commitment_amount, offering_circular_acknowledged } = validation.data

  // Resolve investor record (include financial profile for Reg A limit check + AIQ status)
  const { data: investor } = await supabase
    .from('investors')
    .select('id, accreditation_status, onboarding_status, annual_income, net_worth, aiq_self_certified_at')
    .eq('profile_id', user.id)
    .single()

  if (!investor) {
    return NextResponse.json({ error: 'Investor record not found' }, { status: 404 })
  }

  // Resolve fund to determine offering type
  const { data: fund } = await supabase
    .from('funds')
    .select('id, offering_type')
    .eq('id', fund_id)
    .maybeSingle()

  if (!fund) {
    return NextResponse.json({ error: 'Fund not found' }, { status: 404 })
  }

  // Compliance gate: branched by offering type
  if (fund.offering_type === 'reg_d') {
    // 506(c): accredited investors only
    if (investor.accreditation_status !== 'verified') {
      return NextResponse.json(
        { error: 'Accredited investor verification required for this fund' },
        { status: 422 }
      )
    }
    // 506(c): Accredited Investor Questionnaire (AIQ) self-certification required before subscribing
    if (!(investor as Record<string, unknown>).aiq_self_certified_at) {
      return NextResponse.json(
        { error: 'You must complete the Accredited Investor Questionnaire before subscribing to this fund' },
        { status: 422 }
      )
    }
    // 506(c): PPM/offering document acknowledgment required before subscription reservation
    if (!offering_circular_acknowledged) {
      return NextResponse.json(
        { error: 'You must acknowledge that you have received and reviewed the PPM before subscribing' },
        { status: 422 }
      )
    }
  } else if (fund.offering_type === 'reg_a') {
    // Tier 2: offering circular acknowledgment required before subscription reservation
    if (!offering_circular_acknowledged) {
      return NextResponse.json(
        { error: 'You must acknowledge that you have read the offering circular before subscribing' },
        { status: 422 }
      )
    }
    // Tier 2: non-accredited allowed subject to 10%-of-income/net-worth limit
    const limitCheck = await checkRegALimit(
      supabase,
      investor.id,
      investor.accreditation_status,
      investor.annual_income,
      investor.net_worth,
      commitment_amount,
    )
    if (!limitCheck.allowed) {
      return NextResponse.json({ error: limitCheck.reason }, { status: 422 })
    }
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

  // Stamp offering circular acknowledgment timestamp for both Reg A and Reg D
  if (offering_circular_acknowledged) {
    await supabase
      .from('fund_subscriptions')
      .update({ offering_circular_acknowledged_at: new Date().toISOString() })
      .eq('id', result.subscription_id)
  }

  emitAuditEvent({
    actorProfileId: user.id,
    eventType:      'subscription_action',
    entityType:     'subscription',
    entityId:       result.subscription_id,
    eventPayload: {
      fund_id,
      commitment_amount,
      fcfs_position:                  result.fcfs_position,
      offering_type:                  fund.offering_type,
      offering_circular_acknowledged: offering_circular_acknowledged ?? false,
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
