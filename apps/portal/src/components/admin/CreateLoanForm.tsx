'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function CreateLoanForm({
  applicationId,
  requestedAmount,
  requestedTermMonths,
}: {
  applicationId:      string
  requestedAmount:    number
  requestedTermMonths: number
}) {
  const router = useRouter()
  const [open, setOpen]                     = useState(false)
  const [principalAmount, setPrincipal]     = useState(String(requestedAmount))
  const [interestRate, setRate]             = useState('')
  const [originationFee, setFee]            = useState('0')
  const [termMonths, setTerm]               = useState(String(requestedTermMonths))
  const [paymentType, setPaymentType]       = useState('interest_only')
  const [fundingDate, setFundingDate]       = useState(new Date().toISOString().split('T')[0])
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const res = await fetch('/api/loans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        application_id:    applicationId,
        principal_amount:  Number(principalAmount),
        interest_rate:     Number(interestRate) / 100,
        origination_fee:   Number(originationFee),
        term_months:       Number(termMonths),
        payment_type:      paymentType,
        funding_date:      fundingDate,
      }),
    })

    const json = await res.json()
    if (!res.ok) {
      setError(json.error ?? 'Failed to create loan')
      setSaving(false)
      return
    }

    router.push(`/dashboard/servicing/loans/${json.loan_id}`)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center px-4 py-2 bg-green-700 text-white text-sm font-medium rounded-md hover:bg-green-800 transition-colors"
      >
        Create Loan
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 bg-white rounded-xl border border-gray-200 p-6 mt-6">
      <h2 className="text-base font-semibold text-gray-900">Create Loan</h2>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Principal Amount ($)</label>
          <input
            type="number"
            value={principalAmount}
            onChange={(e) => setPrincipal(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Interest Rate (%)</label>
          <input
            type="number"
            step="0.01"
            value={interestRate}
            onChange={(e) => setRate(e.target.value)}
            required
            placeholder="e.g. 12.5"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Origination Fee ($)</label>
          <input
            type="number"
            step="0.01"
            value={originationFee}
            onChange={(e) => setFee(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Term (months)</label>
          <input
            type="number"
            value={termMonths}
            onChange={(e) => setTerm(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Payment Type</label>
          <select
            value={paymentType}
            onChange={(e) => setPaymentType(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            <option value="interest_only">Interest Only</option>
            <option value="balloon">Balloon</option>
            <option value="amortizing">Amortizing</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Funding Date</label>
          <input
            type="date"
            value={fundingDate}
            onChange={(e) => setFundingDate(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Creating…' : 'Confirm & Create Loan'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-gray-500 hover:text-gray-900"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
