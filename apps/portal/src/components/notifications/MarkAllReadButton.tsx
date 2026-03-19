'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function MarkAllReadButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    await fetch('/api/notifications', { method: 'PATCH' })
    router.refresh()
    setLoading(false)
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="text-sm text-gray-500 hover:text-gray-800 underline disabled:opacity-50"
    >
      {loading ? 'Marking…' : 'Mark all read'}
    </button>
  )
}
