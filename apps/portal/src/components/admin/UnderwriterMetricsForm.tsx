'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

type Metrics = {
  requested_ltv: string | null
  requested_ltc: string | null
  requested_dscr: string | null
}

export default function UnderwriterMetricsForm({
  applicationId: _applicationId,
  loanRequestId,
  initial,
}: {
  applicationId: string
  loanRequestId: string
  initial: Metrics
}) {
  const router = useRouter()
  const [values, setValues] = useState<Metrics>({
    requested_ltv: initial.requested_ltv ?? '',
    requested_ltc: initial.requested_ltc ?? '',
    requested_dscr: initial.requested_dscr ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleChange(field: keyof Metrics, value: string) {
    setSaved(false)
    setValues((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSaved(false)

    const res = await fetch(`/api/loan-requests/${loanRequestId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requested_ltv: values.requested_ltv || null,
        requested_ltc: values.requested_ltc || null,
        requested_dscr: values.requested_dscr || null,
      }),
    })

    const json = await res.json()

    if (!res.ok) {
      setError(json.error ?? 'Failed to save metrics')
      setSaving(false)
      return
    }

    setSaved(true)
    setSaving(false)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">LTV (%)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={values.requested_ltv ?? ''}
            onChange={(e) => handleChange('requested_ltv', e.target.value)}
            placeholder="e.g. 65.00"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          <p className="text-xs text-gray-400 mt-1">Loan-to-Value</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">LTC (%)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={values.requested_ltc ?? ''}
            onChange={(e) => handleChange('requested_ltc', e.target.value)}
            placeholder="e.g. 80.00"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          <p className="text-xs text-gray-400 mt-1">Loan-to-Cost</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">DSCR</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={values.requested_dscr ?? ''}
            onChange={(e) => handleChange('requested_dscr', e.target.value)}
            placeholder="e.g. 1.25"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          <p className="text-xs text-gray-400 mt-1">Debt Service Coverage</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Metrics'}
        </Button>
        {saved && <span className="text-xs text-green-600">Saved</span>}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  )
}
