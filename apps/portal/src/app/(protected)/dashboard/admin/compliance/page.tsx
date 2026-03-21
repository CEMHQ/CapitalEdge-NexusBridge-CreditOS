import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatDate } from '@/lib/format'
import Link from 'next/link'
import ReviewAccreditationModal from '@/components/admin/ReviewAccreditationModal'

type AccredRow = {
  id: string
  investor_id: string
  verification_method: string
  status: string
  verified_at: string | null
  expires_at: string | null
  reviewer_notes: string | null
  created_at: string
  investors: { profiles: { full_name: string | null; email: string | null } | null } | null
}

export default async function AdminCompliancePage({
  searchParams,
}: {
  searchParams: Promise<{ review?: string }>
}) {
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  const { review: reviewId } = await searchParams
  const supabase = await createClient()
  const adminClient = createAdminClient()

  // If ?review=<id>, fetch that record for the modal
  let reviewRecord: {
    id: string
    investor_id: string
    verification_method: string
    status: string
    verified_at: string | null
    expires_at: string | null
    reviewer_notes: string | null
    created_at: string
    investor_name: string | null
    investor_email: string | null
  } | null = null

  if (reviewId) {
    const { data: rec } = await adminClient
      .from('accreditation_records')
      .select(`
        id, investor_id, verification_method, status, verified_at, expires_at, reviewer_notes, created_at,
        investors ( profiles ( full_name, email ) )
      `)
      .eq('id', reviewId)
      .maybeSingle()

    if (rec) {
      const r = rec as unknown as AccredRow
      reviewRecord = {
        id:                  r.id,
        investor_id:         r.investor_id,
        verification_method: r.verification_method,
        status:              r.status,
        verified_at:         r.verified_at,
        expires_at:          r.expires_at,
        reviewer_notes:      r.reviewer_notes,
        created_at:          r.created_at,
        investor_name:       r.investors?.profiles?.full_name ?? null,
        investor_email:      r.investors?.profiles?.email ?? null,
      }
    }
  }

  // Pending accreditation records
  const { data: pendingAccreditation } = await supabase
    .from('accreditation_records')
    .select(`
      id, investor_id, verification_method, status, verified_at, expires_at, reviewer_notes, created_at,
      investors ( profiles ( full_name, email ) )
    `)
    .in('status', ['pending', 'under_review'])
    .order('created_at', { ascending: true })

  // All accreditation records
  const { data: allAccreditation } = await supabase
    .from('accreditation_records')
    .select(`
      id, investor_id, verification_method, status, verified_at, expires_at, reviewer_notes, created_at,
      investors ( profiles ( full_name, email ) )
    `)
    .order('created_at', { ascending: false })
    .limit(50)

  // Expiring soon (within 30 days)
  const thirtyDaysOut = new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data: expiringAccreditation } = await supabase
    .from('accreditation_records')
    .select(`
      id, investor_id, verification_method, status, verified_at, expires_at, created_at,
      investors ( profiles ( full_name, email ) )
    `)
    .eq('status', 'verified')
    .lte('expires_at', thirtyDaysOut)
    .gte('expires_at', new Date(now).toISOString())
    .order('expires_at', { ascending: true })

  // Investors overview
  const { data: investors } = await supabase
    .from('investors')
    .select(`
      id, investor_type, accreditation_status, kyc_status, aml_status, onboarding_status, created_at,
      profiles ( full_name, email )
    `)
    .order('created_at', { ascending: false })
    .limit(50)

  // Subscriptions awaiting PPM
  const { data: awaitingPpm } = await supabase
    .from('fund_subscriptions')
    .select(`
      id, commitment_amount, subscription_status, ppm_acknowledged_at, created_at,
      investors ( profiles ( full_name, email ) )
    `)
    .eq('subscription_status', 'pending')
    .is('ppm_acknowledged_at', null)
    .order('created_at', { ascending: true })

  const pendingCount     = (pendingAccreditation ?? []).length
  const expiringCount    = (expiringAccreditation ?? []).length
  const awaitingPpmCount = (awaitingPpm ?? []).length

  return (
    <div className="space-y-8">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Compliance</h1>
        <p className="text-sm text-gray-500 mt-1">506(c) accreditation queue, KYC/AML status, subscription gating</p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          title="Pending Accreditation"
          value={String(pendingCount)}
          note="Awaiting compliance review"
          urgent={pendingCount > 0}
        />
        <MetricCard
          title="Expiring Within 30 Days"
          value={String(expiringCount)}
          note="Must re-verify before next subscription"
          urgent={expiringCount > 0}
        />
        <MetricCard
          title="Awaiting PPM Signature"
          value={String(awaitingPpmCount)}
          note="Subscription blocked until PPM signed"
          urgent={awaitingPpmCount > 0}
        />
      </div>

      {/* Pending Accreditation Queue */}
      {pendingCount > 0 && (
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-3">
            Accreditation Queue
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
              {pendingCount} pending
            </span>
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Investor</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Method</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Status</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">Submitted</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(pendingAccreditation ?? []).map((rec) => {
                  const r = rec as unknown as AccredRow
                  const inv = r.investors
                  return (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3">
                        <p className="font-medium text-gray-900">{inv?.profiles?.full_name ?? '—'}</p>
                        <p className="text-xs text-gray-500">{inv?.profiles?.email ?? '—'}</p>
                      </td>
                      <td className="px-5 py-3 text-gray-600 capitalize">{r.verification_method.replace(/_/g, ' ')}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${accreditationBadge(r.status)}`}>
                          {r.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right text-gray-600">{formatDate(r.created_at)}</td>
                      <td className="px-5 py-3 text-right">
                        <ReviewAccreditationButtons recordId={r.id} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Expiring Accreditation */}
      {expiringCount > 0 && (
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-3">
            Expiring Accreditation
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
              {expiringCount} expiring soon
            </span>
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Investor</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Method</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">Verified</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">Expires</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(expiringAccreditation ?? []).map((rec) => {
                  const r = rec as unknown as AccredRow
                  const inv = r.investors
                  const daysLeft = r.expires_at
                    ? Math.ceil((new Date(r.expires_at).getTime() - now) / (1000 * 60 * 60 * 24))
                    : null
                  return (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3">
                        <p className="font-medium text-gray-900">{inv?.profiles?.full_name ?? '—'}</p>
                        <p className="text-xs text-gray-500">{inv?.profiles?.email ?? '—'}</p>
                      </td>
                      <td className="px-5 py-3 text-gray-600 capitalize">{r.verification_method.replace(/_/g, ' ')}</td>
                      <td className="px-5 py-3 text-right text-gray-600">{r.verified_at ? formatDate(r.verified_at) : '—'}</td>
                      <td className="px-5 py-3 text-right">
                        <span className={`text-sm font-medium ${daysLeft !== null && daysLeft <= 7 ? 'text-red-600' : 'text-amber-600'}`}>
                          {r.expires_at ? formatDate(r.expires_at) : '—'}
                          {daysLeft !== null && <span className="text-xs ml-1">({daysLeft}d)</span>}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Awaiting PPM */}
      {awaitingPpmCount > 0 && (
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-3">
            Subscriptions Awaiting PPM Signature
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
              {awaitingPpmCount} blocked
            </span>
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Investor</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">Committed</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">Subscribed</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">PPM Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(awaitingPpm ?? []).map((sub) => {
                  type SubRow = { id: string; commitment_amount: string; subscription_status: string; ppm_acknowledged_at: string | null; created_at: string; investors: { profiles: { full_name: string | null; email: string | null } | null } | null }
                  const s = sub as unknown as SubRow
                  const inv = s.investors
                  return (
                    <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3">
                        <p className="font-medium text-gray-900">{inv?.profiles?.full_name ?? '—'}</p>
                        <p className="text-xs text-gray-500">{inv?.profiles?.email ?? '—'}</p>
                      </td>
                      <td className="px-5 py-3 text-right font-medium text-gray-900">
                        ${Number(s.commitment_amount).toLocaleString()}
                      </td>
                      <td className="px-5 py-3 text-right text-gray-600">{formatDate(s.created_at)}</td>
                      <td className="px-5 py-3 text-right">
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-50 text-amber-700">
                          PPM not signed
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="text-xs text-gray-400 px-5 py-3 border-t border-gray-100">
              Go to Fund Operations to send PPM acknowledgment. Subscriptions cannot be approved until the investor signs the PPM.
            </p>
          </div>
        </div>
      )}

      {/* All Investor Compliance Status */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Investor Compliance Overview</h2>
        {!investors || investors.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-sm text-gray-500">No investors yet.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Investor</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Type</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Accreditation</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">KYC</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">AML</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Onboarding</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {investors.map((inv) => {
                  type InvRow = { id: string; investor_type: string; accreditation_status: string; kyc_status: string; aml_status: string; onboarding_status: string; created_at: string; profiles: { full_name: string | null; email: string | null } | null }
                  const i = inv as unknown as InvRow
                  const prof = i.profiles
                  return (
                    <tr key={i.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3">
                        <p className="font-medium text-gray-900">{prof?.full_name ?? '—'}</p>
                        <p className="text-xs text-gray-500">{prof?.email ?? '—'}</p>
                      </td>
                      <td className="px-5 py-3 text-gray-600 capitalize">{i.investor_type}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${accreditationBadge(i.accreditation_status)}`}>
                          {i.accreditation_status}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${kycBadge(i.kyc_status)}`}>
                          {i.kyc_status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${amlBadge(i.aml_status)}`}>
                          {i.aml_status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${onboardingBadge(i.onboarding_status)}`}>
                          {i.onboarding_status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right text-gray-600">{formatDate(i.created_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* All Accreditation Records */}
      {allAccreditation && allAccreditation.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-3">All Accreditation Records</h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Investor</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Method</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Status</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">Submitted</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">Verified</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">Expires</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {allAccreditation.map((rec) => {
                  const r = rec as unknown as AccredRow
                  const inv = r.investors
                  return (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3">
                        <p className="font-medium text-gray-900">{inv?.profiles?.full_name ?? '—'}</p>
                        <p className="text-xs text-gray-500">{inv?.profiles?.email ?? '—'}</p>
                      </td>
                      <td className="px-5 py-3 text-gray-600 capitalize">{r.verification_method.replace(/_/g, ' ')}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${accreditationBadge(r.status)}`}>
                          {r.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right text-gray-600">{formatDate(r.created_at)}</td>
                      <td className="px-5 py-3 text-right text-gray-600">{r.verified_at ? formatDate(r.verified_at) : '—'}</td>
                      <td className="px-5 py-3 text-right text-gray-600">{r.expires_at ? formatDate(r.expires_at) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Review modal — shown when ?review=<id> is present */}
      {reviewRecord && (
        <ReviewAccreditationModal
          record={reviewRecord}
          basePath="/dashboard/admin/compliance"
        />
      )}

    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function accreditationBadge(status: string) {
  switch (status) {
    case 'verified':     return 'bg-green-50 text-green-700'
    case 'under_review': return 'bg-blue-50 text-blue-700'
    case 'pending':      return 'bg-amber-50 text-amber-700'
    case 'rejected':     return 'bg-red-50 text-red-700'
    case 'expired':      return 'bg-orange-50 text-orange-700'
    default:             return 'bg-gray-100 text-gray-600'
  }
}

function kycBadge(status: string) {
  switch (status) {
    case 'approved':    return 'bg-green-50 text-green-700'
    case 'in_progress': return 'bg-blue-50 text-blue-700'
    case 'failed':      return 'bg-red-50 text-red-700'
    default:            return 'bg-gray-100 text-gray-600'
  }
}

function amlBadge(status: string) {
  switch (status) {
    case 'approved':    return 'bg-green-50 text-green-700'
    case 'in_progress': return 'bg-blue-50 text-blue-700'
    case 'failed':      return 'bg-red-50 text-red-700'
    default:            return 'bg-gray-100 text-gray-600'
  }
}

function onboardingBadge(status: string) {
  switch (status) {
    case 'complete':    return 'bg-green-50 text-green-700'
    case 'in_progress': return 'bg-blue-50 text-blue-700'
    default:            return 'bg-amber-50 text-amber-700'
  }
}

// ─── Components ───────────────────────────────────────────────────────────────

function MetricCard({ title, value, note, urgent }: { title: string; value: string; note: string; urgent: boolean }) {
  return (
    <div className={`bg-white rounded-xl border p-5 space-y-1 ${urgent ? 'border-amber-300' : 'border-gray-200'}`}>
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <p className={`text-2xl font-semibold ${urgent ? 'text-amber-600' : 'text-gray-900'}`}>{value}</p>
      <p className="text-xs text-gray-400">{note}</p>
    </div>
  )
}

function ReviewAccreditationButtons({ recordId }: { recordId: string }) {
  return (
    <div className="flex gap-2 justify-end">
      <Link
        href={`/dashboard/admin/compliance?review=${recordId}`}
        className="text-xs px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-md font-medium hover:bg-indigo-100"
      >
        Review
      </Link>
    </div>
  )
}
