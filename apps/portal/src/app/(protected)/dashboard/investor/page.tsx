import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/format'

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

  const displayName = profile?.full_name ?? user?.email

  return (
    <div className="space-y-8">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Investor Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Welcome back, {displayName}</p>
      </div>

      {/* Accreditation notice */}
      {investor?.accreditation_status === 'pending' && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <p className="text-sm font-medium text-amber-800">Accreditation verification pending</p>
          <p className="text-sm text-amber-700 mt-0.5">
            Your accredited investor status is under review. The NexusBridge team will contact you at {user?.email} to complete verification.
          </p>
        </div>
      )}

      {/* Account summary cards */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Account Summary</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
          <div className="flex items-start justify-between">
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
        </div>
      </div>

      {/* Capital account — Phase 3 placeholder */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Capital Account</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <PlaceholderCard title="Total Committed" note="Available Phase 3" />
          <PlaceholderCard title="Capital Deployed" note="Available Phase 3" />
          <PlaceholderCard title="Distributions Received" note="Available Phase 3" />
          <PlaceholderCard title="Current Yield" note="Available Phase 3" />
        </div>
      </div>

      {/* Statements & Documents — Phase 3 placeholder */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Statements & Documents</h2>
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
          <p className="text-sm text-gray-500">Quarterly statements and tax documents will appear here.</p>
          <p className="text-xs text-gray-400 mt-1">Available when fund operations begin (Phase 3)</p>
        </div>
      </div>

    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatStatus(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function accreditationBadge(status: string) {
  switch (status) {
    case 'verified': return 'bg-green-50 text-green-700'
    case 'pending': return 'bg-amber-50 text-amber-700'
    case 'expired': return 'bg-red-50 text-red-700'
    default: return 'bg-gray-100 text-gray-600'
  }
}

function kycBadge(status: string) {
  switch (status) {
    case 'approved': return 'bg-green-50 text-green-700'
    case 'in_progress': return 'bg-blue-50 text-blue-700'
    case 'not_started': return 'bg-gray-100 text-gray-600'
    case 'failed': return 'bg-red-50 text-red-700'
    default: return 'bg-gray-100 text-gray-600'
  }
}

// ─── Components ───────────────────────────────────────────────────────────────

function StatusCard({
  title,
  value,
  badge,
}: {
  title: string
  value: string
  badge: string | null
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-2">
      <p className="text-sm font-medium text-gray-500">{title}</p>
      {badge ? (
        <span className={`inline-block text-sm px-2.5 py-1 rounded-full font-medium ${badge}`}>
          {value}
        </span>
      ) : (
        <p className="text-sm font-semibold text-gray-900">{value}</p>
      )}
    </div>
  )
}

function PlaceholderCard({ title, note }: { title: string; note: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-1">
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <p className="text-2xl font-semibold text-gray-300">—</p>
      <p className="text-xs text-gray-400">{note}</p>
    </div>
  )
}
