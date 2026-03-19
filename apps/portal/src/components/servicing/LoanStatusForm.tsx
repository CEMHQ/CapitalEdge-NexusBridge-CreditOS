'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

const STATUSES = [
  { value: 'pending_funding', label: 'Pending Funding' },
  { value: 'active',          label: 'Active' },
  { value: 'matured',         label: 'Matured' },
  { value: 'delinquent',      label: 'Delinquent' },
  { value: 'defaulted',       label: 'Defaulted' },
  { value: 'paid_off',        label: 'Paid Off' },
  { value: 'charged_off',     label: 'Charged Off' },
  { value: 'closed',          label: 'Closed' },
]

const STATUS_COLORS: Record<string, string> = {
  pending_funding: 'bg-gray-100 text-gray-600',
  active:          'bg-green-50 text-green-700',
  matured:         'bg-amber-50 text-amber-700',
  delinquent:      'bg-orange-50 text-orange-700',
  defaulted:       'bg-red-50 text-red-700',
  paid_off:        'bg-blue-50 text-blue-700',
  charged_off:     'bg-red-100 text-red-800',
  closed:          'bg-gray-50 text-gray-400',
}

export default function LoanStatusForm({
  loanId,
  currentStatus,
}: {
  loanId:        string
  currentStatus: string
}) {
  const router = useRouter()
  const [status, setStatus] = useState(currentStatus)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const isDirty = status !== currentStatus

  async function handleSave() {
    setSaving(true)
    setError(null)

    const res = await fetch(`/api/loans/${loanId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loan_status: status }),
    })

    const json = await res.json()
    if (!res.ok) {
      setError(json.error ?? 'Failed to update status')
      setSaving(false)
      return
    }

    router.refresh()
    setSaving(false)
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600'}`}>
          {status.replace(/_/g, ' ')}
        </span>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        {isDirty && (
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
