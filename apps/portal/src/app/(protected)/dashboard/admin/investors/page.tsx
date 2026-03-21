import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/format'
import EditInvestorStatusButton from '@/components/admin/EditInvestorStatusButton'
import DeleteInvestorButton from '@/components/admin/DeleteInvestorButton'

export default async function AdminInvestorsPage() {
  const supabase = await createClient()

  const { data: investors } = await supabase
    .from('investors')
    .select(`
      id,
      investor_type,
      accreditation_status,
      kyc_status,
      aml_status,
      onboarding_status,
      created_at,
      profiles (
        full_name,
        email
      )
    `)
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Investors</h1>
        <p className="text-sm text-gray-500 mt-1">{investors?.length ?? 0} total investors</p>
      </div>

      {/* ── Mobile: card list ───────────────────────────────────────── */}
      <div className="sm:hidden space-y-3">
        {!investors?.length && (
          <p className="text-sm text-gray-400 text-center py-8">No investors yet.</p>
        )}
        {investors?.map((inv) => {
          const profile = Array.isArray(inv.profiles) ? inv.profiles[0] : inv.profiles
          return (
            <div key={inv.id} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{profile?.full_name ?? '—'}</p>
                  <p className="text-xs text-gray-400 truncate">{profile?.email ?? '—'}</p>
                </div>
                <span className="shrink-0 text-xs text-gray-500 capitalize">{inv.investor_type}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <span className="text-gray-500">Accreditation</span>
                <StatusBadge status={inv.accreditation_status} map={accreditationColors} />
                <span className="text-gray-500">KYC</span>
                <StatusBadge status={inv.kyc_status} map={kycColors} />
                <span className="text-gray-500">Onboarding</span>
                <StatusBadge status={inv.onboarding_status} map={onboardingColors} />
                <span className="text-gray-500">Joined</span>
                <span className="text-gray-700">{formatDate(inv.created_at)}</span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                <EditInvestorStatusButton
                  investorId={inv.id}
                  accreditationStatus={inv.accreditation_status}
                  kycStatus={inv.kyc_status}
                  onboardingStatus={inv.onboarding_status}
                />
                <DeleteInvestorButton investorId={inv.id} />
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Desktop: table ──────────────────────────────────────────── */}
      <div className="hidden sm:block overflow-x-auto rounded-xl border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Investor</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Type</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Accreditation</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">KYC</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Onboarding</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Joined</th>
              <th className="px-4 py-3" />
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {investors?.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">
                  No investors yet.
                </td>
              </tr>
            )}
            {investors?.map((inv) => {
              const profile = Array.isArray(inv.profiles) ? inv.profiles[0] : inv.profiles
              return (
                <tr key={inv.id} className="hover:bg-gray-50 transition-colors align-top">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900 whitespace-nowrap">{profile?.full_name ?? '—'}</p>
                    <p className="text-xs text-gray-500 whitespace-nowrap">{profile?.email ?? '—'}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 capitalize whitespace-nowrap">{inv.investor_type}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <StatusBadge status={inv.accreditation_status} map={accreditationColors} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <StatusBadge status={inv.kyc_status} map={kycColors} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <StatusBadge status={inv.onboarding_status} map={onboardingColors} />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                    {formatDate(inv.created_at)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <EditInvestorStatusButton
                      investorId={inv.id}
                      accreditationStatus={inv.accreditation_status}
                      kycStatus={inv.kyc_status}
                      onboardingStatus={inv.onboarding_status}
                    />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <DeleteInvestorButton investorId={inv.id} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const accreditationColors: Record<string, string> = {
  verified: 'bg-green-50 text-green-700',
  pending: 'bg-amber-50 text-amber-700',
  expired: 'bg-red-50 text-red-700',
}

const kycColors: Record<string, string> = {
  approved: 'bg-green-50 text-green-700',
  in_progress: 'bg-blue-50 text-blue-700',
  not_started: 'bg-gray-100 text-gray-600',
  failed: 'bg-red-50 text-red-700',
}

const onboardingColors: Record<string, string> = {
  complete: 'bg-green-50 text-green-700',
  pending: 'bg-amber-50 text-amber-700',
  in_progress: 'bg-blue-50 text-blue-700',
}

function StatusBadge({
  status,
  map,
}: {
  status: string
  map: Record<string, string>
}) {
  const colors = map[status] ?? 'bg-gray-100 text-gray-600'
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  return (
    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${colors}`}>
      {label}
    </span>
  )
}
