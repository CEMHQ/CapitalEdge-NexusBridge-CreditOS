import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/format'
import Link from 'next/link'
import StartKycButton from '@/components/investor/StartKycButton'
import SuitabilityForm from '@/components/investor/SuitabilityForm'
import { computeRegALimit, getRollingRegACommitments } from '@/lib/compliance/reg-a'

export default async function InvestorCompliancePage() {
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: investor } = await supabase
    .from('investors')
    .select('id, investor_type, accreditation_status, kyc_status, aml_status, onboarding_status, annual_income, net_worth, jurisdiction, created_at, aiq_self_certified_at, aiq_accreditation_basis')
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
    .select('id, subscription_status, commitment_amount, funded_amount, fcfs_position, ppm_acknowledged_at, offering_circular_acknowledged_at, confirmed_at, created_at, funds ( fund_name, offering_type )')
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

  // jurisdiction / AIQ — cast from the select result until DB types are regenerated
  const investorJurisdiction   = (investor as Record<string, unknown>).jurisdiction as string | null ?? null
  const aiqSelfCertifiedAt     = (investor as Record<string, unknown>).aiq_self_certified_at as string | null ?? null
  const aiqAccreditationBasis  = (investor as Record<string, unknown>).aiq_accreditation_basis as string | null ?? null

  // Reg A investment limit (only meaningful for non-accredited investors)
  const regALimit = computeRegALimit(
    investor.accreditation_status,
    investor.annual_income ?? null,
    investor.net_worth ?? null,
  )
  const regAUsed      = regALimit !== null ? await getRollingRegACommitments(supabase, investor.id) : 0
  const regARemaining = regALimit !== null ? Math.max(0, regALimit - regAUsed) : null

  // Compliance checklist
  const isAccredited    = investor.accreditation_status === 'verified'
  const kycApproved     = investor.kyc_status === 'approved'
  const aiqCompleted    = !!aiqSelfCertifiedAt
  const ppmSigned       = !!subscription?.ppm_acknowledged_at
  const subSigned       = subAgreementSig?.status === 'signed'
  const hasSubscription = !!subscription
  const fundOfferingType = (subscription?.funds as unknown as { fund_name: string; offering_type: string } | null)?.offering_type ?? 'reg_d'
  const isRegD           = fundOfferingType === 'reg_d'
  const offeringAcknowledgedAt = (subscription as Record<string, unknown> | null)?.offering_circular_acknowledged_at as string | null ?? null

  // For Reg D: all complete requires AIQ; for Reg A it is not required
  const allComplete = isAccredited && kycApproved && ppmSigned && subSigned && (!isRegD || aiqCompleted)

  // Expiry warning
  const expiresAt = latestAccreditation?.expires_at ? new Date(latestAccreditation.expires_at) : null
  const daysUntilExpiry = expiresAt ? Math.ceil((expiresAt.getTime() - now) / (1000 * 60 * 60 * 24)) : null
  const expiryWarning = daysUntilExpiry !== null && daysUntilExpiry <= 30

  return (
    <div className="space-y-8 max-w-3xl">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Compliance Status</h1>
          <p className="text-sm text-gray-500 mt-1">Your 506(c) accreditation and subscription compliance record</p>
        </div>
        {!isAccredited && investor.onboarding_status !== 'in_progress' && (
          <Link
            href="/dashboard/investor/onboarding"
            className="w-full sm:w-auto px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors text-center"
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
            status={kycApproved ? 'complete' : investor.kyc_status === 'in_progress' ? 'in_progress' : 'not_started'}
            detail={
              kycApproved
                ? 'Identity verified'
                : investor.kyc_status === 'in_progress'
                ? 'Verification in progress — complete the flow in your browser'
                : investor.kyc_status === 'failed'
                ? 'Verification failed — please try again'
                : 'Required before fund subscription'
            }
            actionNode={
              !kycApproved && investor.kyc_status !== 'in_progress'
                ? <StartKycButton investorId={investor.id} />
                : undefined
            }
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
          {/* AIQ required for Reg D 506(c); not applicable for Reg A */}
          {isAccredited && (
            <ChecklistItem
              label="Accredited Investor Questionnaire (AIQ)"
              status={aiqCompleted ? 'complete' : 'not_started'}
              detail={
                aiqCompleted
                  ? `Self-certified ${formatDate(aiqSelfCertifiedAt!)}${aiqAccreditationBasis ? ` · Basis: ${aiqAccreditationBasis.replace(/_/g, ' ')}` : ''}`
                  : 'Required for Reg D 506(c) — self-certify your accreditation basis before subscribing'
              }
              action={!aiqCompleted ? { label: 'Complete AIQ', href: '/dashboard/investor/offerings' } : undefined}
            />
          )}
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
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3 whitespace-nowrap">Method</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3 whitespace-nowrap">Status</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-4 py-3 whitespace-nowrap">Submitted</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-4 py-3 whitespace-nowrap">Verified</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-4 py-3 whitespace-nowrap">Expires</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {accreditationRecords.map((rec) => (
                  <tr key={rec.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 capitalize whitespace-nowrap">{rec.verification_method.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${accreditationStatusBadge(rec.status)}`}>
                        {rec.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{formatDate(rec.created_at)}</td>
                    <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{rec.verified_at ? formatDate(rec.verified_at) : '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{rec.expires_at ? formatDate(rec.expires_at) : '—'}</td>
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
            {offeringAcknowledgedAt && <Row label="Offering Docs Acknowledged" value={formatDate(offeringAcknowledgedAt)} />}
            {subscription.ppm_acknowledged_at && <Row label="PPM Acknowledged" value={formatDate(subscription.ppm_acknowledged_at)} />}
          </div>
        </div>
      )}

      {/* Reg A Investment Limit */}
      {regALimit !== null ? (
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-3">Reg A Investment Limit</h2>
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <p className="text-xs text-gray-500 leading-relaxed">
              Under SEC Regulation A Tier 2, non-accredited investors may invest no more than
              10% of the greater of annual income or net worth in any rolling 12-month period
              (minimum $2,500). The figures below reflect your current capacity.
            </p>
            {/* Gauge bar */}
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                <span>Used: <strong className="text-gray-900">${regAUsed.toLocaleString()}</strong></span>
                <span>Limit: <strong className="text-gray-900">${regALimit.toLocaleString()}</strong></span>
              </div>
              <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    regAUsed / regALimit >= 0.9 ? 'bg-red-500' :
                    regAUsed / regALimit >= 0.7 ? 'bg-amber-400' : 'bg-indigo-500'
                  }`}
                  style={{ width: `${Math.min(100, (regAUsed / regALimit) * 100).toFixed(1)}%` }}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-4 pt-1">
              <div className="text-center">
                <p className="text-xs text-gray-500">Annual limit</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">${regALimit.toLocaleString()}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500">Used (12 mo)</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">${regAUsed.toLocaleString()}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500">Remaining</p>
                <p className={`text-sm font-semibold mt-0.5 ${(regARemaining ?? 0) === 0 ? 'text-red-600' : 'text-green-600'}`}>
                  ${(regARemaining ?? 0).toLocaleString()}
                </p>
              </div>
            </div>
            {/* Always show the suitability form — either to fill in missing data or to update */}
            <div className="border-t border-gray-100 pt-4">
              <SuitabilityForm
                currentAnnualIncome={investor.annual_income ?? null}
                currentNetWorth={investor.net_worth ?? null}
                currentJurisdiction={investorJurisdiction}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
          <p className="text-xs text-gray-500">
            <strong className="text-gray-700">Reg A investment limit:</strong> Not applicable — accredited investors are exempt from the SEC annual investment limit.
          </p>
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
  label, status, detail, action, actionNode,
}: {
  label: string
  status: ChecklistStatus
  detail: string
  action?: { label: string; href: string }
  actionNode?: React.ReactNode
}) {
  const icon = {
    complete:       { symbol: '✓', color: 'text-green-500' },
    in_progress:    { symbol: '◉', color: 'text-blue-500' },
    pending:        { symbol: '○', color: 'text-amber-500' },
    not_started:    { symbol: '○', color: 'text-gray-300' },
    not_applicable: { symbol: '—', color: 'text-gray-300' },
  }[status]

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-4">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 text-lg font-bold leading-none shrink-0 ${icon.color}`}>{icon.symbol}</span>
        <div>
          <p className={`text-sm font-medium ${status === 'not_applicable' ? 'text-gray-400' : 'text-gray-900'}`}>{label}</p>
          <p className="text-xs text-gray-500 mt-0.5">{detail}</p>
        </div>
      </div>
      {actionNode ?? (action && (
        <a href={action.href} className="text-xs text-indigo-600 font-medium hover:text-indigo-800 shrink-0 sm:ml-4">
          {action.label} →
        </a>
      ))}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:justify-between gap-1 px-5 py-3">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900 capitalize sm:text-right">{value}</span>
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
