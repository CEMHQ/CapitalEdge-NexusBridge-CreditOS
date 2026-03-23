'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type OfferingStatus = 'draft' | 'qualified' | 'active' | 'suspended' | 'closed' | 'terminated'

const STATUSES: OfferingStatus[] = ['draft', 'qualified', 'active', 'suspended', 'closed', 'terminated']

interface Props {
  offeringId: string
  currentStatus: string
}

export default function EditOfferingStatusButton({ offeringId, currentStatus }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleChange(status: OfferingStatus) {
    if (status === currentStatus) return
    setLoading(true)
    setError(null)
    const res = await fetch(`/api/admin/offerings/${offeringId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offering_status: status }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) {
      setError(data.error ?? 'Failed to update status')
      return
    }
    router.refresh()
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <select
        value={currentStatus}
        disabled={loading}
        onChange={e => handleChange(e.target.value as OfferingStatus)}
        className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:opacity-50 capitalize"
      >
        {STATUSES.map(s => (
          <option key={s} value={s} className="capitalize">{s}</option>
        ))}
      </select>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
