import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getUserRole } from '@/lib/auth/roles'
import { formatCurrency } from '@/lib/format'
import { computeRegALimit } from '@/lib/compliance/reg-a'
import { redirect } from 'next/navigation'
import Link from 'next/link'

// Reg A Tier 2 aggregate cap: $75M per issuer per 12 months
const REG_A_ISSUER_CAP = 75_000_000

export default async function AdminRegAReportPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const role = await getUserRole(supabase, user!.id)
  if (!['admin', 'manager'].includes(role)) redirect('/dashboard/admin')

  const adminClient = createAdminClient()
  const since12mo = new Date()
  since12mo.setFullYear(since12mo.getFullYear() - 1)
  const since12moISO = since12mo.toISOString()

  // ── 1. Reg A offerings with subscription totals ───────────────────────────

  const { data: rawOfferings } = await adminClient
    .from('offerings')
    .select(`
      id, title, offering_status, max_offering_amount, offering_close_date,
      funds ( offering_type )
    `)
    .eq('funds.offering_type', 'reg_a')
    .order('offering_status', { ascending: true })
    .order('title', { ascending: true })

  const offerings = (rawOfferings ?? []) as unknown as Array<{
    id: string
    title: string
    offering_status: string
    max_offering_amount: string
    offering_close_date: string | null
    funds: { offering_type: string } | null
  }>

  // Get subscription totals for each offering's fund
  const { data: rawSubscriptions } = await adminClient
    .from('fund_subscriptions')
    .select('fund_id, commitment_amount, subscription_status, created_at, funds!inner(offering_type)')
    .eq('funds.offering_type', 'reg_a')
    .in('subscription_status', ['pending', 'approved', 'active'])

  type SubRow = { fund_id: string; commitment_amount: string; created_at: string }
  const allSubs = (rawSubscriptions ?? []) as SubRow[]

  // Total Reg A raised in last 12 months across all offerings (aggregate cap)
  const totalRaisedLast12mo = allSubs
    .filter(s => s.created_at >= since12moISO)
    .reduce((sum, s) => sum + parseFloat(s.commitment_amount ?? '0'), 0)

  // Build fund→offeringId map (each offering links to a fund)
  // We need fund_id for each offering — re-fetch with fund_id
  const { data: rawOfferingsWithFund } = await adminClient
    .from('offerings')
    .select('id, fund_id, max_offering_amount')
    .in('id', offerings.map(o => o.id))

  const offeringFundMap = new Map(
    (rawOfferingsWithFund ?? []).map((o: { id: string; fund_id: string; max_offering_amount: string }) => [o.id, o.fund_id])
  )

  // Sum subscriptions by fund_id
  const subsByFund = allSubs.reduce<Record<string, number>>((acc, s) => {
    acc[s.fund_id] = (acc[s.fund_id] ?? 0) + parseFloat(s.commitment_amount ?? '0')
    return acc
  }, {})

  // ── 2. Per-investor Reg A usage ────────────────────────────────────────────

  const { data: rawInvestors } = await adminClient
    .from('investors')
    .select(`
      id, accreditation_status, annual_income, net_worth,
      profiles ( full_name, email )
    `)
    .neq('accreditation_status', 'verified')  // accredited investors have no limit

  type InvestorRow = {
    id: string
    accreditation_status: string
    annual_income: string | null
    net_worth: string | null
    profiles: { full_name: string | null; email: string | null } | null
  }
  const investors = (rawInvestors ?? []) as unknown as InvestorRow[]

  // Per-investor rolling 12-month commitments
  const { data: rawInvSubs } = await adminClient
    .from('fund_subscriptions')
    .select('investor_id, commitment_amount, funds!inner(offering_type)')
    .eq('funds.offering_type', 'reg_a')
    .in('subscription_status', ['pending', 'approved', 'active'])
    .gte('created_at', since12moISO)

  type InvSubRow = { investor_id: string; commitment_amount: string }
  const invSubs = (rawInvSubs ?? []) as InvSubRow[]

  const usedByInvestor = invSubs.reduce<Record<string, number>>((acc, s) => {
    acc[s.investor_id] = (acc[s.investor_id] ?? 0) + parseFloat(s.commitment_amount ?? '0')
    return acc
  }, {})

  // Build investor report rows
  const investorRows = investors.map(inv => {
    const limit = computeRegALimit(inv.accreditation_status, inv.annual_income, inv.net_worth)
    const used  = usedByInvestor[inv.id] ?? 0
    const remaining = limit !== null ? Math.max(0, limit - used) : null
    const pct = (limit && limit > 0) ? Math.min(100, (used / limit) * 100) : 0
    return { inv, limit, used, remaining, pct }
  }).sort((a, b) => b.pct - a.pct) // highest utilization first

  const atLimit   = investorRows.filter(r => r.limit !== null && r.used >= (r.limit ?? 0))
  const near80pct = investorRows.filter(r => r.pct >= 80 && r.pct < 100)
  const missingSuitability = investors.filter(
    inv => inv.annual_income === null || inv.net_worth === null
  )

  // ── Render ────────────────────────────────────────────────────────────────

  const issuerCapPct = Math.min(100, (totalRaisedLast12mo / REG_A_ISSUER_CAP) * 100)

  return (
    <div className="space-y-8 max-w-4xl">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/admin/compliance" className="text-sm text-gray-400 hover:text-gray-700">
          ← Compliance
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Reg A Tier 2 — Compliance Report</h1>
        <p className="text-sm text-gray-500 mt-1">
          Aggregate issuer cap tracking and per-investor limit monitoring.
          Rolling 12-month window.
        </p>
      </div>

      {/* Issuer aggregate cap card */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900">Aggregate Reg A Cap</p>
            <p className="text-xs text-gray-500 mt-0.5">
              SEC Regulation A Tier 2 limits a single issuer to $75M per 12-month period.
            </p>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            issuerCapPct >= 90 ? 'bg-red-100 text-red-700' :
            issuerCapPct >= 70 ? 'bg-amber-100 text-amber-700' :
                                  'bg-green-50 text-green-700'
          }`}>
            {issuerCapPct.toFixed(1)}% used
          </span>
        </div>

        <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              issuerCapPct >= 90 ? 'bg-red-500' :
              issuerCapPct >= 70 ? 'bg-amber-400' : 'bg-indigo-500'
            }`}
            style={{ width: `${issuerCapPct.toFixed(1)}%` }}
          />
        </div>

        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xs text-gray-400">Annual Limit</p>
            <p className="text-lg font-semibold text-gray-900">{formatCurrency(REG_A_ISSUER_CAP)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Raised (12 mo)</p>
            <p className="text-lg font-semibold text-gray-900">{formatCurrency(totalRaisedLast12mo)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Remaining</p>
            <p className={`text-lg font-semibold ${
              REG_A_ISSUER_CAP - totalRaisedLast12mo <= 5_000_000 ? 'text-red-600' : 'text-green-700'
            }`}>
              {formatCurrency(Math.max(0, REG_A_ISSUER_CAP - totalRaisedLast12mo))}
            </p>
          </div>
        </div>
      </div>

      {/* Per-offering breakdown */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Reg A Offerings</h2>
        {offerings.length === 0 ? (
          <p className="text-sm text-gray-400">No Reg A offerings found.</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {offerings.map(offering => {
              const fundId  = offeringFundMap.get(offering.id) ?? ''
              const raised  = subsByFund[fundId] ?? 0
              const maxAmt  = parseFloat(offering.max_offering_amount)
              const offerPct = maxAmt > 0 ? Math.min(100, (raised / maxAmt) * 100) : 0
              return (
                <div key={offering.id} className="px-5 py-4 space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{offering.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5 capitalize">{offering.offering_status}</p>
                    </div>
                    <span className="text-xs text-gray-500 shrink-0">{offerPct.toFixed(1)}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        offerPct >= 90 ? 'bg-red-500' :
                        offerPct >= 70 ? 'bg-amber-400' : 'bg-indigo-500'
                      }`}
                      style={{ width: `${offerPct.toFixed(1)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Raised: <strong className="text-gray-900">{formatCurrency(raised)}</strong></span>
                    <span>Max: <strong className="text-gray-900">{formatCurrency(maxAmt)}</strong></span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Alerts — investors at limit or near */}
      {(atLimit.length > 0 || near80pct.length > 0) && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-gray-900">Investor Limit Alerts</h2>

          {atLimit.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-red-800 mb-2">
                At Limit ({atLimit.length} investor{atLimit.length !== 1 ? 's' : ''})
              </p>
              <div className="space-y-1">
                {atLimit.map(({ inv }) => (
                  <p key={inv.id} className="text-xs text-red-700">
                    {inv.profiles?.full_name ?? 'Unknown'} — {inv.profiles?.email}
                  </p>
                ))}
              </div>
            </div>
          )}

          {near80pct.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-amber-800 mb-2">
                Near Limit ≥80% ({near80pct.length} investor{near80pct.length !== 1 ? 's' : ''})
              </p>
              <div className="space-y-1">
                {near80pct.map(({ inv, pct }) => (
                  <p key={inv.id} className="text-xs text-amber-700">
                    {inv.profiles?.full_name ?? 'Unknown'} — {pct.toFixed(0)}% used
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Missing suitability data */}
      {missingSuitability.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-3">
            Missing Suitability Data
            <span className="ml-2 text-sm font-normal text-gray-400">({missingSuitability.length})</span>
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {missingSuitability.map(inv => (
              <div key={inv.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {inv.profiles?.full_name ?? 'Unknown'}
                  </p>
                  <p className="text-xs text-gray-400">{inv.profiles?.email}</p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {inv.annual_income === null && (
                    <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full">No income</span>
                  )}
                  {inv.net_worth === null && (
                    <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full">No net worth</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            These investors cannot have their Reg A limits computed until they provide suitability information.
          </p>
        </div>
      )}

      {/* Full investor table */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">
          Non-Accredited Investor Capacity
          <span className="ml-2 text-sm font-normal text-gray-400">({investorRows.length})</span>
        </h2>
        {investorRows.length === 0 ? (
          <p className="text-sm text-gray-400">No non-accredited investors found.</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Investor</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-gray-500">Limit</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-gray-500">Used</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-gray-500">Remaining</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500">Utilization</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {investorRows.map(({ inv, limit, used, remaining, pct }) => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-900 text-sm">{inv.profiles?.full_name ?? '—'}</p>
                      <p className="text-xs text-gray-400">{inv.profiles?.email}</p>
                    </td>
                    <td className="px-5 py-3 text-right text-sm text-gray-700">
                      {limit !== null ? formatCurrency(limit) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-5 py-3 text-right text-sm text-gray-700">
                      {formatCurrency(used)}
                    </td>
                    <td className={`px-5 py-3 text-right text-sm font-medium ${
                      remaining === 0 ? 'text-red-600' :
                      pct >= 80     ? 'text-amber-600' : 'text-green-700'
                    }`}>
                      {remaining !== null ? formatCurrency(remaining) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-5 py-3">
                      {limit !== null && limit > 0 ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden max-w-24">
                            <div
                              className={`h-full rounded-full ${
                                pct >= 100 ? 'bg-red-500' :
                                pct >= 80  ? 'bg-amber-400' : 'bg-indigo-500'
                              }`}
                              style={{ width: `${pct.toFixed(1)}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500">{pct.toFixed(0)}%</span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">no data</span>
                      )}
                    </td>
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
