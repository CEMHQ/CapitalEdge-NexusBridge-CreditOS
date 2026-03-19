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
        <h1 className="text-2xl font-semibold text-gray-900">Investors</h1>
        <p className="text-sm text-gray-500 mt-1">{investors?.length ?? 0} total investors</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Investor</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Accreditation</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">KYC</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Onboarding</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Joined</th>
              <th className="px-6 py-3" />
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {investors?.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-sm text-gray-400">
                  No investors yet.
                </td>
              </tr>
            )}
            {investors?.map((inv) => {
              const profile = Array.isArray(inv.profiles) ? inv.profiles[0] : inv.profiles
              return (
                <tr key={inv.id} className="hover:bg-gray-50 transition-colors align-top">
                  <td className="px-6 py-4">
                    <p className="text-sm font-medium text-gray-900">{profile?.full_name ?? '—'}</p>
                    <p className="text-xs text-gray-500">{profile?.email ?? '—'}</p>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 capitalize">{inv.investor_type}</td>
                  <td className="px-6 py-4">
                    <StatusBadge status={inv.accreditation_status} map={accreditationColors} />
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={inv.kyc_status} map={kycColors} />
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={inv.onboarding_status} map={onboardingColors} />
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {formatDate(inv.created_at)}
                  </td>
                  <td className="px-6 py-4">
                    <EditInvestorStatusButton
                      investorId={inv.id}
                      accreditationStatus={inv.accreditation_status}
                      kycStatus={inv.kyc_status}
                      onboardingStatus={inv.onboarding_status}
                    />
                  </td>
                  <td className="px-6 py-4">
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
