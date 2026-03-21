'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const VERIFICATION_METHODS = [
  {
    value: 'income',
    label: 'Annual Income',
    description: 'Tax returns (W-2, 1040) showing income exceeding $200K ($300K joint) for the past two years.',
  },
  {
    value: 'net_worth',
    label: 'Net Worth',
    description: 'Bank or brokerage statements demonstrating net worth exceeding $1,000,000 (excluding primary residence).',
  },
  {
    value: 'professional_certification',
    label: 'Professional Certification',
    description: 'Active FINRA Series 7, 65, or 82 license. Provide your license number and issuing broker-dealer.',
  },
  {
    value: 'entity_assets',
    label: 'Entity Assets',
    description: 'Entity (LLC, trust, corporation) with total assets exceeding $5,000,000, or all equity owners are individually accredited.',
  },
  {
    value: 'third_party_letter',
    label: 'Third-Party Verification Letter',
    description: 'Letter from a licensed CPA, attorney, registered investment adviser, or broker-dealer confirming accredited status.',
  },
]

type Step = 1 | 2 | 3

export default function InvestorOnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 1: investor type
  const [investorType, setInvestorType] = useState('individual')

  // Step 2: accreditation self-declaration
  const [selfDeclared, setSelfDeclared] = useState(false)

  // Step 3: verification method + document reference
  const [method, setMethod] = useState('third_party_letter')
  const [notes, setNotes] = useState('')

  async function handleSubmit() {
    setError(null)
    setSaving(true)

    // Save investor type
    await fetch('/api/investor/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ investor_type: investorType }),
    })

    // Submit accreditation record
    const res = await fetch('/api/compliance/accreditation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verification_method: method, notes: notes || undefined }),
    })

    const data = await res.json()
    setSaving(false)

    if (!res.ok) {
      setError(data.error ?? 'Submission failed')
      return
    }

    router.push('/dashboard/investor/compliance')
  }

  return (
    <div className="max-w-2xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Investor Onboarding</h1>
        <p className="text-sm text-gray-500 mt-1">Complete all steps to unlock access to NexusBridge Capital LP</p>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2">
        {([1, 2, 3] as Step[]).map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
              step > s ? 'bg-green-500 text-white' : step === s ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-500'
            }`}>
              {step > s ? '✓' : s}
            </div>
            {s < 3 && <div className={`h-px w-12 ${step > s ? 'bg-green-400' : 'bg-gray-200'}`} />}
          </div>
        ))}
        <span className="ml-3 text-sm text-gray-500">
          {step === 1 ? 'Investor Profile' : step === 2 ? 'Accreditation Disclosure' : 'Verification Method'}
        </span>
      </div>

      {/* Step 1 — Investor Profile */}
      {step === 1 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <h2 className="text-base font-semibold text-gray-900">Investor Profile</h2>
          <p className="text-sm text-gray-500">
            Tell us how you are investing. This determines the verification documents required.
          </p>

          <div className="space-y-3">
            {[
              { value: 'individual', label: 'Individual', desc: 'Personal account — income and net worth are evaluated individually.' },
              { value: 'joint', label: 'Joint / Spousal', desc: 'Joint account — combined income and net worth apply.' },
              { value: 'entity', label: 'Entity (LLC, Trust, Corporation)', desc: 'Investing through a legal entity.' },
              { value: 'ira', label: 'IRA / Retirement Account', desc: 'Self-directed IRA or similar retirement vehicle.' },
            ].map((opt) => (
              <label key={opt.value} className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                investorType === opt.value ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'
              }`}>
                <input
                  type="radio"
                  name="investorType"
                  value={opt.value}
                  checked={investorType === opt.value}
                  onChange={(e) => setInvestorType(e.target.value)}
                  className="mt-0.5 accent-indigo-600"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={() => setStep(2)}
              className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Step 2 — Accreditation Self-Declaration */}
      {step === 2 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <h2 className="text-base font-semibold text-gray-900">Accreditation Disclosure</h2>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-amber-800">Reg D 506(c) — Accredited Investors Only</p>
            <p className="text-sm text-amber-700 mt-1">
              NexusBridge Capital LP is offered exclusively to accredited investors under SEC Rule 506(c).
              Under this exemption, <strong>your status as an accredited investor must be independently verified</strong> —
              self-certification alone is not sufficient. You will be required to provide supporting documentation.
            </p>
          </div>

          <p className="text-sm text-gray-600">An accredited investor is an individual or entity that meets ONE of the following criteria:</p>

          <ul className="space-y-2 text-sm text-gray-700">
            <li className="flex gap-2"><span className="text-indigo-500 font-bold shrink-0">·</span>Annual income exceeding $200,000 (or $300,000 joint with spouse) for the past two years, with reasonable expectation of the same this year</li>
            <li className="flex gap-2"><span className="text-indigo-500 font-bold shrink-0">·</span>Net worth exceeding $1,000,000 individually or jointly, excluding primary residence</li>
            <li className="flex gap-2"><span className="text-indigo-500 font-bold shrink-0">·</span>Holder of an active FINRA Series 7, 65, or 82 license</li>
            <li className="flex gap-2"><span className="text-indigo-500 font-bold shrink-0">·</span>Entity (LLC, trust, or corporation) with total assets exceeding $5,000,000 and not formed for the purpose of acquiring these securities</li>
          </ul>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={selfDeclared}
              onChange={(e) => setSelfDeclared(e.target.checked)}
              className="mt-0.5 accent-indigo-600"
            />
            <span className="text-sm text-gray-700">
              I confirm that I qualify as an accredited investor under the criteria above, and I understand that I will be required to provide documentation to verify my status.
            </span>
          </label>

          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(1)} className="text-sm text-gray-500 hover:text-gray-700">Back</button>
            <button
              disabled={!selfDeclared}
              onClick={() => setStep(3)}
              className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — Verification Method */}
      {step === 3 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <h2 className="text-base font-semibold text-gray-900">Select Verification Method</h2>
          <p className="text-sm text-gray-500">
            Choose how you will verify your accredited investor status. Our compliance team will review your submission and may request additional documentation.
          </p>

          <div className="space-y-3">
            {VERIFICATION_METHODS.map((m) => (
              <label key={m.value} className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                method === m.value ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'
              }`}>
                <input
                  type="radio"
                  name="method"
                  value={m.value}
                  checked={method === m.value}
                  onChange={(e) => setMethod(e.target.value)}
                  className="mt-0.5 accent-indigo-600"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">{m.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{m.description}</p>
                </div>
              </label>
            ))}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Additional notes (optional)</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional context for the compliance team..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm font-medium text-blue-800">Next steps after submission</p>
            <ol className="mt-1 space-y-1 text-xs text-blue-700 list-decimal list-inside">
              <li>Our compliance team reviews your request (1–2 business days)</li>
              <li>You will receive a document request via email</li>
              <li>Upload your verification documents to the Documents section</li>
              <li>Once verified, you will receive a notification and can subscribe to the fund</li>
            </ol>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(2)} className="text-sm text-gray-500 hover:text-gray-700">Back</button>
            <button
              disabled={saving}
              onClick={handleSubmit}
              className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Submitting...' : 'Submit Accreditation Request'}
            </button>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 text-center">
        Questions? Email{' '}
        <Link href="mailto:compliance@nexusbridgelending.com" className="underline">
          compliance@nexusbridgelending.com
        </Link>
      </p>
    </div>
  )
}
