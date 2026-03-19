'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const DECISION_TYPES = [
  { value: 'conditional_approval', label: 'Conditional Approval' },
  { value: 'approval',             label: 'Full Approval' },
  { value: 'decline',              label: 'Decline' },
  { value: 'hold',                 label: 'Hold for More Info' },
  { value: 'override',             label: 'Override (Management)' },
]

export default function DecisionForm({
  applicationId,
  caseId,
}: {
  applicationId: string
  caseId: string
}) {
  const router = useRouter()
  const [decisionType, setDecisionType]       = useState('conditional_approval')
  const [approvedAmount, setApprovedAmount]   = useState('')
  const [approvedRate, setApprovedRate]       = useState('')
  const [approvedTerm, setApprovedTerm]       = useState('')
  const [approvedLtv, setApprovedLtv]         = useState('')
  const [approvedLtc, setApprovedLtc]         = useState('')
  const [conditionsSummary, setConditions]    = useState('')
  const [decisionNotes, setNotes]             = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [done, setDone]     = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const body: Record<string, unknown> = { decision_type: decisionType }
    if (approvedAmount)    body.approved_amount       = Number(approvedAmount)
    if (approvedRate)      body.approved_rate         = Number(approvedRate) / 100
    if (approvedTerm)      body.approved_term_months  = Number(approvedTerm)
    if (approvedLtv)       body.approved_ltv          = Number(approvedLtv) / 100
    if (approvedLtc)       body.approved_ltc          = Number(approvedLtc) / 100
    if (conditionsSummary) body.conditions_summary    = conditionsSummary
    if (decisionNotes)     body.decision_notes        = decisionNotes

    const res = await fetch(`/api/applications/${applicationId}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const json = await res.json()
    if (!res.ok) {
      setError(json.error ?? 'Failed to record decision')
      setSaving(false)
      return
    }

    setDone(true)
    router.refresh()
  }

  if (done) {
    return <p className="text-sm text-green-700 font-medium">Decision recorded successfully.</p>
  }

  const isApprovalType = ['conditional_approval', 'approval', 'override'].includes(decisionType)

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Decision Type</label>
          <select
            value={decisionType}
            onChange={(e) => setDecisionType(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            {DECISION_TYPES.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>

        {isApprovalType && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Approved Amount ($)</label>
              <input
                type="number"
                value={approvedAmount}
                onChange={(e) => setApprovedAmount(e.target.value)}
                placeholder="e.g. 500000"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Interest Rate (%)</label>
              <input
                type="number"
                step="0.01"
                value={approvedRate}
                onChange={(e) => setApprovedRate(e.target.value)}
                placeholder="e.g. 12.5"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Term (months)</label>
              <input
                type="number"
                value={approvedTerm}
                onChange={(e) => setApprovedTerm(e.target.value)}
                placeholder="e.g. 12"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">LTV (%)</label>
              <input
                type="number"
                step="0.1"
                value={approvedLtv}
                onChange={(e) => setApprovedLtv(e.target.value)}
                placeholder="e.g. 65"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">LTC (%)</label>
              <input
                type="number"
                step="0.1"
                value={approvedLtc}
                onChange={(e) => setApprovedLtc(e.target.value)}
                placeholder="e.g. 80"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          </>
        )}
      </div>

      {isApprovalType && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Conditions Summary</label>
          <textarea
            value={conditionsSummary}
            onChange={(e) => setConditions(e.target.value)}
            rows={2}
            placeholder="List any outstanding conditions..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Decision Notes</label>
        <textarea
          value={decisionNotes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Internal rationale for this decision..."
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className="inline-flex items-center px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700 disabled:opacity-50 transition-colors"
      >
        {saving ? 'Saving…' : 'Record Decision'}
      </button>
    </form>
  )
}
