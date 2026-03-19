'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const ROLES = ['admin', 'manager', 'underwriter', 'servicing', 'investor', 'borrower'] as const
type Role = typeof ROLES[number]

type Props = {
  userId: string
  currentRole: string | null
  isSelf: boolean
}

export default function EditUserRoleButton({ userId, currentRole, isSelf }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState<Role | ''>(
    ROLES.includes(currentRole as Role) ? (currentRole as Role) : ''
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (isSelf) return null

  async function handleSave() {
    if (!selected) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: selected }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Save failed')
        setSaving(false)
        return
      }
      setEditing(false)
      router.refresh()
    } catch {
      setError('Network error')
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-xs text-gray-500 hover:text-gray-800 font-medium underline"
      >
        Edit
      </button>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value as Role)}
        disabled={saving}
        className="text-xs border border-gray-300 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-gray-400"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
          </option>
        ))}
      </select>
      <button
        onClick={handleSave}
        disabled={saving || !selected}
        className="text-xs text-green-700 hover:text-green-900 font-medium disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button
        onClick={() => { setEditing(false); setError(null) }}
        disabled={saving}
        className="text-xs text-gray-400 hover:text-gray-600"
      >
        Cancel
      </button>
      {error && <span className="text-xs text-red-600 w-full">{error}</span>}
    </span>
  )
}
