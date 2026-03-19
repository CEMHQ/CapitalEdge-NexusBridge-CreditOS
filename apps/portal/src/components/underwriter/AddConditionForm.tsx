'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const CONDITION_TYPES = [
  { value: 'appraisal',   label: 'Appraisal' },
  { value: 'insurance',   label: 'Insurance' },
  { value: 'title',       label: 'Title' },
  { value: 'document',    label: 'Document' },
  { value: 'financial',   label: 'Financial' },
  { value: 'compliance',  label: 'Compliance' },
]

export default function AddConditionForm({ caseId }: { caseId: string }) {
  const router = useRouter()
  const [conditionType, setConditionType] = useState('document')
  const [description, setDescription]     = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [open, setOpen]     = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const res = await fetch(`/api/underwriting/cases/${caseId}/conditions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ condition_type: conditionType, description }),
    })

    const json = await res.json()
    if (!res.ok) {
      setError(json.error ?? 'Failed to add condition')
      setSaving(false)
      return
    }

    setDescription('')
    setOpen(false)
    router.refresh()
    setSaving(false)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-gray-600 hover:text-gray-900 font-medium underline underline-offset-2"
      >
        + Add condition
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 mt-4 pt-4 border-t border-gray-200">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
          <select
            value={conditionType}
            onChange={(e) => setConditionType(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            {CONDITION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            placeholder="Describe the condition..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving}
          className="px-3 py-1.5 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Adding…' : 'Add'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-900"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
