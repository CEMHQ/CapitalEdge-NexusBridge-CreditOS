import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/format'
import SendForSignatureButton from '@/components/signatures/SendForSignatureButton'
import SignatureStatusBadge from '@/components/signatures/SignatureStatusBadge'

type InvestorJoin = {
  id: string
  accreditation_status: string
  profiles: { full_name: string | null; email: string | null } | null
} | null

export default async function AdminFundPage() {
  const supabase = await createClient()

  // Fund summary
  const { data: fund } = await supabase
    .from('funds')
    .select('id, fund_name, fund_status, target_size, max_capacity, inception_date')
    .single()

  // Subscription queue
  const { data: subscriptions } = await supabase
    .from('fund_subscriptions')
    .select(`
      id, commitment_amount, funded_amount, subscription_status,
      reservation_status, fcfs_position, reserved_at, confirmed_at,
      reservation_expires_at, notes, created_at,
      investors (
        id, accreditation_status,
        profiles ( full_name, email )
      )
    `)
    .order('fcfs_position', { ascending: true })

  // Latest NAV + history
  const { data: navHistory } = await supabase
    .from('nav_snapshots')
    .select('id, snapshot_date, total_nav, nav_per_unit, total_committed, total_deployed, total_distributed, loan_count, investor_count, notes')
    .order('snapshot_date', { ascending: false })
    .limit(12)

  const latestNav = navHistory?.[0] ?? null

  // Aggregate subscription metrics
  const allSubs = subscriptions ?? []
  const activeSubs     = allSubs.filter(s => ['approved', 'active'].includes(s.subscription_status))
  const pendingSubs    = allSubs.filter(s => s.subscription_status === 'pending')
  const totalCommitted = activeSubs.reduce((sum, s) => sum + Number(s.commitment_amount), 0)
  const totalDeployed  = activeSubs.reduce((sum, s) => sum + Number(s.funded_amount), 0)

  const capacityUsedPct = fund ? Math.round((totalCommitted / Number(fund.max_capacity)) * 100) : 0

  // Signature requests for all subscriptions
  const subIds = allSubs.map(s => s.id)
  type SubSigRow = { id: string; entity_id: string; document_type: string; status: string; signers: unknown; sent_at: string | null; completed_at: string | null; declined_at: string | null }
  let subSigRequests: SubSigRow[] = []
  if (subIds.length > 0) {
    const { data } = await supabase
      .from('signature_requests')
      .select('id, entity_id, document_type, status, signers, sent_at, completed_at, declined_at')
      .eq('entity_type', 'subscription')
      .in('entity_id', subIds)
      .order('created_at', { ascending: false })
    subSigRequests = (data ?? []) as unknown as SubSigRow[]
  }

  // Group signature requests by subscription ID
  const sigsBySubId = subSigRequests.reduce<Record<string, SubSigRow[]>>((acc, sr) => {
    if (!acc[sr.entity_id]) acc[sr.entity_id] = []
    acc[sr.entity_id].push(sr)
    return acc
  }, {})

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Fund Operations</h1>
          <p className="text-sm text-gray-500 mt-1">{fund?.fund_name ?? 'NexusBridge Capital LP'}</p>
        </div>
        {fund && (
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
            fund.fund_status === 'open' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
          }`}>
            {fund.fund_status}
          </span>
        )}
      </div>

      {/* Fund metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Total Committed"    value={formatCurrency(totalCommitted)} note={`${capacityUsedPct}% of $${(Number(fund?.max_capacity ?? 0) / 1_000_000).toFixed(0)}M capacity`} />
        <MetricCard title="Capital Deployed"   value={formatCurrency(totalDeployed)} note={`${activeSubs.length} active subscription${activeSubs.length !== 1 ? 's' : ''}`} />
        <MetricCard title="Pending Review"     value={String(pendingSubs.length)} note="Awaiting admin approval" />
        <MetricCard title="Latest NAV/Unit"    value={latestNav ? `$${Number(latestNav.nav_per_unit).toFixed(4)}` : '—'} note={latestNav ? `As of ${formatDate(latestNav.snapshot_date)}` : 'No snapshot recorded'} />
      </div>

      {/* Capacity bar */}
      {fund && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex justify-between items-center mb-2">
            <p className="text-sm font-medium text-gray-700">Fund Capacity</p>
            <p className="text-sm text-gray-500">
              {formatCurrency(totalCommitted)} / {formatCurrency(Number(fund.max_capacity))}
            </p>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2.5">
            <div
              className="bg-blue-600 h-2.5 rounded-full transition-all"
              style={{ width: `${Math.min(capacityUsedPct, 100)}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1.5">{capacityUsedPct}% filled · Target: {formatCurrency(Number(fund.target_size))}</p>
        </div>
      )}

      {/* Pending subscriptions */}
      {pendingSubs.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-3">
            Pending Subscriptions
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
              {pendingSubs.length} awaiting review
            </span>
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Investor</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Accreditation</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">Commitment</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">Queue</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">Reserved</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">Expires</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pendingSubs.map((sub) => {
                  const inv = sub.investors as unknown as InvestorJoin
                  const expired = sub.reservation_expires_at && new Date(sub.reservation_expires_at) < new Date()
                  return (
                    <tr key={sub.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3">
                        <p className="font-medium text-gray-900">{inv?.profiles?.full_name ?? '—'}</p>
                        <p className="text-xs text-gray-500">{inv?.profiles?.email ?? '—'}</p>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${accreditationBadge(inv?.accreditation_status)}`}>
                          {inv?.accreditation_status ?? '—'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right font-medium text-gray-900">
                        {formatCurrency(Number(sub.commitment_amount))}
                      </td>
                      <td className="px-5 py-3 text-right text-gray-600">#{sub.fcfs_position}</td>
                      <td className="px-5 py-3 text-right text-gray-600">
                        {sub.reserved_at ? formatDate(sub.reserved_at) : '—'}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {sub.reservation_expires_at ? (
                          <span className={expired ? 'text-red-600 text-xs' : 'text-gray-600 text-sm'}>
                            {expired ? 'Expired' : new Date(sub.reservation_expires_at).toLocaleTimeString()}
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Use <code className="bg-gray-100 px-1 rounded">PATCH /api/fund/subscriptions/[id]</code> to approve or reject subscriptions.
          </p>
        </div>
      )}

      {/* All subscriptions */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">All Subscriptions ({allSubs.length})</h2>
        {allSubs.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-sm text-gray-500">No subscriptions yet.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Investor</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Status</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">Committed</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">Funded</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">Queue</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {allSubs.map((sub) => {
                  const inv = sub.investors as unknown as InvestorJoin
                  return (
                    <tr key={sub.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3">
                        <p className="font-medium text-gray-900">{inv?.profiles?.full_name ?? '—'}</p>
                        <p className="text-xs text-gray-500">{inv?.profiles?.email ?? '—'}</p>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${subStatusBadge(sub.subscription_status)}`}>
                          {sub.subscription_status}
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
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Subscription Signatures */}
      {activeSubs.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-3">Subscription Signatures</h2>
          <div className="space-y-4">
            {activeSubs.map((sub) => {
              const inv = sub.investors as unknown as InvestorJoin
              const sigs = sigsBySubId[sub.id] ?? []
              return (
                <div key={sub.id} className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{inv?.profiles?.full_name ?? '—'}</p>
                      <p className="text-xs text-gray-500">{formatCurrency(Number(sub.commitment_amount))} · {sub.subscription_status}</p>
                    </div>
                    <SendForSignatureButton
                      entityType="subscription"
                      entityId={sub.id}
                      availableDocTypes={['ppm_acknowledgment', 'subscription_agreement']}
                    />
                  </div>
                  {sigs.length > 0 ? (
                    <div className="space-y-2">
                      {sigs.map((sr) => {
                        const signerList = (sr.signers ?? []) as Array<{ name: string; email: string; role: string; signed_at: string | null }>
                        return (
                          <div key={sr.id} className="border border-gray-100 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium text-gray-900 capitalize">
                                {sr.document_type.replace(/_/g, ' ')}
                              </span>
                              <SignatureStatusBadge status={sr.status} />
                            </div>
                            <div className="text-xs text-gray-500 space-y-0.5">
                              {sr.sent_at && <p>Sent {formatDate(sr.sent_at)}</p>}
                              {sr.completed_at && <p className="text-green-600">Signed {formatDate(sr.completed_at)}</p>}
                              {sr.declined_at && <p className="text-red-600">Declined {formatDate(sr.declined_at)}</p>}
                            </div>
                            {signerList.length > 0 && (
                              <div className="mt-1.5 space-y-1">
                                {signerList.map((s, i) => (
                                  <div key={i} className="flex items-center gap-2 text-xs text-gray-600">
                                    <span className={`w-2 h-2 rounded-full ${s.signed_at ? 'bg-green-500' : 'bg-gray-300'}`} />
                                    <span>{s.name}</span>
                                    <span className="text-gray-400">({s.role})</span>
                                    {s.signed_at && <span className="text-green-600 ml-auto">Signed</span>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">No signature requests sent yet.</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* NAV history */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">NAV Snapshots</h2>
        {!navHistory || navHistory.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-sm text-gray-500">No NAV snapshots recorded.</p>
            <p className="text-xs text-gray-400 mt-1">
              Use <code className="bg-gray-100 px-1 rounded">POST /api/fund/nav</code> to record a snapshot.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Date</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">Total NAV</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">NAV/Unit</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">Committed</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">Deployed</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">Loans</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">Investors</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {navHistory.map((snap) => (
                  <tr key={snap.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-gray-900">{formatDate(snap.snapshot_date)}</td>
                    <td className="px-5 py-3 text-right font-medium text-gray-900">{formatCurrency(Number(snap.total_nav))}</td>
                    <td className="px-5 py-3 text-right text-gray-600">${Number(snap.nav_per_unit).toFixed(4)}</td>
                    <td className="px-5 py-3 text-right text-gray-600">{formatCurrency(Number(snap.total_committed))}</td>
                    <td className="px-5 py-3 text-right text-gray-600">{formatCurrency(Number(snap.total_deployed))}</td>
                    <td className="px-5 py-3 text-right text-gray-600">{snap.loan_count}</td>
                    <td className="px-5 py-3 text-right text-gray-600">{snap.investor_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
    default: return 'bg-gray-100 text-gray-600'
  }
}

function accreditationBadge(status?: string) {
  switch (status) {
    case 'verified': return 'bg-green-50 text-green-700'
    case 'pending':  return 'bg-amber-50 text-amber-700'
    case 'expired':  return 'bg-red-50 text-red-700'
    default: return 'bg-gray-100 text-gray-600'
  }
}

// ─── Components ───────────────────────────────────────────────────────────────

function MetricCard({ title, value, note }: { title: string; value: string; note: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-1">
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <p className="text-2xl font-semibold text-gray-900">{value}</p>
      <p className="text-xs text-gray-400">{note}</p>
    </div>
  )
}
