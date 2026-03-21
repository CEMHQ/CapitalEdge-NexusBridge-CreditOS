import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency, formatDate } from '@/lib/format'
import SignatureStatusBadge from '@/components/signatures/SignatureStatusBadge'

const LOAN_PURPOSE_LABELS: Record<string, string> = {
  bridge: 'Bridge Loan',
  renovation: 'Renovation / Fix & Flip',
  contingency: 'Contingency / GAP Funding',
  other: 'Other',
}

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  sfh: 'Single Family Home',
  multifamily: 'Multifamily (2–4 units)',
  condo: 'Condo',
  land: 'Land',
  mixed_use: 'Mixed Use',
  commercial: 'Commercial',
}

const OCCUPANCY_LABELS: Record<string, string> = {
  owner_occupied: 'Owner Occupied',
  rental: 'Rental / Investment',
  vacant: 'Vacant',
}

const EXIT_STRATEGY_LABELS: Record<string, string> = {
  sale: 'Sale of Property',
  refinance: 'Refinance',
  repayment: 'Cash Repayment',
}

const CONDITION_TYPE_LABELS: Record<string, string> = {
  appraisal: 'Appraisal',
  insurance: 'Insurance',
  title: 'Title',
  document: 'Document',
  financial: 'Financial',
  compliance: 'Compliance',
}

function statusColor(status: string) {
  switch (status) {
    case 'submitted':              return 'bg-blue-50 text-blue-700'
    case 'under_review':           return 'bg-yellow-50 text-yellow-700'
    case 'conditionally_approved': return 'bg-orange-50 text-orange-700'
    case 'approved':               return 'bg-green-50 text-green-700'
    case 'funded':                 return 'bg-green-100 text-green-800'
    case 'declined':               return 'bg-red-50 text-red-700'
    case 'closed':                 return 'bg-gray-100 text-gray-500'
    default:                       return 'bg-gray-100 text-gray-600'
  }
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:justify-between py-2.5 border-b border-gray-100 last:border-0 gap-0.5 sm:gap-4">
      <span className="text-sm text-gray-500 shrink-0">{label}</span>
      <span className="text-sm font-medium text-gray-900 sm:text-right">{value || '—'}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-1">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{title}</h2>
      {children}
    </div>
  )
}

function docReviewColor(status: string) {
  switch (status) {
    case 'verified':       return 'bg-green-50 text-green-700'
    case 'rejected':       return 'bg-red-50 text-red-700'
    case 'under_review':   return 'bg-blue-50 text-blue-700'
    case 'pending_review': return 'bg-amber-50 text-amber-700'
    default:               return 'bg-gray-100 text-gray-600'
  }
}

function conditionStatusColor(status: string) {
  switch (status) {
    case 'satisfied': return 'bg-green-50 text-green-700'
    case 'waived':    return 'bg-gray-100 text-gray-500'
    default:          return 'bg-amber-50 text-amber-700'
  }
}

export default async function BorrowerApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Load borrower to verify ownership
  const { data: borrower } = await supabase
    .from('borrowers')
    .select('id')
    .eq('profile_id', user!.id)
    .single()

  if (!borrower) notFound()

  const { data: app } = await supabase
    .from('applications')
    .select(`
      id, application_number, loan_purpose, requested_amount,
      requested_term_months, exit_strategy, application_status,
      submitted_at,
      properties (
        address_line_1, address_line_2, city, state, postal_code,
        property_type, occupancy_type, current_value, arv_value, purchase_price
      )
    `)
    .eq('id', id)
    .eq('borrower_id', borrower.id)
    .single()

  if (!app) notFound()

  const property = Array.isArray(app.properties) ? app.properties[0] : app.properties

  // Documents for this application (both application-owned and borrower-uploaded)
  const [{ data: appDocs }, { data: borrowerDocs }] = await Promise.all([
    supabase
      .from('documents')
      .select('id, file_name, document_type, review_status, rejection_reason, created_at')
      .eq('owner_type', 'application')
      .eq('owner_id', id)
      .eq('upload_status', 'uploaded')
      .order('created_at', { ascending: false }),
    supabase
      .from('documents')
      .select('id, file_name, document_type, review_status, rejection_reason, created_at')
      .eq('owner_type', 'borrower')
      .eq('uploaded_by', user!.id)
      .eq('upload_status', 'uploaded')
      .order('created_at', { ascending: false }),
  ])

  const allDocs = [...(appDocs ?? []), ...(borrowerDocs ?? [])]

  // Conditions via underwriting case
  const { data: uwCase } = await supabase
    .from('underwriting_cases')
    .select('id')
    .eq('application_id', id)
    .maybeSingle()

  const { data: conditions } = uwCase
    ? await supabase
        .from('conditions')
        .select('id, condition_type, description, status, notes, created_at')
        .eq('case_id', uwCase.id)
        .order('created_at', { ascending: true })
    : { data: [] }

  const openConditions = (conditions ?? []).filter((c) => c.status === 'pending')
  const resolvedConditions = (conditions ?? []).filter((c) => c.status !== 'pending')

  // Signature requests for this application (read-only for borrower)
  type SigRow = { id: string; document_type: string; status: string; signers: unknown; sent_at: string | null; completed_at: string | null; declined_at: string | null }
  const { data: sigRequestsRaw } = await supabase
    .from('signature_requests')
    .select('id, document_type, status, signers, sent_at, completed_at, declined_at')
    .eq('entity_type', 'application')
    .eq('entity_id', id)
    .order('created_at', { ascending: false })
  const sigRequests = (sigRequestsRaw ?? []) as unknown as SigRow[]

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <Link href="/dashboard/borrower/applications" className="text-sm text-gray-400 hover:text-gray-600">
            ← My Applications
          </Link>
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 mt-1">#{app.application_number}</h1>
          <p className="text-sm text-gray-500 mt-0.5">Submitted {formatDate(app.submitted_at)}</p>
        </div>
        <span className={`self-start px-3 py-1.5 rounded-full text-xs font-semibold capitalize ${statusColor(app.application_status)}`}>
          {app.application_status.replace(/_/g, ' ')}
        </span>
      </div>

      {/* Loan Details */}
      <Section title="Loan Details">
        <DetailRow label="Purpose" value={LOAN_PURPOSE_LABELS[app.loan_purpose] ?? app.loan_purpose} />
        <DetailRow label="Requested Amount" value={formatCurrency(app.requested_amount)} />
        <DetailRow label="Term" value={app.requested_term_months ? `${app.requested_term_months} months` : '—'} />
        <DetailRow label="Exit Strategy" value={EXIT_STRATEGY_LABELS[app.exit_strategy] ?? (app.exit_strategy ?? '—')} />
      </Section>

      {/* Property */}
      {property && (
        <Section title="Property">
          <DetailRow
            label="Address"
            value={[property.address_line_1, property.address_line_2].filter(Boolean).join(', ')}
          />
          <DetailRow label="City / State / ZIP" value={`${property.city}, ${property.state} ${property.postal_code}`} />
          <DetailRow label="Property Type" value={PROPERTY_TYPE_LABELS[property.property_type] ?? property.property_type} />
          <DetailRow label="Occupancy" value={OCCUPANCY_LABELS[property.occupancy_type] ?? property.occupancy_type} />
          <DetailRow label="Current Value" value={formatCurrency(property.current_value)} />
          <DetailRow label="After Repair Value (ARV)" value={formatCurrency(property.arv_value)} />
          <DetailRow label="Purchase Price" value={formatCurrency(property.purchase_price)} />
        </Section>
      )}

      {/* Open Conditions */}
      {openConditions.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-6 space-y-3">
          <div>
            <h2 className="text-xs font-semibold text-orange-700 uppercase tracking-wide">
              Action Required — Outstanding Conditions
            </h2>
            <p className="text-xs text-orange-600 mt-1">
              The following items must be resolved before your application can proceed.
            </p>
          </div>
          <ul className="space-y-3">
            {openConditions.map((c) => (
              <li key={c.id} className="flex items-start gap-3">
                <span className="mt-0.5 w-2 h-2 rounded-full bg-orange-400 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {CONDITION_TYPE_LABELS[c.condition_type] ?? c.condition_type}
                  </p>
                  <p className="text-sm text-gray-700 mt-0.5">{c.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Documents */}
      <Section title={`Documents (${allDocs.length})`}>
        {allDocs.length === 0 ? (
          <p className="text-sm text-gray-400 py-2">
            No documents uploaded.{' '}
            <a href="/dashboard/borrower/documents" className="underline text-gray-600">Upload documents →</a>
          </p>
        ) : (
          <div className="divide-y divide-gray-100 -mx-0">
            {allDocs.map((doc) => (
              <div key={doc.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{doc.file_name}</p>
                  <p className="text-xs text-gray-400 capitalize mt-0.5">
                    {doc.document_type.replace(/_/g, ' ')} · {formatDate(doc.created_at)}
                  </p>
                  {doc.review_status === 'rejected' && doc.rejection_reason && (
                    <p className="text-xs text-red-600 mt-1">Rejected: {doc.rejection_reason}</p>
                  )}
                </div>
                <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium capitalize ${docReviewColor(doc.review_status)}`}>
                  {doc.review_status.replace(/_/g, ' ')}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Closing Documents — read-only signature status */}
      {sigRequests.length > 0 && (
        <Section title={`Closing Documents (${sigRequests.length})`}>
          <div className="divide-y divide-gray-100 -mx-0">
            {sigRequests.map((sr) => {
              const signerList = (sr.signers ?? []) as Array<{ name: string; role: string; signed_at: string | null }>
              return (
                <div key={sr.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-900 capitalize">
                      {sr.document_type.replace(/_/g, ' ')}
                    </span>
                    <SignatureStatusBadge status={sr.status} />
                  </div>
                  <div className="text-xs text-gray-500 space-y-0.5">
                    {sr.sent_at && <p>Sent {formatDate(sr.sent_at)}</p>}
                    {sr.completed_at && <p className="text-green-600">All parties signed {formatDate(sr.completed_at)}</p>}
                    {sr.declined_at && <p className="text-red-600">Declined {formatDate(sr.declined_at)}</p>}
                  </div>
                  {signerList.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {signerList.map((s, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs text-gray-600">
                          <span className={`w-2 h-2 rounded-full ${s.signed_at ? 'bg-green-500' : 'bg-gray-300'}`} />
                          <span>{s.name}</span>
                          <span className="text-gray-400">({s.role})</span>
                          {s.signed_at && <span className="text-green-600 ml-auto">Signed</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {/* Resolved Conditions */}
      {resolvedConditions.length > 0 && (
        <Section title="Resolved Conditions">
          <div className="divide-y divide-gray-100 -mx-0">
            {resolvedConditions.map((c) => (
              <div key={c.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {CONDITION_TYPE_LABELS[c.condition_type] ?? c.condition_type}
                  </p>
                  <p className="text-sm text-gray-600 mt-0.5">{c.description}</p>
                  {c.notes && <p className="text-xs text-gray-400 mt-0.5">{c.notes}</p>}
                </div>
                <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium capitalize ${conditionStatusColor(c.status)}`}>
                  {c.status}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}
