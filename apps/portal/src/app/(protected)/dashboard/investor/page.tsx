import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/format'
import { SubscribeForm } from '@/components/investor/SubscribeForm'

export default async function InvestorDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, status, created_at')
    .eq('id', user!.id)
    .single()

  // Get or create investor record
  let investor = null
  const { data: existingInvestor } = await supabase
    .from('investors')
    .select('id, investor_type, accreditation_status, kyc_status, aml_status, onboarding_status, created_at')
    .eq('profile_id', user!.id)
    .single()

  if (existingInvestor) {
    investor = existingInvestor
  } else {
    const { data: newInvestor } = await supabase
      .from('investors')
      .insert({ profile_id: user!.id })
      .select('id, investor_type, accreditation_status, kyc_status, aml_status, onboarding_status, created_at')
      .single()
    investor = newInvestor
  }

  // Fetch capital account if investor record exists
  let subscription = null
  const metrics = { total_committed: 0, total_deployed: 0, undeployed: 0, allocation_count: 0 }
  let nav = null
  let fund: { id: string; fund_name: string; fund_status: string } | null = null

  if (investor) {
    const { data: sub } = await supabase
      .from('fund_subscriptions')
      .select(`
        id, commitment_amount, funded_amount, subscription_status,
        fcfs_position, confirmed_at, reservation_expires_at
      `)
      .eq('investor_id', investor.id)
      .in('subscription_status', ['pending', 'approved', 'active'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    subscription = sub

    // Query active fund separately — avoids Supabase join union type inference.
    // Only needed when investor has no subscription (used for the subscribe CTA).
    if (!sub) {
      const { data: activeFund } = await supabase
        .from('funds')
        .select('id, fund_name, fund_status')
        .eq('fund_status', 'active')
        .limit(1)
        .maybeSingle()
      fund = activeFund
    }

    if (subscription) {
      metrics.total_committed = Number(subscription.commitment_amount)
      metrics.total_deployed  = Number(subscription.funded_amount)
      metrics.undeployed      = metrics.total_committed - metrics.total_deployed

      const { data: allocs } = await supabase
        .from('fund_allocations')
        .select('id')
        .eq('subscription_id', subscription.id)
        .eq('allocation_status', 'active')

      metrics.allocation_count = allocs?.length ?? 0
    }

    const { data: latestNav } = await supabase
      .from('nav_snapshots')
      .select('snapshot_date, total_nav, nav_per_unit, total_deployed, total_committed, investor_count')
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    nav = latestNav

    // Get open fund for subscribe form
    if (!fund) {
      const { data: openFund } = await supabase
        .from('funds')
        .select('id, fund_name, fund_status')
        .eq('fund_status', 'open')
        .single()
      fund = openFund
    }
  }

  const displayName = profile?.full_name ?? user?.email
  const isVerified  = investor?.accreditation_status === 'verified'
  const hasActiveSub = subscription?.subscription_status === 'active'

  return (
    <div className="space-y-8">

      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Investor Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Welcome back, {displayName}</p>
      </div>

      {/* Accreditation notice */}
      {investor?.accreditation_status === 'pending' && investor.onboarding_status === 'pending' && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-amber-800">Accreditation required to invest</p>
            <p className="text-sm text-amber-700 mt-0.5">
              Complete your accreditation verification to subscribe to NexusBridge Capital LP.
              This is required under SEC Rule 506(c).
            </p>
          </div>
          <a
            href="/dashboard/investor/onboarding"
            className="w-full sm:w-auto shrink-0 text-xs font-medium bg-amber-700 text-white px-3 py-1.5 rounded-lg hover:bg-amber-800 transition-colors text-center"
          >
            Start →
          </a>
        </div>
      )}
      {investor?.accreditation_status === 'pending' && investor.onboarding_status === 'in_progress' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-blue-800">Accreditation under review</p>
            <p className="text-sm text-blue-700 mt-0.5">
              Your accreditation request is being reviewed. We will notify you at {user?.email} once a decision is made.
            </p>
          </div>
          <a
            href="/dashboard/investor/compliance"
            className="w-full sm:w-auto shrink-0 text-xs font-medium bg-blue-700 text-white px-3 py-1.5 rounded-lg hover:bg-blue-800 transition-colors text-center"
          >
            View Status →
          </a>
        </div>
      )}

      {/* Account summary */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Account Summary</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatusCard
            title="Accreditation Status"
            value={formatStatus(investor?.accreditation_status ?? 'pending')}
            badge={accreditationBadge(investor?.accreditation_status ?? 'pending')}
          />
          <StatusCard
            title="KYC Status"
            value={formatStatus(investor?.kyc_status ?? 'not_started')}
            badge={kycBadge(investor?.kyc_status ?? 'not_started')}
          />
          <StatusCard
            title="Member Since"
            value={investor?.created_at ? formatDate(investor.created_at) : '—'}
            badge={null}
          />
        </div>
      </div>

      {/* Fund overview */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">NexusBridge Capital LP</h2>
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-gray-900">Private Credit Fund</p>
              <p className="text-xs text-gray-500 mt-0.5">Reg D / Rule 506(c) · Accredited investors only</p>
            </div>
            <span className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-700 font-medium">Active</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-gray-100">
            <div>
              <p className="text-xs text-gray-500">Strategy</p>
              <p className="text-sm font-medium text-gray-900 mt-0.5">Asset-Backed Lending</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Loan Duration</p>
              <p className="text-sm font-medium text-gray-900 mt-0.5">6 – 12 months</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Managed by</p>
              <p className="text-sm font-medium text-gray-900 mt-0.5">Capital Edge Management</p>
            </div>
          </div>

          {/* Subscribe CTA — only if verified and no active subscription */}
          {isVerified && !subscription && fund && (
            <div className="pt-2 border-t border-gray-100">
              <SubscribeForm fundId={fund.id} />
            </div>
          )}

          {/* Pending subscription notice */}
          {subscription && subscription.subscription_status === 'pending' && (
            <div className="pt-2 border-t border-gray-100">
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                <p className="text-sm font-medium text-amber-800">
                  Subscription pending review · Queue position #{subscription.fcfs_position}
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Committed: {formatCurrency(Number(subscription.commitment_amount))}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Capital account */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Capital Account</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Total Committed"
            value={metrics.total_committed > 0 ? formatCurrency(metrics.total_committed) : null}
            note={metrics.total_committed > 0 ? subscriptionStatusLabel(subscription?.subscription_status) : 'No active subscription'}
          />
          <MetricCard
            title="Capital Deployed"
            value={metrics.total_deployed > 0 ? formatCurrency(metrics.total_deployed) : null}
            note={metrics.total_deployed > 0 ? `${metrics.allocation_count} loan allocation${metrics.allocation_count !== 1 ? 's' : ''}` : 'Pending deployment'}
          />
          <MetricCard
            title="Undeployed"
            value={metrics.total_committed > 0 ? formatCurrency(metrics.undeployed) : null}
            note="Available for allocation"
          />
          <MetricCard
            title="NAV per Unit"
            value={nav ? `$${Number(nav.nav_per_unit).toFixed(4)}` : null}
            note={nav ? `As of ${formatDate(nav.snapshot_date)}` : 'No NAV recorded yet'}
          />
        </div>
      </div>

      {/* Statements & Documents */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Statements & Documents</h2>
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
          {hasActiveSub ? (
            <>
              <p className="text-sm text-gray-600">Quarterly statements and K-1 tax documents will appear here.</p>
              <p className="text-xs text-gray-400 mt-1">First statement generated after quarter close.</p>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-500">Quarterly statements and tax documents will appear here.</p>
              <p className="text-xs text-gray-400 mt-1">Available once your subscription is active.</p>
            </>
          )}
        </div>
      </div>

    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatStatus(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function subscriptionStatusLabel(status?: string) {
  switch (status) {
    case 'pending':  return 'Pending admin review'
    case 'approved': return 'Approved — deploying capital'
    case 'active':   return 'Active'
    default: return ''
  }
}

function accreditationBadge(status: string) {
  switch (status) {
    case 'verified': return 'bg-green-50 text-green-700'
    case 'pending':  return 'bg-amber-50 text-amber-700'
    case 'expired':  return 'bg-red-50 text-red-700'
    default: return 'bg-gray-100 text-gray-600'
  }
}

function kycBadge(status: string) {
  switch (status) {
    case 'approved':    return 'bg-green-50 text-green-700'
    case 'in_progress': return 'bg-blue-50 text-blue-700'
    case 'not_started': return 'bg-gray-100 text-gray-600'
    case 'failed':      return 'bg-red-50 text-red-700'
    default: return 'bg-gray-100 text-gray-600'
  }
}

// ─── Components ───────────────────────────────────────────────────────────────

function StatusCard({ title, value, badge }: { title: string; value: string; badge: string | null }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-2">
      <p className="text-sm font-medium text-gray-500">{title}</p>
      {badge ? (
        <span className={`inline-block text-sm px-2.5 py-1 rounded-full font-medium ${badge}`}>{value}</span>
      ) : (
        <p className="text-sm font-semibold text-gray-900">{value}</p>
      )}
    </div>
  )
}

function MetricCard({ title, value, note }: { title: string; value: string | null; note: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-1">
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <p className={`text-2xl font-semibold ${value ? 'text-gray-900' : 'text-gray-300'}`}>
        {value ?? '—'}
      </p>
      <p className="text-xs text-gray-400">{note}</p>
    </div>
  )
}
