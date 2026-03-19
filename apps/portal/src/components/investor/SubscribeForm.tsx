'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function SubscribeForm({ fundId }: { fundId: string }) {
  const router = useRouter()
  const [open, setOpen]     = useState(false)
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [success, setSuccess] = useState<{ fcfs_position: number; expires_at: string } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/fund/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fund_id:           fundId,
          commitment_amount: Number(amount.replace(/[^0-9.]/g, '')),
        }),
      })

      const json = await res.json()

      if (!res.ok) {
        setError(json.error ?? 'Submission failed')
        return
      }

      setSuccess({
        fcfs_position: json.fcfs_position,
        expires_at:    json.reservation_expires_at,
      })
      router.refresh()
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-5 space-y-2">
        <p className="text-sm font-semibold text-green-800">Subscription submitted</p>
        <p className="text-sm text-green-700">
          You are <span className="font-medium">#{success.fcfs_position}</span> in queue.
          Your reservation is held until {new Date(success.expires_at).toLocaleTimeString()}.
        </p>
        <p className="text-xs text-green-600">
          The NexusBridge team will review your subscription and contact you to complete funding.
        </p>
      </div>
    )
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
      >
        Subscribe to Fund
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-5 space-y-4 max-w-sm">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Subscribe — NexusBridge Capital LP</h3>
        <p className="text-xs text-gray-500 mt-0.5">Minimum commitment: $10,000 · Reg D / 506(c)</p>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Commitment Amount (USD)</label>
        <input
          type="text"
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="e.g. 50,000"
          required
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Submitting…' : 'Submit Subscription'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>

      <p className="text-xs text-gray-400">
        Your position is reserved for 30 minutes via first-come, first-served queue.
      </p>
    </form>
  )
}
