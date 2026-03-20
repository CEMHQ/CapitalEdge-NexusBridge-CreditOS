'use client'

import { useState } from 'react'

const EVENT_TYPES = [
  { value: 'application_status_changed', label: 'Application status changed' },
  { value: 'document_uploaded',          label: 'Document uploaded' },
  { value: 'document_reviewed',          label: 'Document reviewed' },
  { value: 'payment_received',           label: 'Payment received' },
  { value: 'loan_status_changed',        label: 'Loan status changed' },
  { value: 'condition_updated',          label: 'Condition updated' },
  { value: 'subscription_status_changed', label: 'Subscription status changed' },
]

const CONDITION_HINTS: Record<string, string> = {
  application_status_changed: '{"new_status": "under_review"}',
  loan_status_changed:        '{"new_status": "delinquent"}',
  document_reviewed:          '{"review_status": "rejected"}',
  condition_updated:          '{"new_status": "satisfied"}',
  subscription_status_changed: '{"new_status": "approved"}',
  document_uploaded:          '{}',
  payment_received:           '{}',
}

const ACTION_TEMPLATE = JSON.stringify(
  [
    {
      type: 'create_task',
      title: 'Task title here',
      task_owner_type: 'application',
      task_owner_id_from: 'entity_id',
      priority: 'medium',
      due_days: 3,
      description: 'Optional description',
    },
  ],
  null,
  2
)

export default function CreateWorkflowForm() {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [eventType, setEventType] = useState('')
  const [conditionsJson, setConditionsJson] = useState('{}')
  const [actionsJson, setActionsJson] = useState(ACTION_TEMPLATE)
  const [isActive, setIsActive] = useState(false)

  function handleEventTypeChange(val: string) {
    setEventType(val)
    setConditionsJson(CONDITION_HINTS[val] ?? '{}')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    let conditions: unknown
    let actions: unknown
    try {
      conditions = JSON.parse(conditionsJson)
    } catch {
      setError('Conditions must be valid JSON')
      return
    }
    try {
      actions = JSON.parse(actionsJson)
    } catch {
      setError('Actions must be valid JSON')
      return
    }

    setSaving(true)
    const res = await fetch('/api/admin/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, event_type: eventType, conditions, actions, is_active: isActive }),
    })
    const data = await res.json()
    setSaving(false)

    if (!res.ok) {
      setError(data.error ?? 'Failed to create workflow')
      return
    }

    window.location.reload()
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
      >
        New Workflow
      </button>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 w-full">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-semibold text-gray-900">New Workflow Trigger</h2>
        <button onClick={() => setOpen(false)} className="text-sm text-gray-400 hover:text-gray-600">
          Cancel
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Auto-assign on review"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Event Type</label>
            <select
              required
              value={eventType}
              onChange={(e) => handleEventTypeChange(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <option value="">Select event…</option>
              {EVENT_TYPES.map((et) => (
                <option key={et.value} value={et.value}>{et.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Description (optional)</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this workflow do?"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Conditions <span className="text-gray-400 font-normal">(JSON — key/value pairs matched against event)</span>
            </label>
            <textarea
              rows={4}
              value={conditionsJson}
              onChange={(e) => setConditionsJson(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Actions <span className="text-gray-400 font-normal">(JSON array)</span>
            </label>
            <textarea
              rows={4}
              value={actionsJson}
              onChange={(e) => setActionsJson(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="is_active"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          <label htmlFor="is_active" className="text-sm text-gray-700">Activate immediately</label>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Creating…' : 'Create Workflow'}
          </button>
        </div>
      </form>
    </div>
  )
}
