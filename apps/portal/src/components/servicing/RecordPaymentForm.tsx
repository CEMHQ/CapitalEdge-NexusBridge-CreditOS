'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function RecordPaymentForm({
  loanId,
  schedule,
}: {
  loanId:   string
  schedule: { id: string; period_number: number; due_date: string; scheduled_total: string }[]
}) {
  const router = useRouter()
  const [paymentDate, setPaymentDate]       = useState(new Date().toISOString().split('T')[0])
  const [paymentAmount, setPaymentAmount]   = useState('')
  const [principalApplied, setPrincipal]    = useState('0')
  const [interestApplied, setInterest]      = useState('')
  const [feesApplied, setFees]              = useState('0')
  const [paymentMethod, setMethod]          = useState('wire')
  const [externalRef, setRef]               = useState('')
  const [scheduleId, setScheduleId]         = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [done, setDone]     = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const body: Record<string, unknown> = {
      payment_date:       paymentDate,
      payment_amount:     Number(paymentAmount),
      principal_applied:  Number(principalApplied),
      interest_applied:   Number(interestApplied),
      fees_applied:       Number(feesApplied),
      payment_method:     paymentMethod || undefined,
      external_reference: externalRef || undefined,
    }
    if (scheduleId) body.payment_schedule_id = scheduleId

    const res = await fetch(`/api/loans/${loanId}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const json = await res.json()
    if (!res.ok) {
      setError(json.error ?? 'Failed to record payment')
      setSaving(false)
      return
    }

    setDone(true)
    router.refresh()
  }

  if (done) {
    return (
      <div>
        <p className="text-sm text-green-700 font-medium">Payment recorded.</p>
        <button onClick={() => setDone(false)} className="text-xs text-green-600 underline mt-1">
          Record another
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Payment Date</label>
          <input
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Total Amount ($)</label>
          <input
            type="number"
            step="0.01"
            value={paymentAmount}
            onChange={(e) => setPaymentAmount(e.target.value)}
            required
            placeholder="e.g. 5000.00"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Principal Applied ($)</label>
          <input
            type="number"
            step="0.01"
            value={principalApplied}
            onChange={(e) => setPrincipal(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Interest Applied ($)</label>
          <input
            type="number"
            step="0.01"
            value={interestApplied}
            onChange={(e) => setInterest(e.target.value)}
            required
            placeholder="e.g. 5000.00"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Payment Method</label>
          <select
            value={paymentMethod}
            onChange={(e) => setMethod(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            <option value="wire">Wire</option>
            <option value="ach">ACH</option>
            <option value="check">Check</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">External Reference</label>
          <input
            type="text"
            value={externalRef}
            onChange={(e) => setRef(e.target.value)}
            placeholder="Wire ref, check number…"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>

        {schedule.length > 0 && (
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Link to Schedule Period (optional)</label>
            <select
              value={scheduleId}
              onChange={(e) => setScheduleId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <option value="">— None —</option>
              {schedule.map((s) => (
                <option key={s.id} value={s.id}>
                  Period {s.period_number} — Due {s.due_date} (${Number(s.scheduled_total).toLocaleString()})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className="inline-flex items-center px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700 disabled:opacity-50 transition-colors"
      >
        {saving ? 'Recording…' : 'Record Payment'}
      </button>
    </form>
  )
}
