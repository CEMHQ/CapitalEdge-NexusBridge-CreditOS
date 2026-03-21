'use client'

import { useState } from 'react'

type Props = {
  investorId: string
}

export default function StartKycButton({ investorId }: Props) {
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  async function handleClick() {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/compliance/kyc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ investor_id: investorId }),
      })

      const data = await res.json() as {
        success?: boolean
        inquiryUrl?: string | null
        manual?: boolean
        error?: string
      }

      if (!res.ok) {
        if (res.status === 409) {
          setError('Identity verification already complete.')
        } else {
          setError(data.error ?? 'Failed to start verification')
        }
        setLoading(false)
        return
      }

      if (data.inquiryUrl) {
        // Redirect the investor to the Persona hosted verification flow
        window.location.href = data.inquiryUrl
      } else {
        // Manual / sandbox mode — no URL to redirect to
        setError('Verification submitted for manual review. Our team will contact you shortly.')
        setLoading(false)
      }
    } catch {
      setError('Network error — please try again')
      setLoading(false)
    }
  }

  return (
    <div className="shrink-0 ml-4 text-right">
      <button
        onClick={handleClick}
        disabled={loading}
        className="text-xs text-indigo-600 font-medium hover:text-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Starting…' : 'Start Verification →'}
      </button>
      {error && (
        <p className="text-xs text-red-600 mt-1 max-w-[180px]">{error}</p>
      )}
    </div>
  )
}
