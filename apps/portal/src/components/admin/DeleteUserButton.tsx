'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  userId: string
  userEmail: string
  isSelf: boolean
}

type State = 'idle' | 'confirming' | 'deleting' | 'error'

export default function DeleteUserButton({ userId, userEmail, isSelf }: Props) {
  const router = useRouter()
  const [state, setState] = useState<State>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  if (isSelf) {
    return (
      <span className="text-xs text-gray-400 italic">Can&apos;t delete yourself</span>
    )
  }

  async function handleConfirm() {
    setState('deleting')
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' })
      const data = await res.json() as { error?: string }
      if (!res.ok) {
        setErrorMsg(data.error ?? 'Delete failed')
        setState('error')
        return
      }
      router.refresh()
    } catch {
      setErrorMsg('Network error. Please try again.')
      setState('error')
    }
  }

  if (state === 'idle') {
    return (
      <button
        onClick={() => setState('confirming')}
        className="text-xs text-red-500 hover:text-red-700 font-medium"
      >
        Delete
      </button>
    )
  }

  if (state === 'confirming') {
    return (
      <span className="text-xs text-gray-600">
        Are you sure?{' '}
        <span className="text-gray-500 italic text-xs mr-1">
          Permanently delete {userEmail} and all their data?
        </span>{' '}
        <button
          onClick={() => setState('idle')}
          className="text-gray-500 hover:text-gray-700 font-medium underline"
        >
          Cancel
        </button>
        {' · '}
        <button
          onClick={handleConfirm}
          className="text-red-600 hover:text-red-800 font-medium"
        >
          Confirm Delete
        </button>
      </span>
    )
  }

  if (state === 'deleting') {
    return <span className="text-xs text-gray-400">Deleting…</span>
  }

  // error state
  return (
    <span className="text-xs text-red-600">
      {errorMsg ?? 'Delete failed.'}{' '}
      <button
        onClick={() => { setState('idle'); setErrorMsg(null) }}
        className="underline"
      >
        Try again
      </button>
    </span>
  )
}
