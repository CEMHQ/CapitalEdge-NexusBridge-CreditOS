'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

const STATUSES = [
  { value: 'submitted', label: 'Submitted' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'conditionally_approved', label: 'Conditionally Approved' },
  { value: 'approved', label: 'Approved' },
  { value: 'declined', label: 'Declined' },
  { value: 'funded', label: 'Funded' },
  { value: 'closed', label: 'Closed' },
]

function statusColor(status: string) {
  switch (status) {
    case 'submitted': return 'bg-blue-50 text-blue-700'
    case 'under_review': return 'bg-yellow-50 text-yellow-700'
    case 'conditionally_approved': return 'bg-orange-50 text-orange-700'
    case 'approved': return 'bg-green-50 text-green-700'
    case 'funded': return 'bg-green-100 text-green-800'
    case 'declined': return 'bg-red-50 text-red-700'
    default: return 'bg-gray-100 text-gray-600'
  }
}

export default function ApplicationStatusForm({
  applicationId,
  currentStatus,
}: {
  applicationId: string
  currentStatus: string
}) {
  const router = useRouter()
  const [status, setStatus] = useState(currentStatus)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isDirty = status !== currentStatus

  async function handleSave() {
    setSaving(true)
    setError(null)

    const res = await fetch(`/api/applications/${applicationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ application_status: status }),
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
        <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${statusColor(status)}`}>
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
