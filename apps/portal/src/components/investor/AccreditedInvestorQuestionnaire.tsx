'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle, AlertCircle } from 'lucide-react'

const BASIS_OPTIONS = [
  {
    value: 'income',
    label: 'Income',
    description:
      'I had individual income exceeding $200,000 (or $300,000 joint with spouse/partner) in each of the two most recent years and reasonably expect the same this year.',
  },
  {
    value: 'net_worth',
    label: 'Net Worth',
    description:
      'I have a net worth exceeding $1,000,000, excluding the value of my primary residence (individually or jointly with spouse/partner).',
  },
  {
    value: 'professional',
    label: 'Professional License',
    description:
      'I hold in good standing a Series 7, Series 65, or Series 82 license (FINRA-registered investment professional).',
  },
  {
    value: 'entity',
    label: 'Entity',
    description:
      'I am investing through an entity with total assets exceeding $5,000,000, or an entity in which all equity owners qualify as accredited investors.',
  },
  {
    value: 'other',
    label: 'Other Qualifying Basis',
    description:
      'I qualify as an accredited investor under another SEC-recognized basis (e.g., family client, knowledgeable employee of a private fund).',
  },
] as const

type Basis = (typeof BASIS_OPTIONS)[number]['value']

interface Props {
  /** True if investor has already completed the AIQ. Renders a read-only confirmation instead of the form. */
  alreadyCompleted: boolean
  completedAt?: string | null
}

export default function AccreditedInvestorQuestionnaire({ alreadyCompleted, completedAt }: Props) {
  const router = useRouter()
  const [selectedBasis, setSelectedBasis] = useState<Basis | ''>('')
  const [certified, setCertified]         = useState(false)
  const [loading, setLoading]             = useState(false)
  const [error, setError]                 = useState<string | null>(null)
  const [done, setDone]                   = useState(false)

  if (alreadyCompleted || done) {
    return (
      <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl p-4">
        <CheckCircle size={16} className="text-green-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-green-800">AIQ Self-Certification Complete</p>
          <p className="text-xs text-green-700 mt-0.5">
            Your Accredited Investor Questionnaire has been submitted.
            {completedAt && (
              <> Completed on {new Date(completedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.</>
            )}
          </p>
        </div>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedBasis || !certified) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/investor/aiq', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ accreditation_basis: selectedBasis }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError((json as { error?: string }).error ?? 'Submission failed. Please try again.')
        return
      }
      setDone(true)
      router.refresh()
    } catch {
      setError('Network error — please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-4">
      <div className="flex items-start gap-2">
        <AlertCircle size={16} className="text-amber-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-amber-900">Accredited Investor Questionnaire Required</p>
          <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
            Under SEC Rule 506(c), issuers must take reasonable steps to verify that each investor is accredited.
            Please self-certify your accreditation basis below. This supplements — and does not replace — the
            accreditation documentation you submitted for admin review.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <fieldset>
          <legend className="text-xs font-semibold text-gray-900 mb-2">
            I qualify as an accredited investor because: <span className="text-red-500">*</span>
          </legend>
          <div className="space-y-2">
            {BASIS_OPTIONS.map(opt => (
              <label
                key={opt.value}
                className={`flex items-start gap-3 cursor-pointer rounded-lg border p-3 transition-colors ${
                  selectedBasis === opt.value
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="accreditation_basis"
                  value={opt.value}
                  checked={selectedBasis === opt.value}
                  onChange={() => setSelectedBasis(opt.value)}
                  className="mt-0.5 h-4 w-4 text-indigo-600 focus:ring-indigo-500 shrink-0"
                />
                <div>
                  <p className="text-xs font-semibold text-gray-900">{opt.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{opt.description}</p>
                </div>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={certified}
            onChange={e => setCertified(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
          />
          <span className="text-xs text-gray-600 leading-relaxed">
            I certify under penalty of law that the above is true and accurate. I understand that providing
            false information in connection with an investment offering may violate federal securities laws.
            NexusBridge may request supporting documentation to verify my accredited investor status.
          </span>
        </label>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}

        <button
          type="submit"
          disabled={!selectedBasis || !certified || loading}
          className="w-full sm:w-auto px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Submitting…' : 'Submit AIQ Self-Certification'}
        </button>
      </form>
    </div>
  )
}
