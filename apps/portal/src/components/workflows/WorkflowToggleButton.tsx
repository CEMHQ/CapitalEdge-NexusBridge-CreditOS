'use client'

import { useState } from 'react'

export default function WorkflowToggleButton({
  triggerId,
  isActive,
}: {
  triggerId: string
  isActive: boolean
}) {
  const [active, setActive] = useState(isActive)
  const [saving, setSaving] = useState(false)

  async function toggle() {
    setSaving(true)
    const res = await fetch(`/api/admin/workflows/${triggerId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !active }),
    })
    if (res.ok) {
      setActive((prev) => !prev)
    } else {
      const data = await res.json()
      alert(data.error ?? 'Failed to update workflow')
    }
    setSaving(false)
  }

  return (
    <button
      onClick={toggle}
      disabled={saving}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
        active ? 'bg-green-500' : 'bg-gray-300'
      }`}
      title={active ? 'Click to disable' : 'Click to enable'}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          active ? 'translate-x-4.5' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}
