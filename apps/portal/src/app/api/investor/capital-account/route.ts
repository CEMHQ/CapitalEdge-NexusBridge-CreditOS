import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserRole } from '@/lib/auth/roles'

// Returns the current investor's full capital account summary:
// subscription status, allocation breakdown by loan, and latest NAV.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== 'investor') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Get investor record
  const { data: investor } = await supabase
    .from('investors')
    .select('id, accreditation_status, kyc_status, onboarding_status')
    .eq('profile_id', user.id)
    .single()

  if (!investor) {
    return NextResponse.json({ investor: null, subscription: null, allocations: [], nav: null })
  }

  // Get subscription (most recent active/approved one)
  const { data: subscription } = await supabase
    .from('fund_subscriptions')
    .select(`
      id, commitment_amount, funded_amount, subscription_status,
      reservation_status, fcfs_position, reserved_at, confirmed_at,
      reservation_expires_at, notes, created_at,
      funds ( id, fund_name, fund_status )
    `)
    .eq('investor_id', investor.id)
    .in('subscription_status', ['pending', 'approved', 'active'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Get allocations if there's a subscription
  let allocations: unknown[] = []
  if (subscription) {
    const { data: allocs } = await supabase
      .from('fund_allocations')
      .select(`
        id, allocation_amount, allocation_date, allocation_status,
        loans (
          id, loan_number, loan_status, principal_amount,
          interest_rate, maturity_date, outstanding_balance
        )
      `)
      .eq('subscription_id', subscription.id)
      .eq('allocation_status', 'active')
      .order('allocation_date', { ascending: false })

    allocations = allocs ?? []
  }

  // Get latest NAV snapshot
  const { data: nav } = await supabase
    .from('nav_snapshots')
    .select('snapshot_date, total_nav, nav_per_unit, total_deployed, total_committed, investor_count')
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Computed metrics
  const totalCommitted  = subscription ? Number(subscription.commitment_amount) : 0
  const totalDeployed   = subscription ? Number(subscription.funded_amount) : 0
  const allocationCount = allocations.length

  return NextResponse.json({
    investor,
    subscription,
    allocations,
    nav,
    metrics: {
      total_committed:   totalCommitted,
      total_deployed:    totalDeployed,
      undeployed:        totalCommitted - totalDeployed,
      allocation_count:  allocationCount,
    },
  })
}
