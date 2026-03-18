import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/format'
import type { ApplicationData } from '@/app/(protected)/dashboard/borrower/apply/page'

type Props = {
  data: ApplicationData
  onBack: () => void
  onSubmit: () => void
  submitting: boolean
  error: string | null
}

const LOAN_PURPOSE_LABELS: Record<string, string> = {
  bridge: 'Bridge Loan',
  renovation: 'Renovation / Fix & Flip',
  contingency: 'Contingency / GAP Funding',
  other: 'Other',
}

const EXIT_STRATEGY_LABELS: Record<string, string> = {
  sale: 'Sale of Property',
  refinance: 'Refinance',
  repayment: 'Cash Repayment',
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

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900">{value || '—'}</span>
    </div>
  )
}

export default function StepReview({ data, onBack, onSubmit, submitting, error }: Props) {
  const { profile, property, loan } = data

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Review & Submit</h2>
        <p className="text-sm text-gray-500 mt-1">Confirm your details before submitting.</p>
      </div>

      <section className="space-y-1">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Your Profile</h3>
        <ReviewRow label="Full Name" value={profile.full_name} />
        <ReviewRow label="Phone" value={profile.phone} />
      </section>

      <section className="space-y-1">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Property</h3>
        <ReviewRow
          label="Address"
          value={[property.address_line_1, property.address_line_2].filter(Boolean).join(', ')}
        />
        <ReviewRow
          label="City / State / ZIP"
          value={`${property.city}, ${property.state} ${property.postal_code}`}
        />
        <ReviewRow label="Property Type" value={PROPERTY_TYPE_LABELS[property.property_type] ?? property.property_type} />
        <ReviewRow label="Occupancy" value={OCCUPANCY_LABELS[property.occupancy_type] ?? property.occupancy_type} />
        <ReviewRow label="Current Value" value={formatCurrency(property.current_value)} />
        <ReviewRow label="After Repair Value (ARV)" value={formatCurrency(property.arv_value)} />
        <ReviewRow label="Purchase Price" value={formatCurrency(property.purchase_price)} />
      </section>

      <section className="space-y-1">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Loan Scenario</h3>
        <ReviewRow label="Loan Purpose" value={LOAN_PURPOSE_LABELS[loan.loan_purpose] ?? loan.loan_purpose} />
        <ReviewRow label="Requested Amount" value={formatCurrency(loan.requested_amount)} />
        <ReviewRow
          label="Term"
          value={loan.requested_term_months ? `${loan.requested_term_months} months` : '—'}
        />
        <ReviewRow label="Exit Strategy" value={EXIT_STRATEGY_LABELS[loan.exit_strategy] ?? loan.exit_strategy} />
      </section>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-4 py-3">{error}</p>
      )}

      <div className="flex justify-between pt-2">
        <Button type="button" variant="outline" onClick={onBack} disabled={submitting}>
          Back
        </Button>
        <Button onClick={onSubmit} disabled={submitting}>
          {submitting ? 'Submitting...' : 'Submit Application'}
        </Button>
      </div>
    </div>
  )
}
