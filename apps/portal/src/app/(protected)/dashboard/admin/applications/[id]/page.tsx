import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency, formatDate } from '@/lib/format'
import ApplicationStatusForm from '@/components/admin/ApplicationStatusForm'
import UnderwriterMetricsForm from '@/components/admin/UnderwriterMetricsForm'
import CreateLoanForm from '@/components/admin/CreateLoanForm'

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  sfh: 'Single Family Home', multifamily: 'Multifamily (2–4 units)',
  condo: 'Condo', land: 'Land', mixed_use: 'Mixed Use', commercial: 'Commercial',
}

const OCCUPANCY_LABELS: Record<string, string> = {
  owner_occupied: 'Owner Occupied', rental: 'Rental / Investment', vacant: 'Vacant',
}

const LOAN_PURPOSE_LABELS: Record<string, string> = {
  bridge: 'Bridge Loan', renovation: 'Renovation / Fix & Flip',
  contingency: 'Contingency / GAP Funding', other: 'Other',
}

const EXIT_STRATEGY_LABELS: Record<string, string> = {
  sale: 'Sale of Property', refinance: 'Refinance', repayment: 'Cash Repayment',
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2.5 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900">{value || '—'}</span>
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

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: app } = await supabase
    .from('applications')
    .select(`
      id, application_number, loan_purpose, requested_amount,
      requested_term_months, exit_strategy, application_status,
      submitted_at, created_at,
      borrowers (
        id, borrower_type, kyc_status, aml_status,
        profiles ( full_name, email, phone )
      ),
      properties (
        address_line_1, address_line_2, city, state, postal_code,
        property_type, occupancy_type, current_value, arv_value, purchase_price
      ),
      loan_requests (
        id, requested_principal, requested_interest_rate, requested_points,
        requested_ltv, requested_ltc, requested_dscr
      )
    `)
    .eq('id', id)
    .single()

  if (!app) notFound()

  const borrower = Array.isArray(app.borrowers) ? app.borrowers[0] : app.borrowers
  const profile = borrower && (Array.isArray(borrower.profiles) ? borrower.profiles[0] : borrower.profiles)
  const property = Array.isArray(app.properties) ? app.properties[0] : app.properties
  const loanReq = Array.isArray(app.loan_requests) ? app.loan_requests[0] : app.loan_requests

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <a href="/dashboard/admin/applications" className="text-sm text-gray-400 hover:text-gray-600">
            ← All Applications
          </a>
          <h1 className="text-2xl font-semibold text-gray-900 mt-1">#{app.application_number}</h1>
          <p className="text-sm text-gray-500 mt-0.5">Submitted {formatDate(app.submitted_at)}</p>
        </div>
        <ApplicationStatusForm applicationId={app.id} currentStatus={app.application_status} />
      </div>

      {/* Borrower */}
      <Section title="Borrower">
        <DetailRow label="Full Name" value={profile?.full_name ?? '—'} />
        <DetailRow label="Email" value={profile?.email ?? '—'} />
        <DetailRow label="Phone" value={profile?.phone ?? '—'} />
        <DetailRow label="Borrower Type" value={borrower?.borrower_type ?? '—'} />
        <DetailRow label="KYC Status" value={borrower?.kyc_status ?? '—'} />
        <DetailRow label="AML Status" value={borrower?.aml_status ?? '—'} />
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

      {/* Loan Scenario */}
      <Section title="Loan Scenario">
        <DetailRow label="Loan Purpose" value={LOAN_PURPOSE_LABELS[app.loan_purpose] ?? app.loan_purpose} />
        <DetailRow label="Requested Amount" value={formatCurrency(app.requested_amount)} />
        <DetailRow label="Term" value={app.requested_term_months ? `${app.requested_term_months} months` : '—'} />
        <DetailRow label="Exit Strategy" value={EXIT_STRATEGY_LABELS[app.exit_strategy] ?? app.exit_strategy} />
      </Section>

      {/* Create Loan — only show for approved applications */}
      {app.application_status === 'approved' && (
        <CreateLoanForm
          applicationId={app.id}
          requestedAmount={app.requested_amount ?? 0}
          requestedTermMonths={app.requested_term_months ?? 12}
        />
      )}

      {/* Underwriter Metrics — internal only */}
      {loanReq && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 space-y-4">
          <div>
            <h2 className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
              Underwriter Metrics — Internal Only
            </h2>
            <p className="text-xs text-amber-600 mt-1">Not visible to the borrower.</p>
          </div>
          <UnderwriterMetricsForm
            applicationId={app.id}
            loanRequestId={loanReq.id}
            initial={{
              requested_ltv: loanReq.requested_ltv,
              requested_ltc: loanReq.requested_ltc,
              requested_dscr: loanReq.requested_dscr,
            }}
          />
        </div>
      )}
    </div>
  )
}
