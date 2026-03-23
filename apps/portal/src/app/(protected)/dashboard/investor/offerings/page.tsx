import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/format'
import Link from 'next/link'
import { computeRegALimit, getRollingRegACommitments } from '@/lib/compliance/reg-a'

type Offering = {
  id: string
  title: string
  offering_type: string
  max_offering_amount: number
  min_investment: number
  max_investment: number | null
  offering_open_date: string | null
  offering_close_date: string | null
  jurisdiction_restrictions: string[]
  funds: { id: string; fund_name: string } | null
}

export default async function InvestorOfferingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: investor } = await supabase
    .from('investors')
    .select('id, accreditation_status, annual_income, net_worth')
    .eq('profile_id', user!.id)
    .maybeSingle()

  if (!investor) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-gray-900">Offerings</h1>
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-sm text-gray-500">Investor record not found. Please contact support.</p>
        </div>
      </div>
    )
  }

  const investorJurisdiction = (investor as Record<string, unknown>).jurisdiction as string | null ?? null

  // RLS enforces offering_status = 'active' for investor role
  const { data: rawOfferings } = await supabase
    .from('offerings')
    .select(`
      id, title, offering_type,
      max_offering_amount, min_investment, max_investment,
      offering_open_date, offering_close_date,
      jurisdiction_restrictions,
      funds ( id, fund_name )
    `)
    .order('offering_open_date', { ascending: false })

  // Reg A capacity
  const regALimit = computeRegALimit(
    investor.accreditation_status,
    investor.annual_income ?? null,
    investor.net_worth ?? null,
  )
  const regAUsed = regALimit !== null ? await getRollingRegACommitments(supabase, investor.id) : 0
  const regARemaining = regALimit !== null ? Math.max(0, regALimit - regAUsed) : null

  const isAccredited = investor.accreditation_status === 'verified'

  // Filter out jurisdiction-restricted offerings
  const offerings = ((rawOfferings ?? []) as unknown as Offering[]).filter(o => {
    if (!investorJurisdiction) return true
    const restricted = Array.isArray(o.jurisdiction_restrictions) ? o.jurisdiction_restrictions : []
    return !restricted.includes(investorJurisdiction)
  })

  return (
    <div className="space-y-8 max-w-3xl">

      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Investment Offerings</h1>
        <p className="text-sm text-gray-500 mt-1">Active offerings available to your account</p>
      </div>

      {/* Reg A capacity banner — shown only for non-accredited investors */}
      {!isAccredited && regALimit !== null && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-gray-700">Your Reg A Annual Capacity</p>
            <Link href="/dashboard/investor/compliance" className="text-xs text-indigo-600 hover:text-indigo-800">
              View details →
            </Link>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
            <div
              className={`h-full rounded-full transition-all ${
                regAUsed / regALimit >= 0.9 ? 'bg-red-500' :
                regAUsed / regALimit >= 0.7 ? 'bg-amber-400' : 'bg-indigo-500'
              }`}
              style={{ width: `${Math.min(100, (regAUsed / regALimit) * 100).toFixed(1)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>Used: <strong className="text-gray-900">${regAUsed.toLocaleString()}</strong></span>
            <span>Remaining: <strong className={`${(regARemaining ?? 0) === 0 ? 'text-red-600' : 'text-green-700'}`}>
              ${(regARemaining ?? 0).toLocaleString()}
            </strong></span>
            <span>Limit: <strong className="text-gray-900">${regALimit.toLocaleString()}</strong></span>
          </div>
          {investorJurisdiction == null && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-3">
              Add your state of residence on the{' '}
              <Link href="/dashboard/investor/compliance" className="underline">Compliance</Link>{' '}
              page to verify offering availability in your jurisdiction.
            </p>
          )}
        </div>
      )}

      {/* Offering list */}
      {offerings.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-sm text-gray-500">No active offerings are currently available.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {offerings.map(o => (
            <OfferingCard
              key={o.id}
              offering={o}
              isAccredited={isAccredited}
              regARemaining={o.offering_type === 'reg_a' ? regARemaining : null}
            />
          ))}
        </div>
      )}

    </div>
  )
}

// ─── Offering Card ─────────────────────────────────────────────────────────────

function OfferingCard({
  offering,
  isAccredited,
  regARemaining,
}: {
  offering: Offering
  isAccredited: boolean
  regARemaining: number | null
}) {
  const isRegA    = offering.offering_type === 'reg_a'
  const isRegD    = offering.offering_type === 'reg_d'
  const isClosed  = offering.offering_close_date
    ? new Date(offering.offering_close_date) < new Date()
    : false
  const canSubscribe = !isClosed && (isAccredited || isRegA)
  const atLimit   = isRegA && !isAccredited && regARemaining !== null && regARemaining <= 0

  return (
    <div className="bg-white rounded-xl border border-gray-200 hover:border-gray-300 transition-colors overflow-hidden">
      <div className="px-5 py-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                isRegA ? 'bg-indigo-50 text-indigo-700' :
                isRegD ? 'bg-violet-50 text-violet-700' :
                         'bg-gray-100 text-gray-600'
              }`}>
                {offering.offering_type.replace('_', ' ').toUpperCase()}
              </span>
              {isClosed && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">
                  Closed
                </span>
              )}
            </div>
            <h3 className="text-base font-semibold text-gray-900 truncate">{offering.title}</h3>
            {offering.funds && (
              <p className="text-xs text-gray-500 mt-0.5">{offering.funds.fund_name}</p>
            )}
          </div>

          <div className="flex flex-col items-start sm:items-end gap-1.5 shrink-0">
            {canSubscribe && !atLimit ? (
              <Link
                href={`/dashboard/investor/offerings/${offering.id}`}
                className="px-4 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors whitespace-nowrap"
              >
                View &amp; Subscribe
              </Link>
            ) : (
              <Link
                href={`/dashboard/investor/offerings/${offering.id}`}
                className="px-4 py-1.5 bg-gray-100 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap"
              >
                View Details
              </Link>
            )}
            {isRegD && !isAccredited && (
              <p className="text-xs text-amber-600 text-right">Requires accreditation</p>
            )}
            {atLimit && (
              <p className="text-xs text-red-600 text-right">Annual limit reached</p>
            )}
          </div>
        </div>

        {/* Key terms */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-gray-50">
          <Stat label="Min Investment" value={`$${Number(offering.min_investment).toLocaleString()}`} />
          <Stat label="Max Offering"   value={`$${Number(offering.max_offering_amount).toLocaleString()}`} />
          <Stat label="Opens"          value={offering.offering_open_date  ? formatDate(offering.offering_open_date)  : '—'} />
          <Stat label="Closes"         value={offering.offering_close_date ? formatDate(offering.offering_close_date) : '—'} />
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm font-medium text-gray-900 mt-0.5">{value}</p>
    </div>
  )
}
