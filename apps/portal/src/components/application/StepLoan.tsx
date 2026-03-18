import { Button } from '@/components/ui/button'
import { formatCurrencyInput, parseCurrencyInput } from '@/lib/format'
import type { ApplicationData } from '@/app/(protected)/dashboard/borrower/apply/page'

type Props = {
  data: ApplicationData['loan']
  onChange: (v: Partial<ApplicationData['loan']>) => void
  onBack: () => void
  onNext: () => void
}

const LOAN_PURPOSES = [
  { value: 'bridge', label: 'Bridge Loan' },
  { value: 'renovation', label: 'Renovation / Fix & Flip' },
  { value: 'contingency', label: 'Contingency / GAP Funding' },
  { value: 'other', label: 'Other' },
]

const EXIT_STRATEGIES = [
  { value: 'sale', label: 'Sale of Property' },
  { value: 'refinance', label: 'Refinance' },
  { value: 'repayment', label: 'Cash Repayment' },
]

const TERMS = [3, 6, 9, 12, 18, 24]

export default function StepLoan({ data, onChange, onBack, onNext }: Props) {
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onNext()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Loan Scenario</h2>
        <p className="text-sm text-gray-500 mt-1">Tell us what you need and how you plan to repay.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Loan Purpose</label>
        <select
          required
          value={data.loan_purpose}
          onChange={(e) => onChange({ loan_purpose: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          <option value="">Select purpose</option>
          {LOAN_PURPOSES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Requested Amount</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
          <input
            type="text"
            inputMode="numeric"
            required
            value={data.requested_amount ? formatCurrencyInput(data.requested_amount) : ''}
            onChange={(e) => onChange({ requested_amount: parseCurrencyInput(e.target.value) })}
            placeholder="250,000"
            className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Requested Term</label>
        <select
          required
          value={data.requested_term_months}
          onChange={(e) => onChange({ requested_term_months: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          <option value="">Select term</option>
          {TERMS.map((t) => <option key={t} value={t}>{t} months</option>)}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Exit Strategy</label>
        <select
          required
          value={data.exit_strategy}
          onChange={(e) => onChange({ exit_strategy: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          <option value="">Select exit strategy</option>
          {EXIT_STRATEGIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      <div className="flex justify-between pt-2">
        <Button type="button" variant="outline" onClick={onBack}>Back</Button>
        <Button type="submit">Review Application</Button>
      </div>
    </form>
  )
}
