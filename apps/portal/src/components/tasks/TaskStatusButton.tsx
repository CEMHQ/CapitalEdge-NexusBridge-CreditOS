'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const NEXT_STATUS: Record<string, string> = {
  open:        'in_progress',
  in_progress: 'completed',
}

const BUTTON_LABEL: Record<string, string> = {
  open:        'Start',
  in_progress: 'Complete',
}

const STATUS_COLORS: Record<string, string> = {
  open:        'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-50 text-blue-700',
  completed:   'bg-green-50 text-green-700',
  cancelled:   'bg-gray-100 text-gray-400',
}

export function TaskStatusBadge({ status }: { status: string }) {
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {label}
    </span>
  )
}

export default function TaskStatusButton({ taskId, status }: { taskId: string; status: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const next = NEXT_STATUS[status]

  if (!next) return <TaskStatusBadge status={status} />

  async function handleClick() {
    setLoading(true)
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_status: next }),
    })
    router.refresh()
    setLoading(false)
  }

  return (
    <div className="flex items-center gap-2">
      <TaskStatusBadge status={status} />
      <button
        onClick={handleClick}
        disabled={loading}
        className="text-xs text-gray-500 hover:text-gray-800 underline disabled:opacity-50"
      >
        {loading ? '…' : BUTTON_LABEL[status]}
      </button>
    </div>
  )
}
