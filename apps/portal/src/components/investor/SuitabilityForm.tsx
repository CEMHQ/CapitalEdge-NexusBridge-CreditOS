'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Income / net-worth ranges → stored midpoint value (self-certification)
const INCOME_OPTIONS = [
  { label: 'Less than $50,000',        value: 30_000  },
  { label: '$50,000 – $100,000',       value: 75_000  },
  { label: '$100,000 – $200,000',      value: 150_000 },
  { label: '$200,000 – $500,000',      value: 350_000 },
  { label: 'More than $500,000',       value: 750_000 },
]

const US_STATES = [
  { code: 'AL', name: 'Alabama' },          { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },          { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },       { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },      { code: 'DE', name: 'Delaware' },
  { code: 'DC', name: 'District of Columbia' }, { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },          { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },            { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },          { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },           { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },        { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },         { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },         { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },      { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },          { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },           { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },       { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },         { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },     { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },         { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },     { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },   { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },        { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },             { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },         { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },    { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
  // Territories
  { code: 'PR', name: 'Puerto Rico' },      { code: 'GU', name: 'Guam' },
  { code: 'VI', name: 'U.S. Virgin Islands' }, { code: 'AS', name: 'American Samoa' },
  { code: 'MP', name: 'Northern Mariana Islands' },
]

interface Props {
  /** Pre-populated values from the investor record (may be null if not yet set) */
  currentAnnualIncome: number | null
  currentNetWorth:     number | null
  currentJurisdiction: string | null
}

export default function SuitabilityForm({
  currentAnnualIncome,
  currentNetWorth,
  currentJurisdiction,
}: Props) {
  const router = useRouter()

  // Initialise selects to the closest option or empty
  const [annualIncome,  setAnnualIncome]  = useState<string>(String(currentAnnualIncome ?? ''))
  const [netWorth,      setNetWorth]      = useState<string>(String(currentNetWorth ?? ''))
  const [jurisdiction,  setJurisdiction]  = useState<string>(currentJurisdiction ?? '')
  const [confirmed,     setConfirmed]     = useState(false)
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState<string | null>(null)

  const canSubmit = annualIncome !== '' && netWorth !== '' && jurisdiction !== '' && confirmed && !loading

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/investor/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          annual_income: Number(annualIncome),
          net_worth:     Number(netWorth),
          jurisdiction,
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setError((json as { error?: string }).error ?? 'Something went wrong. Please try again.')
        return
      }
      // Trigger server component re-fetch so the limit gauge reflects the new values
      router.refresh()
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  const isUpdate = currentAnnualIncome !== null && currentNetWorth !== null && currentJurisdiction !== null

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-gray-900">
          {isUpdate ? 'Update Financial Profile' : 'Investment Suitability Profile'}
        </p>
        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
          {isUpdate
            ? 'If your income or net worth has changed, update your profile below. Your Reg A investment limit will be recalculated immediately.'
            : 'Under SEC Regulation A Tier 2, your annual investment limit is 10% of the greater of your annual income or net worth (minimum $2,500). Please provide your approximate figures so we can calculate your personal limit.'
          }
        </p>
      </div>

      {/* Annual Income */}
      <div>
        <label htmlFor="annual-income" className="block text-xs font-medium text-gray-700 mb-1.5">
          Annual Income
        </label>
        <select
          id="annual-income"
          value={annualIncome}
          onChange={e => setAnnualIncome(e.target.value)}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="" disabled>Select a range…</option>
          {INCOME_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Net Worth */}
      <div>
        <label htmlFor="net-worth" className="block text-xs font-medium text-gray-700 mb-1.5">
          Net Worth <span className="font-normal text-gray-400">(excluding primary residence)</span>
        </label>
        <select
          id="net-worth"
          value={netWorth}
          onChange={e => setNetWorth(e.target.value)}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="" disabled>Select a range…</option>
          {INCOME_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Jurisdiction */}
      <div>
        <label htmlFor="jurisdiction" className="block text-xs font-medium text-gray-700 mb-1.5">
          State / Territory of Residence
        </label>
        <select
          id="jurisdiction"
          value={jurisdiction}
          onChange={e => setJurisdiction(e.target.value)}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="" disabled>Select a state…</option>
          {US_STATES.map(s => (
            <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
          ))}
        </select>
      </div>

      {/* Confirmation */}
      <label className="flex items-start gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={e => setConfirmed(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
        />
        <span className="text-xs text-gray-600 leading-relaxed">
          I certify that the information above is accurate to the best of my knowledge. I understand
          that NexusBridge relies on this self-certification to determine my investment eligibility
          under SEC Regulation A Tier 2.
        </span>
      </label>

      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full sm:w-auto px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Saving…' : isUpdate ? 'Update Financial Profile' : 'Save Financial Profile'}
      </button>
    </form>
  )
}
