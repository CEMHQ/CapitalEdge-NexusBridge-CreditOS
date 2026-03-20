import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/format'

export default async function InvestorPortfolioPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: investor } = await supabase
    .from('investors')
    .select('id, accreditation_status')
    .eq('profile_id', user!.id)
    .maybeSingle()

  if (!investor) {
    return <EmptyState message="Investor record not found. Please contact support." />
  }

  // Get active subscription
  const { data: subscription } = await supabase
    .from('fund_subscriptions')
    .select(`
      id, commitment_amount, funded_amount, subscription_status,
      fcfs_position, confirmed_at, created_at,
      funds ( fund_name )
    `)
    .eq('investor_id', investor.id)
    .in('subscription_status', ['pending', 'approved', 'active'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Get loan allocations
  const allocations = subscription ? await (async () => {
    const { data } = await supabase
      .from('fund_allocations')
      .select(`
        id, allocation_amount, allocation_date, allocation_status,
        loans (
          id, loan_number, loan_status, principal_amount,
          interest_rate, maturity_date, outstanding_balance,
          applications (
            loan_purpose,
            properties ( city, state, property_type )
          )
        )
      `)
      .eq('subscription_id', subscription.id)
      .order('allocation_date', { ascending: false })
    return data ?? []
  })() : []

  // Get NAV history (last 6)
  const { data: navHistory } = await supabase
    .from('nav_snapshots')
    .select('snapshot_date, total_nav, nav_per_unit, total_deployed, loan_count, investor_count')
    .order('snapshot_date', { ascending: false })
    .limit(6)

  const latestNav = navHistory?.[0] ?? null

  const totalCommitted = subscription ? Number(subscription.commitment_amount) : 0
  const totalDeployed  = subscription ? Number(subscription.funded_amount) : 0
  const activeAllocs   = allocations.filter((a) => a.allocation_status === 'active')

  if (!subscription) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Portfolio</h1>
          <p className="text-sm text-gray-500 mt-1">Your capital account and loan allocations</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-sm font-medium text-gray-900">No active subscription</p>
          <p className="text-sm text-gray-500 mt-1">
            {investor.accreditation_status === 'verified'
              ? 'Return to your dashboard to subscribe to NexusBridge Capital LP.'
              : 'Complete accreditation verification to subscribe to the fund.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Portfolio</h1>
        <p className="text-sm text-gray-500 mt-1">NexusBridge Capital LP · {subscriptionBadgeLabel(subscription.subscription_status)}</p>
      </div>

      {/* Capital summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Total Committed"   value={formatCurrency(totalCommitted)} />
        <MetricCard title="Capital Deployed"  value={formatCurrency(totalDeployed)} />
        <MetricCard title="Undeployed"        value={formatCurrency(totalCommitted - totalDeployed)} />
        <MetricCard title="NAV per Unit"      value={latestNav ? `$${Number(latestNav.nav_per_unit).toFixed(4)}` : '—'} />
      </div>

      {/* Subscription details */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Subscription</h2>
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          <Row label="Fund"           value={(subscription.funds as { fund_name: string } | null)?.fund_name ?? 'NexusBridge Capital LP'} />
          <Row label="Status"         value={subscriptionBadgeLabel(subscription.subscription_status)} />
          <Row label="Queue Position" value={subscription.fcfs_position ? `#${subscription.fcfs_position}` : '—'} />
          <Row label="Subscribed"     value={formatDate(subscription.created_at)} />
          {subscription.confirmed_at && (
            <Row label="Confirmed"    value={formatDate(subscription.confirmed_at)} />
          )}
        </div>
      </div>

      {/* Loan allocations */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">
          Loan Allocations
          <span className="ml-2 text-sm font-normal text-gray-400">({activeAllocs.length})</span>
        </h2>

        {activeAllocs.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-sm text-gray-500">No allocations yet.</p>
            <p className="text-xs text-gray-400 mt-1">Capital will be allocated to loans as the portfolio deploys.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Loan</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Property</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Status</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">Allocated</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">Rate</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">Matures</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {activeAllocs.map((alloc) => {
                  const loan = alloc.loans
                  const prop = loan?.applications?.properties
                  return (
                    <tr key={alloc.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 font-medium text-gray-900">{loan?.loan_number ?? '—'}</td>
                      <td className="px-5 py-3 text-gray-600">
                        {prop ? `${prop.city}, ${prop.state}` : '—'}
                        {prop?.property_type && (
                          <span className="ml-1 text-xs text-gray-400">· {prop.property_type.replace(/_/g, ' ')}</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${loanStatusBadge(loan?.loan_status)}`}>
                          {loan?.loan_status?.replace(/_/g, ' ') ?? '—'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right font-medium text-gray-900">
                        {formatCurrency(Number(alloc.allocation_amount))}
                      </td>
                      <td className="px-5 py-3 text-right text-gray-600">
                        {loan?.interest_rate ? `${(Number(loan.interest_rate) * 100).toFixed(1)}%` : '—'}
                      </td>
                      <td className="px-5 py-3 text-right text-gray-600">
                        {loan?.maturity_date ? formatDate(loan.maturity_date) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* NAV history */}
      {navHistory && navHistory.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-3">NAV History</h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Date</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">Total NAV</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">NAV/Unit</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">Deployed</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">Loans</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">Investors</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {navHistory.map((snap) => (
                  <tr key={snap.snapshot_date} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 text-gray-900">{formatDate(snap.snapshot_date)}</td>
                    <td className="px-5 py-3 text-right font-medium text-gray-900">{formatCurrency(Number(snap.total_nav))}</td>
                    <td className="px-5 py-3 text-right text-gray-600">${Number(snap.nav_per_unit).toFixed(4)}</td>
                    <td className="px-5 py-3 text-right text-gray-600">{formatCurrency(Number(snap.total_deployed))}</td>
                    <td className="px-5 py-3 text-right text-gray-600">{snap.loan_count}</td>
                    <td className="px-5 py-3 text-right text-gray-600">{snap.investor_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function subscriptionBadgeLabel(status: string) {
  switch (status) {
    case 'pending':  return 'Pending Review'
    case 'approved': return 'Approved'
    case 'active':   return 'Active'
    case 'redeemed': return 'Redeemed'
    case 'closed':   return 'Closed'
    default: return status
  }
}

function loanStatusBadge(status?: string) {
  switch (status) {
    case 'active':          return 'bg-green-50 text-green-700'
    case 'pending_funding': return 'bg-blue-50 text-blue-700'
    case 'delinquent':      return 'bg-amber-50 text-amber-700'
    case 'defaulted':       return 'bg-red-50 text-red-700'
    case 'paid_off':        return 'bg-gray-100 text-gray-600'
    default: return 'bg-gray-100 text-gray-600'
  }
}

// ─── Components ───────────────────────────────────────────────────────────────

function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-1">
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <p className="text-2xl font-semibold text-gray-900">{value}</p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between px-5 py-3">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900">{value}</span>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">Portfolio</h1>
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <p className="text-sm text-gray-500">{message}</p>
      </div>
    </div>
  )
}
