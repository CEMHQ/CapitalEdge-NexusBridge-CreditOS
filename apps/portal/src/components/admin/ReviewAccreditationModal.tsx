'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type AccredRecord = {
  id: string
  investor_id: string
  verification_method: string
  status: string
  verified_at: string | null
  expires_at: string | null
  reviewer_notes: string | null
  created_at: string
  investor_name: string | null
  investor_email: string | null
}

type Props = {
  record: AccredRecord
  basePath: string  // path to redirect to after close (without ?review=)
}

const STATUS_OPTIONS = [
  { value: 'under_review', label: 'Mark Under Review', description: 'Move to under_review — notify the investor their submission is being reviewed.' },
  { value: 'verified',     label: 'Verify',            description: 'Approve — marks the investor as accredited (90-day expiry).' },
  { value: 'rejected',     label: 'Reject',            description: 'Reject — investor must re-submit. Provide a reason below.' },
] as const

type DecisionStatus = typeof STATUS_OPTIONS[number]['value']

export default function ReviewAccreditationModal({ record, basePath }: Props) {
  const router = useRouter()
  const [decision, setDecision]     = useState<DecisionStatus | ''>('')
  const [notes, setNotes]           = useState(record.reviewer_notes ?? '')
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState<string | null>(null)

  function close() {
    router.push(basePath)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!decision) return

    setSaving(true)
    setError(null)

    try {
      const res = await fetch(`/api/compliance/accreditation/${record.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: decision,
          reviewer_notes: notes.trim() || undefined,
        }),
      })

      const data = await res.json() as { error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Save failed')
        setSaving(false)
        return
      }

      router.push(basePath)
      router.refresh()
    } catch {
      setError('Network error — please try again')
      setSaving(false)
    }
  }

  const methodLabel = record.verification_method.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

  return (
    /* Backdrop */
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 id="review-modal-title" className="text-base font-semibold text-gray-900">
              Review Accreditation
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {record.investor_name ?? 'Unknown investor'} &middot; {record.investor_email ?? '—'}
            </p>
          </div>
          <button
            onClick={close}
            disabled={saving}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-md hover:bg-gray-100"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Submission details */}
        <div className="px-6 pt-4 pb-2">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <dt className="text-xs text-gray-400 font-medium uppercase tracking-wide">Method</dt>
              <dd className="text-gray-800 mt-0.5">{methodLabel}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400 font-medium uppercase tracking-wide">Current Status</dt>
              <dd className="text-gray-800 mt-0.5 capitalize">{record.status.replace(/_/g, ' ')}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400 font-medium uppercase tracking-wide">Submitted</dt>
              <dd className="text-gray-800 mt-0.5">{new Date(record.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</dd>
            </div>
            {record.expires_at && (
              <div>
                <dt className="text-xs text-gray-400 font-medium uppercase tracking-wide">Expires</dt>
                <dd className="text-gray-800 mt-0.5">{new Date(record.expires_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 pb-6 pt-4 space-y-4">
          {/* Decision */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">Decision</p>
            <div className="space-y-2">
              {STATUS_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    decision === opt.value
                      ? opt.value === 'verified'
                        ? 'border-green-300 bg-green-50'
                        : opt.value === 'rejected'
                        ? 'border-red-300 bg-red-50'
                        : 'border-blue-300 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="decision"
                    value={opt.value}
                    checked={decision === opt.value}
                    onChange={() => setDecision(opt.value)}
                    disabled={saving}
                    className="mt-0.5 shrink-0"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{opt.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Reviewer notes */}
          <div className="space-y-1.5">
            <label htmlFor="reviewer-notes" className="text-sm font-medium text-gray-700">
              Notes {decision === 'rejected' && <span className="text-red-500">*</span>}
            </label>
            <textarea
              id="reviewer-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={saving}
              rows={3}
              placeholder={decision === 'rejected' ? 'Explain why the submission was rejected…' : 'Optional reviewer notes…'}
              className="w-full text-sm border border-gray-300 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:bg-gray-50"
              maxLength={1000}
              required={decision === 'rejected'}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={close}
              disabled={saving}
              className="text-sm text-gray-500 hover:text-gray-700 font-medium px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !decision}
              className={`text-sm font-medium px-5 py-2 rounded-lg transition-colors disabled:opacity-50 ${
                decision === 'verified'
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : decision === 'rejected'
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-gray-900 text-white hover:bg-gray-700'
              }`}
            >
              {saving ? 'Saving…' : decision === 'verified' ? 'Verify' : decision === 'rejected' ? 'Reject' : 'Submit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
