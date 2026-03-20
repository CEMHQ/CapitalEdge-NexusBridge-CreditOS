import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/format'

export default async function InvestorStatementsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: investor } = await supabase
    .from('investors')
    .select('id, accreditation_status')
    .eq('profile_id', user!.id)
    .maybeSingle()

  if (!investor) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-gray-900">Statements</h1>
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-sm text-gray-500">Investor record not found. Please contact support.</p>
        </div>
      </div>
    )
  }

  // Get subscription history (all statuses for statements purposes)
  const { data: subscriptions } = await supabase
    .from('fund_subscriptions')
    .select(`
      id, commitment_amount, funded_amount, subscription_status,
      fcfs_position, confirmed_at, created_at, updated_at,
      funds ( fund_name )
    `)
    .eq('investor_id', investor.id)
    .order('created_at', { ascending: false })

  // Get all allocations across all subscriptions
  const subIds = subscriptions?.map(s => s.id) ?? []
  type AllocRow = { id: string; allocation_amount: number | string; allocation_date: string; allocation_status: string; fund_subscriptions: { commitment_amount: number | string } | null; loans: { loan_number: string; loan_status: string; interest_rate: number | string | null; maturity_date: string | null; total_paid: number | string | null } | null }
  let allocations: AllocRow[] = []
  if (subIds.length > 0) {
    const { data } = await supabase
      .from('fund_allocations')
      .select(`
        id, allocation_amount, allocation_date, allocation_status,
        fund_subscriptions ( commitment_amount ),
        loans ( loan_number, loan_status, interest_rate, maturity_date, total_paid )
      `)
      .in('subscription_id', subIds)
      .order('allocation_date', { ascending: false })
    allocations = (data ?? []) as unknown as AllocRow[]
  }

  // Get NAV history (investor-visible)
  const { data: navHistory } = await supabase
    .from('nav_snapshots')
    .select('snapshot_date, total_nav, nav_per_unit, total_distributed, loan_count, investor_count')
    .order('snapshot_date', { ascending: false })
    .limit(12)

  const hasActiveSub = subscriptions?.some(s => ['approved', 'active'].includes(s.subscription_status))

  return (
    <div className="space-y-8">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Statements</h1>
        <p className="text-sm text-gray-500 mt-1">Subscription history, allocation records, and NAV snapshots</p>
      </div>

      {/* Subscription history */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Subscription History</h2>
        {!subscriptions || subscriptions.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-sm text-gray-500">No subscriptions on record.</p>
            {investor.accreditation_status === 'verified' && (
              <p className="text-xs text-gray-400 mt-1">Subscribe from your dashboard to get started.</p>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Fund</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Status</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">Committed</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">Funded</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">Queue</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {subscriptions.map((sub) => (
                  <tr key={sub.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-gray-900">
                      {(sub.funds as unknown as { fund_name: string } | null)?.fund_name ?? 'NexusBridge Capital LP'}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${subStatusBadge(sub.subscription_status)}`}>
                        {sub.subscription_status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-gray-900">
                      {formatCurrency(Number(sub.commitment_amount))}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-600">
                      {formatCurrency(Number(sub.funded_amount))}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-600">
                      {sub.fcfs_position ? `#${sub.fcfs_position}` : '—'}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-600">
                      {formatDate(sub.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Allocation records */}
      {allocations.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-3">Allocation Records</h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Loan</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Loan Status</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">Allocated</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">Rate</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">Total Paid</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">Matures</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {allocations.map((alloc) => {
                  const loan = alloc.loans
                  return (
                    <tr key={alloc.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 font-medium text-gray-900">{loan?.loan_number ?? '—'}</td>
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
                        {loan?.total_paid != null ? formatCurrency(Number(loan.total_paid)) : '—'}
                      </td>
                      <td className="px-5 py-3 text-right text-gray-600">
                        {loan?.maturity_date ? formatDate(loan.maturity_date) : '—'}
                      </td>
                      <td className="px-5 py-3 text-right text-gray-600">
                        {formatDate(alloc.allocation_date)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Distributions — placeholder until distributions table is built */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Distribution History</h2>
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          {hasActiveSub ? (
            <>
              <p className="text-sm text-gray-600">No distributions recorded yet.</p>
              <p className="text-xs text-gray-400 mt-1">Distributions are posted as loan payments are received and waterfalled.</p>
            </>
          ) : (
            <p className="text-sm text-gray-500">Distributions will appear here once your subscription is active.</p>
          )}
        </div>
      </div>

      {/* Tax documents */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Tax Documents</h2>
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-600">K-1 and other tax documents will be posted here annually.</p>
          <p className="text-xs text-gray-400 mt-1">Documents are generated by Capital Edge Management after fiscal year close.</p>
        </div>
      </div>

      {/* NAV history */}
      {navHistory && navHistory.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-3">Fund NAV History</h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Date</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">Total NAV</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">NAV/Unit</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">Distributed</th>
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
                    <td className="px-5 py-3 text-right text-gray-600">{formatCurrency(Number(snap.total_distributed))}</td>
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

function subStatusBadge(status: string) {
  switch (status) {
    case 'active':   return 'bg-green-50 text-green-700'
    case 'approved': return 'bg-blue-50 text-blue-700'
    case 'pending':  return 'bg-amber-50 text-amber-700'
    case 'rejected': return 'bg-red-50 text-red-700'
    case 'redeemed':
    case 'closed':   return 'bg-gray-100 text-gray-600'
    default: return 'bg-gray-100 text-gray-600'
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
