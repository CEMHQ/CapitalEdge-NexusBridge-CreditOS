'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'

interface Props {
  offeringId: string
  title: string
  disabled?: boolean
}

export default function DeleteOfferingButton({ offeringId, title, disabled }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)

  async function handleDelete() {
    setLoading(true)
    const res = await fetch(`/api/admin/offerings/${offeringId}`, { method: 'DELETE' })
    setLoading(false)
    if (res.ok) {
      setConfirming(false)
      router.refresh()
    }
  }

  if (disabled) {
    return (
      <button
        disabled
        title="Set status to closed or terminated before deleting"
        className="p-1.5 rounded-md text-gray-300 cursor-not-allowed"
      >
        <Trash2 size={15} />
      </button>
    )
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-xs text-red-600">Delete &ldquo;{title}&rdquo;?</span>
        <button
          onClick={handleDelete}
          disabled={loading}
          className="text-xs text-red-600 font-medium hover:text-red-800 disabled:opacity-50"
        >
          {loading ? 'Deleting…' : 'Yes'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
      title="Delete offering"
    >
      <Trash2 size={15} />
    </button>
  )
}
