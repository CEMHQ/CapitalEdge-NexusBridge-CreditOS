import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/format'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { computeRegALimit, getRollingRegACommitments } from '@/lib/compliance/reg-a'
import SubscribeForm from '@/components/offerings/SubscribeForm'
import AccreditedInvestorQuestionnaire from '@/components/investor/AccreditedInvestorQuestionnaire'

export default async function OfferingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Investor context
  const { data: investor } = await supabase
    .from('investors')
    .select('id, accreditation_status, annual_income, net_worth, aiq_self_certified_at')
    .eq('profile_id', user!.id)
    .maybeSingle()

  if (!investor) notFound()

  const investorJurisdiction = (investor as Record<string, unknown>).jurisdiction as string | null ?? null

  // Fetch offering + documents — RLS enforces offering_status = 'active'
  const { data: offering } = await supabase
    .from('offerings')
    .select(`
      id, title, description, offering_type, offering_status,
      max_offering_amount, min_investment, max_investment, per_share_price, shares_offered,
      sec_file_number, qualification_date,
      offering_open_date, offering_close_date,
      jurisdiction_restrictions,
      funds ( id, fund_name ),
      offering_documents (
        id, document_type, label, file_path, filed_at, effective_date
      )
    `)
    .eq('id', id)
    .maybeSingle()

  if (!offering) notFound()

  // Jurisdiction check — is this investor's state restricted?
  const restrictedStates = Array.isArray(
    (offering as unknown as { jurisdiction_restrictions: unknown }).jurisdiction_restrictions
  )
    ? (offering as unknown as { jurisdiction_restrictions: string[] }).jurisdiction_restrictions
    : []
  const jurisdictionBlocked = !!investorJurisdiction && restrictedStates.includes(investorJurisdiction)

  const isAccredited = investor.accreditation_status === 'verified'
  const isRegA  = offering.offering_type === 'reg_a'
  const isRegD  = offering.offering_type === 'reg_d'

  // Reg A capacity
  const regALimit = computeRegALimit(
    investor.accreditation_status,
    investor.annual_income ?? null,
    investor.net_worth ?? null,
  )
  const regAUsed      = regALimit !== null ? await getRollingRegACommitments(supabase, investor.id) : 0
  const regARemaining = regALimit !== null ? Math.max(0, regALimit - regAUsed) : null

  const isClosed  = offering.offering_close_date
    ? new Date(offering.offering_close_date) < new Date()
    : false
  const atRegALimit   = isRegA && !isAccredited && regARemaining !== null && regARemaining <= 0
  const needsAccredit = isRegD && !isAccredited
  const aiqCompleted  = !!(investor as Record<string, unknown>).aiq_self_certified_at
  const aiqCompletedAt = (investor as Record<string, unknown>).aiq_self_certified_at as string | null ?? null
  const needsAiq      = isRegD && isAccredited && !aiqCompleted
  const canSubscribe  = !isClosed && !jurisdictionBlocked && !needsAccredit && !atRegALimit && !needsAiq

  // Documents sorted: offering circular first, then chronological
  type OfferingDoc = { id: string; document_type: string; label: string; file_path: string; filed_at: string | null; effective_date: string | null }
  const docs = ((offering as unknown as { offering_documents: OfferingDoc[] }).offering_documents ?? [])
    .sort((a, b) => {
      if (a.document_type === 'offering_circular') return -1
      if (b.document_type === 'offering_circular') return 1
      return 0
    })

  const fund = (offering as unknown as { funds: { id: string; fund_name: string } | null }).funds

  return (
    <div className="space-y-8 max-w-3xl">

      {/* Back nav */}
      <Link href="/dashboard/investor/offerings" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors">
        ← All Offerings
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              isRegA ? 'bg-indigo-50 text-indigo-700' :
              isRegD ? 'bg-violet-50 text-violet-700' :
                       'bg-gray-100 text-gray-600'
            }`}>
              {offering.offering_type.replace('_', ' ').toUpperCase()}
            </span>
            {isClosed && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">Closed</span>
            )}
          </div>
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">{offering.title}</h1>
          {fund && <p className="text-sm text-gray-500 mt-1">{fund.fund_name}</p>}
        </div>

        {canSubscribe ? (
          <SubscribeForm
            fundId={fund!.id}
            offeringTitle={offering.title}
            offeringType={offering.offering_type}
            minInvestment={Number(offering.min_investment)}
            maxInvestment={offering.max_investment ? Number(offering.max_investment) : null}
            regARemaining={regARemaining}
            offeringDocumentCount={docs.length}
          />
        ) : (
          <SubscribeBlockedBadge
            isClosed={isClosed}
            jurisdictionBlocked={jurisdictionBlocked}
            needsAccredit={needsAccredit}
            needsAiq={needsAiq}
            atRegALimit={atRegALimit}
          />
        )}
      </div>

      {/* Jurisdiction warning */}
      {jurisdictionBlocked && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-amber-800">Not Available in Your State</p>
          <p className="text-sm text-amber-700 mt-0.5">
            This offering is not available to residents of <strong>{investorJurisdiction}</strong>.
            Please contact us if you have questions about availability in your jurisdiction.
          </p>
        </div>
      )}

      {/* Reg A capacity card — non-accredited, reg_a offerings only */}
      {isRegA && !isAccredited && regALimit !== null && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-900">Your Reg A Capacity</p>
            <Link href="/dashboard/investor/compliance" className="text-xs text-indigo-600 hover:text-indigo-800">
              View compliance →
            </Link>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">
            Under SEC Regulation A Tier 2, you may invest up to 10% of the greater of your annual income
            or net worth in any rolling 12-month period. Your current remaining capacity is shown below.
          </p>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                regAUsed / regALimit >= 0.9 ? 'bg-red-500' :
                regAUsed / regALimit >= 0.7 ? 'bg-amber-400' : 'bg-indigo-500'
              }`}
              style={{ width: `${Math.min(100, (regAUsed / regALimit) * 100).toFixed(1)}%` }}
            />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-xs text-gray-400">Annual limit</p>
              <p className="text-sm font-semibold text-gray-900">${regALimit.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Used (12 mo)</p>
              <p className="text-sm font-semibold text-gray-900">${regAUsed.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Remaining</p>
              <p className={`text-sm font-semibold ${(regARemaining ?? 0) === 0 ? 'text-red-600' : 'text-green-700'}`}>
                ${(regARemaining ?? 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Reg D accreditation gate */}
      {needsAccredit && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-amber-800">Accreditation Required</p>
          <p className="text-sm text-amber-700 mt-0.5">
            This offering is available exclusively to verified accredited investors under Reg D 506(c).
          </p>
          <Link href="/dashboard/investor/onboarding" className="text-sm font-medium text-amber-800 underline mt-2 inline-block">
            Begin accreditation verification →
          </Link>
        </div>
      )}

      {/* Reg D AIQ gate — accredited but AIQ not yet completed */}
      {isRegD && isAccredited && (
        <AccreditedInvestorQuestionnaire
          alreadyCompleted={aiqCompleted}
          completedAt={aiqCompletedAt}
        />
      )}

      {/* Offering description */}
      {offering.description && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-2">About This Offering</h2>
          <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{offering.description}</p>
        </div>
      )}

      {/* Financial terms */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Financial Terms</h2>
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          <Row label="Maximum Offering"   value={`$${Number(offering.max_offering_amount).toLocaleString()}`} />
          <Row label="Minimum Investment" value={`$${Number(offering.min_investment).toLocaleString()}`} />
          {offering.max_investment && (
            <Row label="Maximum Investment" value={`$${Number(offering.max_investment).toLocaleString()}`} />
          )}
          {offering.per_share_price && (
            <Row label="Price per Unit" value={`$${Number(offering.per_share_price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`} />
          )}
          {offering.shares_offered && (
            <Row label="Units Offered" value={Number(offering.shares_offered).toLocaleString()} />
          )}
        </div>
      </div>

      {/* Timeline & SEC filing */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Filing & Timeline</h2>
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {offering.sec_file_number && (
            <Row label="SEC File Number" value={offering.sec_file_number} />
          )}
          {offering.qualification_date && (
            <Row label="Qualification Date" value={formatDate(offering.qualification_date)} />
          )}
          {offering.offering_open_date && (
            <Row label="Offering Opens" value={formatDate(offering.offering_open_date)} />
          )}
          {offering.offering_close_date && (
            <Row label="Offering Closes" value={formatDate(offering.offering_close_date)} />
          )}
          {/* Restricted states */}
          {restrictedStates.length > 0 && (
            <Row label="Jurisdiction Restrictions" value={restrictedStates.join(', ')} />
          )}
        </div>
      </div>

      {/* Offering documents */}
      {docs.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-3">Offering Documents</h2>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {docs.map(doc => (
              <DocumentRow key={doc.id} doc={doc} />
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Documents are provided for informational purposes. Please read all offering documents carefully
            before making an investment decision.
          </p>
        </div>
      )}

      {/* Subscribe CTA (bottom) */}
      {canSubscribe && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-indigo-900">Ready to invest?</p>
            <p className="text-xs text-indigo-700 mt-0.5">
              Minimum investment: <strong>${Number(offering.min_investment).toLocaleString()}</strong>
              {regARemaining !== null && (
                <> · Your remaining capacity: <strong>${regARemaining.toLocaleString()}</strong></>
              )}
            </p>
          </div>
          <SubscribeForm
            fundId={fund!.id}
            offeringTitle={offering.title}
            offeringType={offering.offering_type}
            minInvestment={Number(offering.min_investment)}
            maxInvestment={offering.max_investment ? Number(offering.max_investment) : null}
            regARemaining={regARemaining}
            offeringDocumentCount={docs.length}
          />
        </div>
      )}

      {/* Regulatory notice */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Regulatory Notice</p>
        <p className="text-xs text-gray-500 leading-relaxed">
          {isRegA
            ? 'This offering is made pursuant to Regulation A, Tier 2 of the Securities Act of 1933. ' +
              'Investments involve risk. Non-accredited investors are subject to SEC annual investment limits. ' +
              'Past performance is not indicative of future results.'
            : 'This offering is available exclusively to verified accredited investors pursuant to SEC Rule 506(c) ' +
              'of Regulation D. This is not a public offering. Investments involve risk and may result in loss of principal.'
          }
        </p>
      </div>

    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:justify-between gap-1 px-5 py-3">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900 sm:text-right">{value}</span>
    </div>
  )
}

const DOC_TYPE_LABELS: Record<string, string> = {
  form_1a:           'Form 1-A',
  form_1a_amendment: 'Form 1-A/A',
  form_1k:           'Form 1-K',
  form_1sa:          'Form 1-SA',
  form_1u:           'Form 1-U',
  offering_circular: 'Offering Circular',
  supplement:        'Supplement',
  other:             'Document',
}

function DocumentRow({ doc }: { doc: { id: string; document_type: string; label: string; file_path: string; filed_at: string | null; effective_date: string | null } }) {
  const typeLabel = DOC_TYPE_LABELS[doc.document_type] ?? doc.document_type
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-5 py-3">
      <div>
        <p className="text-sm font-medium text-gray-900">{doc.label}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {typeLabel}
          {doc.filed_at && ` · Filed ${formatDate(doc.filed_at)}`}
          {doc.effective_date && ` · Effective ${formatDate(doc.effective_date)}`}
        </p>
      </div>
      {/* file_path is a Supabase Storage path — for now link to a generic download placeholder */}
      <a
        href={`/api/offerings/${doc.id}/document`}
        className="text-xs text-indigo-600 font-medium hover:text-indigo-800 shrink-0"
        target="_blank"
        rel="noopener noreferrer"
      >
        Download →
      </a>
    </div>
  )
}

function SubscribeBlockedBadge({
  isClosed,
  jurisdictionBlocked,
  needsAccredit,
  needsAiq,
  atRegALimit,
}: {
  isClosed: boolean
  jurisdictionBlocked: boolean
  needsAccredit: boolean
  needsAiq: boolean
  atRegALimit: boolean
}) {
  const text = isClosed ? 'Offering Closed'
    : jurisdictionBlocked ? 'Not Available in Your State'
    : needsAccredit       ? 'Accreditation Required'
    : needsAiq            ? 'Complete AIQ to Subscribe'
    : atRegALimit         ? 'Annual Limit Reached'
    : 'Unavailable'

  return (
    <span className="w-full sm:w-auto text-center inline-block px-5 py-2.5 bg-gray-100 text-gray-500 text-sm font-medium rounded-lg cursor-not-allowed shrink-0">
      {text}
    </span>
  )
}
