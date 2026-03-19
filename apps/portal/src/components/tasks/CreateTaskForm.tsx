'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type StaffMember = { id: string; full_name: string | null; email: string | null }

type Props = { staff: StaffMember[] }

const OWNER_TYPES = ['application', 'loan', 'underwriting_case', 'investor'] as const
const PRIORITIES  = ['low', 'medium', 'high', 'urgent'] as const

export default function CreateTaskForm({ staff }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    task_owner_type: 'application',
    task_owner_id:   '',
    title:           '',
    description:     '',
    priority:        'medium',
    due_date:        '',
    assigned_to:     '',
  })

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_owner_type: form.task_owner_type,
          task_owner_id:   form.task_owner_id,
          title:           form.title,
          description:     form.description || undefined,
          priority:        form.priority,
          due_date:        form.due_date || undefined,
          assigned_to:     form.assigned_to || undefined,
        }),
      })
      const data = await res.json() as { error?: string; issues?: unknown[] }
      if (!res.ok) {
        setError(data.error ?? 'Failed to create task')
        setSaving(false)
        return
      }
      setOpen(false)
      setForm({ task_owner_type: 'application', task_owner_id: '', title: '', description: '', priority: 'medium', due_date: '', assigned_to: '' })
      router.refresh()
    } catch {
      setError('Network error')
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700 transition-colors"
      >
        + New Task
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">New Task</h2>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-gray-400 hover:text-gray-700">Cancel</button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-500">Title <span className="text-red-500">*</span></label>
          <input
            required type="text" value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="e.g. Request updated appraisal"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-500">Priority</label>
          <select value={form.priority} onChange={(e) => set('priority', e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400">
            {PRIORITIES.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-500">Owner Type <span className="text-red-500">*</span></label>
          <select value={form.task_owner_type} onChange={(e) => set('task_owner_type', e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400">
            {OWNER_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-500">Owner ID (UUID) <span className="text-red-500">*</span></label>
          <input
            required type="text" value={form.task_owner_id}
            onChange={(e) => set('task_owner_id', e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-gray-400"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-500">Assign To</label>
          <select value={form.assigned_to} onChange={(e) => set('assigned_to', e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400">
            <option value="">Unassigned</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name ?? s.email ?? s.id}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-500">Due Date</label>
          <input type="date" value={form.due_date} onChange={(e) => set('due_date', e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
          />
        </div>
        <div className="col-span-2 space-y-1">
          <label className="text-xs font-medium text-gray-500">Description</label>
          <textarea rows={2} value={form.description} onChange={(e) => set('description', e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400 resize-none"
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        <button type="submit" disabled={saving}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700 disabled:opacity-50 transition-colors">
          {saving ? 'Creating…' : 'Create Task'}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={saving}
          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
          Cancel
        </button>
      </div>
    </form>
  )
}
