'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'

interface Props {
  offeringId: string
  docId: string
  label: string
}

export default function DeleteOfferingDocumentButton({ offeringId, docId, label }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)

  async function handleDelete() {
    setLoading(true)
    const res = await fetch(`/api/admin/offerings/${offeringId}/documents/${docId}`, {
      method: 'DELETE',
    })
    setLoading(false)
    if (res.ok) {
      setConfirming(false)
      router.refresh()
    }
  }

  if (confirming) {
    return (
      <span className="flex items-center gap-1">
        <button
          onClick={handleDelete}
          disabled={loading}
          className="text-xs text-red-600 font-medium hover:text-red-800 disabled:opacity-50"
          title={`Remove "${label}"`}
        >
          {loading ? '…' : 'Remove'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          ✕
        </button>
      </span>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="text-gray-300 hover:text-red-500 transition-colors"
      title="Remove document"
    >
      <X size={12} />
    </button>
  )
}
