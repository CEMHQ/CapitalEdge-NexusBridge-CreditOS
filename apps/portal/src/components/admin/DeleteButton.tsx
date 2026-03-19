'use client'

import { useState } from 'react'

type Props = {
  label?: string
  confirmMessage: string
  onDelete: () => Promise<{ error?: string } | void>
  onSuccess?: () => void
  className?: string
}

type State = 'idle' | 'confirming' | 'deleting' | 'error'

export default function DeleteButton({
  label = 'Delete',
  confirmMessage,
  onDelete,
  onSuccess,
  className,
}: Props) {
  const [state, setState] = useState<State>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handleConfirm() {
    setState('deleting')
    const result = await onDelete()
    if (result && result.error) {
      setErrorMsg(result.error)
      setState('error')
      return
    }
    onSuccess?.()
  }

  if (state === 'idle') {
    return (
      <button
        onClick={() => setState('confirming')}
        className={className ?? 'text-xs text-red-500 hover:text-red-700 font-medium'}
      >
        {label}
      </button>
    )
  }

  if (state === 'confirming') {
    return (
      <span className="text-xs text-gray-600">
        Are you sure?{' '}
        <span className="text-gray-500 italic text-xs mr-1">{confirmMessage}</span>{' '}
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
    return (
      <span className="text-xs text-gray-400">Deleting…</span>
    )
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
