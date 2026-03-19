import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserRole } from '@/lib/auth/roles'
import { validateBody } from '@/lib/validation/validate'
import { recordNavSchema } from '@/lib/validation/schemas'
import { updateLimiter } from '@/lib/rate-limit/index'
import { applyRateLimit } from '@/lib/rate-limit/apply'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (!['admin', 'manager', 'investor'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Latest snapshot + last 12 for history
  const { data, error } = await supabase
    .from('nav_snapshots')
    .select(`
      id, snapshot_date, total_nav, total_committed, total_deployed,
      total_distributed, nav_per_unit, loan_count, investor_count, notes, created_at,
      funds ( fund_name )
    `)
    .order('snapshot_date', { ascending: false })
    .limit(12)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    latest:  data?.[0] ?? null,
    history: data ?? [],
  })
}

export async function POST(request: Request) {
  const validation = await validateBody(request, recordNavSchema)
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

  // Get the fund (NexusBridge Capital LP)
  const { data: fund } = await supabase
    .from('funds')
    .select('id')
    .eq('fund_status', 'open')
    .single()

  if (!fund) return NextResponse.json({ error: 'No open fund found' }, { status: 404 })

  const body = validation.data

  // Compute live metrics to supplement the manually entered NAV
  const { data: subTotals } = await supabase
    .from('fund_subscriptions')
    .select('commitment_amount, funded_amount')
    .in('subscription_status', ['approved', 'active'])

  const { data: activeLoans } = await supabase
    .from('loans')
    .select('id')
    .eq('loan_status', 'active')

  const { data: activeInvestors } = await supabase
    .from('fund_subscriptions')
    .select('investor_id')
    .in('subscription_status', ['approved', 'active'])

  const totalCommitted = subTotals?.reduce((s, r) => s + Number(r.commitment_amount), 0) ?? 0
  const totalDeployed  = subTotals?.reduce((s, r) => s + Number(r.funded_amount), 0) ?? 0
  const uniqueInvestors = new Set(activeInvestors?.map(r => r.investor_id) ?? []).size

  const { data: snapshot, error } = await supabase
    .from('nav_snapshots')
    .insert({
      fund_id:          fund.id,
      snapshot_date:    body.snapshot_date,
      total_nav:        body.nav,
      total_committed:  totalCommitted,
      total_deployed:   totalDeployed,
      total_distributed: 0,
      nav_per_unit:     body.nav_per_unit ?? 1.0,
      loan_count:       activeLoans?.length ?? 0,
      investor_count:   uniqueInvestors,
      notes:            body.notes ?? null,
      created_by:       user.id,
    })
    .select('id, snapshot_date, total_nav, nav_per_unit')
    .single()

  if (error || !snapshot) {
    return NextResponse.json({ error: error?.message ?? 'Failed to record NAV snapshot' }, { status: 500 })
  }

  return NextResponse.json({ success: true, snapshot }, { status: 201 })
}
