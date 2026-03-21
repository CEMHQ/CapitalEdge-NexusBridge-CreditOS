import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/format'
import Link from 'next/link'

export default async function InvestorCompliancePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: investor } = await supabase
    .from('investors')
    .select('id, investor_type, accreditation_status, kyc_status, aml_status, onboarding_status, created_at')
    .eq('profile_id', user!.id)
    .maybeSingle()

  if (!investor) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-gray-900">Compliance Status</h1>
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-sm text-gray-500">Investor record not found. Please contact support.</p>
        </div>
      </div>
    )
  }

  // Accreditation records
  const { data: accreditationRecords } = await supabase
    .from('accreditation_records')
    .select('id, verification_method, provider, status, verified_at, expires_at, reviewer_notes, created_at')
    .eq('investor_id', investor.id)
    .order('created_at', { ascending: false })

  const latestAccreditation = accreditationRecords?.[0] ?? null

  // Active subscription with signature data
  const { data: subscription } = await supabase
    .from('fund_subscriptions')
    .select('id, subscription_status, commitment_amount, funded_amount, fcfs_position, ppm_acknowledged_at, confirmed_at, created_at, funds ( fund_name )')
    .eq('investor_id', investor.id)
    .in('subscription_status', ['pending', 'approved', 'active', 'pending_signature'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Signature requests for subscription
  type SigRow = { id: string; document_type: string; status: string; sent_at: string | null; completed_at: string | null }
  let subSigs: SigRow[] = []
  if (subscription) {
    const { data } = await supabase
      .from('signature_requests')
      .select('id, document_type, status, sent_at, completed_at')
      .eq('entity_type', 'subscription')
      .eq('entity_id', subscription.id)
      .order('created_at', { ascending: false })
    subSigs = (data ?? []) as SigRow[]
  }

  const ppmSig = subSigs.find(s => s.document_type === 'ppm_acknowledgment')
  const subAgreementSig = subSigs.find(s => s.document_type === 'subscription_agreement')

  // Compliance checklist
  const isAccredited    = investor.accreditation_status === 'verified'
  const kycApproved     = investor.kyc_status === 'approved'
  const ppmSigned       = !!subscription?.ppm_acknowledged_at
  const subSigned       = subAgreementSig?.status === 'signed'
  const hasSubscription = !!subscription

  const allComplete = isAccredited && kycApproved && ppmSigned && subSigned

  // Expiry warning
  const expiresAt = latestAccreditation?.expires_at ? new Date(latestAccreditation.expires_at) : null
  const daysUntilExpiry = expiresAt ? Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null
  const expiryWarning = daysUntilExpiry !== null && daysUntilExpiry <= 30

  return (
    <div className="space-y-8 max-w-3xl">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Compliance Status</h1>
          <p className="text-sm text-gray-500 mt-1">Your 506(c) accreditation and subscription compliance record</p>
        </div>
        {!isAccredited && investor.onboarding_status !== 'in_progress' && (
          <Link
            href="/dashboard/investor/onboarding"
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Start Verification
          </Link>
        )}
      </div>

      {/* Expiry warning */}
      {expiryWarning && isAccredited && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-amber-800">Accreditation expiring soon</p>
          <p className="text-sm text-amber-700 mt-0.5">
            Your accreditation verification expires in <strong>{daysUntilExpiry} day{daysUntilExpiry !== 1 ? 's' : ''}</strong> on {formatDate(expiresAt!.toISOString())}.
            Re-verification is required before new subscriptions or capital deployments.
          </p>
          <Link href="/dashboard/investor/onboarding" className="text-sm font-medium text-amber-800 underline mt-2 inline-block">
            Renew accreditation →
          </Link>
        </div>
      )}

      {/* Compliance Checklist */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Compliance Checklist</h2>
          {allComplete && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-green-50 text-green-700 font-medium">All Complete</span>
          )}
        </div>
        <div className="divide-y divide-gray-50">
          <ChecklistItem
            label="Identity Verification (KYC)"
            status={kycApproved ? 'complete' : investor.kyc_status === 'in_progress' ? 'in_progress' : 'pending'}
            detail={kycApproved ? 'Identity verified' : 'Required before subscription'}
          />
          <ChecklistItem
            label="Accreditation Verification"
            status={isAccredited ? 'complete' : latestAccreditation?.status === 'under_review' ? 'in_progress' : latestAccreditation ? 'pending' : 'not_started'}
            detail={
              isAccredited
                ? `Verified ${latestAccreditation?.verified_at ? formatDate(latestAccreditation.verified_at) : ''}${expiresAt ? ` · Expires ${formatDate(expiresAt.toISOString())}` : ''}`
                : latestAccreditation?.status === 'under_review'
                ? 'Under review — typically 1–2 business days'
                : latestAccreditation?.status === 'rejected'
                ? `Not approved: ${latestAccreditation.reviewer_notes ?? 'Contact support'}`
                : latestAccreditation
                ? 'Submission pending review'
                : 'Not started'
            }
            action={!isAccredited && !latestAccreditation ? { label: 'Begin Verification', href: '/dashboard/investor/onboarding' } : undefined}
          />
          <ChecklistItem
            label="PPM Receipt & Acknowledgment"
            status={ppmSigned ? 'complete' : ppmSig?.status === 'sent' || ppmSig?.status === 'viewed' ? 'in_progress' : hasSubscription ? 'pending' : 'not_applicable'}
            detail={
              ppmSigned
                ? `Signed ${subscription?.ppm_acknowledged_at ? formatDate(subscription.ppm_acknowledged_at) : ''}`
                : ppmSig?.status === 'sent'
                ? 'Awaiting your signature — check your email'
                : ppmSig?.status === 'viewed'
                ? 'Document viewed — signature pending'
                : hasSubscription
                ? 'Awaiting admin to send PPM for signature'
                : 'Requires active subscription'
            }
          />
          <ChecklistItem
            label="Subscription Agreement"
            status={subSigned ? 'complete' : subAgreementSig?.status === 'sent' || subAgreementSig?.status === 'viewed' ? 'in_progress' : hasSubscription && ppmSigned ? 'pending' : 'not_applicable'}
            detail={
              subSigned
                ? `Signed ${subAgreementSig?.completed_at ? formatDate(subAgreementSig.completed_at) : ''}`
                : subAgreementSig?.status === 'sent'
                ? 'Awaiting your signature — check your email'
                : subAgreementSig?.status === 'viewed'
                ? 'Document viewed — signature pending'
                : hasSubscription && ppmSigned
                ? 'Awaiting admin to send subscription agreement'
                : ppmSigned
                ? 'Requires subscription'
                : 'Awaiting PPM acknowledgment first'
            }
          />
        </div>
      </div>

      {/* Accreditation History */}
      {accreditationRecords && accreditationRecords.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-3">Accreditation History</h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Method</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Status</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">Submitted</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">Verified</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-5 py-3">Expires</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {accreditationRecords.map((rec) => (
                  <tr key={rec.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-gray-900 capitalize">{rec.verification_method.replace(/_/g, ' ')}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${accreditationStatusBadge(rec.status)}`}>
                        {rec.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right text-gray-600">{formatDate(rec.created_at)}</td>
                    <td className="px-5 py-3 text-right text-gray-600">{rec.verified_at ? formatDate(rec.verified_at) : '—'}</td>
                    <td className="px-5 py-3 text-right text-gray-600">{rec.expires_at ? formatDate(rec.expires_at) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Current Subscription */}
      {subscription && (
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-3">Subscription</h2>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            <Row label="Fund" value={(subscription.funds as unknown as { fund_name: string } | null)?.fund_name ?? 'NexusBridge Capital LP'} />
            <Row label="Status" value={subscription.subscription_status.replace(/_/g, ' ')} />
            <Row label="Committed" value={`$${Number(subscription.commitment_amount).toLocaleString()}`} />
            <Row label="Funded" value={`$${Number(subscription.funded_amount).toLocaleString()}`} />
            {subscription.fcfs_position && <Row label="Queue Position" value={`#${subscription.fcfs_position}`} />}
            {subscription.ppm_acknowledged_at && <Row label="PPM Acknowledged" value={formatDate(subscription.ppm_acknowledged_at)} />}
          </div>
        </div>
      )}

      {/* Regulatory Notice */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Regulatory Notice</p>
        <p className="text-xs text-gray-500 leading-relaxed">
          NexusBridge Capital LP is offered under SEC Rule 506(c) of Regulation D. This offering is available exclusively to verified accredited investors.
          Accreditation verification complies with SEC requirements for reasonable steps to verify investor status.
          Verification records are retained for a minimum of five years per regulatory requirements.
        </p>
      </div>

    </div>
  )
}

// ─── Components ───────────────────────────────────────────────────────────────

type ChecklistStatus = 'complete' | 'in_progress' | 'pending' | 'not_started' | 'not_applicable'

function ChecklistItem({
  label, status, detail, action,
}: {
  label: string
  status: ChecklistStatus
  detail: string
  action?: { label: string; href: string }
}) {
  const icon = {
    complete:       { symbol: '✓', color: 'text-green-500' },
    in_progress:    { symbol: '◉', color: 'text-blue-500' },
    pending:        { symbol: '○', color: 'text-amber-500' },
    not_started:    { symbol: '○', color: 'text-gray-300' },
    not_applicable: { symbol: '—', color: 'text-gray-300' },
  }[status]

  return (
    <div className="flex items-center justify-between px-5 py-4">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 text-lg font-bold leading-none ${icon.color}`}>{icon.symbol}</span>
        <div>
          <p className={`text-sm font-medium ${status === 'not_applicable' ? 'text-gray-400' : 'text-gray-900'}`}>{label}</p>
          <p className="text-xs text-gray-500 mt-0.5">{detail}</p>
        </div>
      </div>
      {action && (
        <a href={action.href} className="text-xs text-indigo-600 font-medium hover:text-indigo-800 shrink-0 ml-4">
          {action.label} →
        </a>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between px-5 py-3">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900 capitalize">{value}</span>
    </div>
  )
}

function accreditationStatusBadge(status: string) {
  switch (status) {
    case 'verified':     return 'bg-green-50 text-green-700'
    case 'under_review': return 'bg-blue-50 text-blue-700'
    case 'pending':      return 'bg-amber-50 text-amber-700'
    case 'rejected':     return 'bg-red-50 text-red-700'
    case 'expired':      return 'bg-orange-50 text-orange-700'
    default:             return 'bg-gray-100 text-gray-600'
  }
}
