'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'

interface Props {
  fundId: string
  offeringTitle: string
  offeringType: string            // 'reg_a' | 'reg_d' — drives acknowledgment requirements
  minInvestment: number
  maxInvestment: number | null
  regARemaining: number | null   // null = accredited (no cap); number = cap incl. 0 = at limit
  offeringDocumentCount?: number // how many docs are attached — affects acknowledgment wording
}

export default function SubscribeForm({
  fundId,
  offeringTitle,
  offeringType,
  minInvestment,
  maxInvestment,
  regARemaining,
  offeringDocumentCount = 0,
}: Props) {
  const isRegA = offeringType === 'reg_a'
  const router = useRouter()
  const [open, setOpen]             = useState(false)
  const [amount, setAmount]         = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)

  // Schema enforces $10,000 minimum; respect the offering min too
  const effectiveMin = Math.max(minInvestment, 10_000)

  // Effective max = smallest of offering max and remaining Reg A capacity
  const caps = [maxInvestment, regARemaining].filter((v): v is number => v !== null)
  const effectiveMax = caps.length > 0 ? Math.min(...caps) : null

  function formatUSD(n: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const parsed = parseFloat(amount.replace(/[,$]/g, ''))
    if (isNaN(parsed) || parsed <= 0) {
      setError('Please enter a valid amount.')
      return
    }
    if (parsed < effectiveMin) {
      setError(`Minimum investment is ${formatUSD(effectiveMin)}.`)
      return
    }
    if (effectiveMax !== null && parsed > effectiveMax) {
      setError(`Maximum allowed is ${formatUSD(effectiveMax)}.`)
      return
    }

    setLoading(true)
    const body: Record<string, unknown> = { fund_id: fundId, commitment_amount: parsed }
    // Reg A: pass server-side acknowledgment flag so the API can timestamp it
    if (isRegA) body.offering_circular_acknowledged = acknowledged
    const res = await fetch('/api/fund/subscribe', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error ?? 'Subscription failed. Please try again.')
      return
    }

    router.push('/dashboard/investor/portfolio')
    router.refresh()
  }

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => { setOpen(true); setError(null); setAmount(''); setAcknowledged(false) }}
        className="w-full sm:w-auto text-center px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors shrink-0"
      >
        Subscribe Now
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Subscribe to Offering</h3>
                <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">{offeringTitle}</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">

              {/* Amount input */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Commitment Amount
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">$</span>
                  <input
                    required
                    type="number"
                    min={effectiveMin}
                    max={effectiveMax ?? undefined}
                    step={1000}
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder={effectiveMin.toLocaleString()}
                    className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Minimum: <strong className="text-gray-600">{formatUSD(effectiveMin)}</strong>
                  {effectiveMax !== null && (
                    <> · Maximum: <strong className="text-gray-600">{formatUSD(effectiveMax)}</strong></>
                  )}
                </p>
              </div>

              {/* Reg A capacity hint */}
              {regARemaining !== null && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 text-xs text-indigo-700">
                  Your remaining Reg A annual capacity is <strong>{formatUSD(regARemaining)}</strong>.
                  Your commitment cannot exceed this amount.
                </div>
              )}

              {/* Required acknowledgment checkbox */}
              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={e => setAcknowledged(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
                />
                <span className="text-xs text-gray-600 leading-relaxed group-hover:text-gray-800">
                  {isRegA ? (
                    <>
                      {offeringDocumentCount > 0
                        ? <>I confirm that I have read and understood the Offering Circular and all{' '}
                            {offeringDocumentCount} offering document{offeringDocumentCount !== 1 ? 's' : ''}{' '}
                            for this offering, as required by SEC Regulation A, Tier 2.{' '}</>
                        : <>I confirm that I have reviewed all available offering materials for this Reg A offering.{' '}</>
                      }
                      I understand that this is a private investment involving risk, that my annual investment
                      limit is subject to SEC rules, and that my subscription is subject to fund manager review.
                      <span className="font-semibold text-amber-700"> This acknowledgment is recorded and required before your subscription can be accepted.</span>
                    </>
                  ) : (
                    <>
                      I confirm that I have received and reviewed the Private Placement Memorandum (PPM)
                      and all offering materials for this Reg D 506(c) offering. I understand this is
                      a private investment available to accredited investors only, involving risk and
                      potential loss of principal. My subscription is subject to fund manager review and approval.
                    </>
                  )}
                </span>
              </label>

              {error && (
                <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !acknowledged}
                  title={!acknowledged ? 'You must acknowledge the offering documents before subscribing' : undefined}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Submitting…' : 'Confirm Subscription'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}
    </>
  )
}
