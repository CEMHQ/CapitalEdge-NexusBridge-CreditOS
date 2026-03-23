'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

// ─── Constants ────────────────────────────────────────────────────────────────

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

const INCOME_OPTIONS = [
  { label: 'Less than $50,000',   value: 30_000  },
  { label: '$50,000 – $100,000',  value: 75_000  },
  { label: '$100,000 – $200,000', value: 150_000 },
  { label: '$200,000 – $500,000', value: 350_000 },
  { label: 'More than $500,000',  value: 750_000 },
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
  { code: 'PR', name: 'Puerto Rico' },      { code: 'GU', name: 'Guam' },
  { code: 'VI', name: 'U.S. Virgin Islands' }, { code: 'AS', name: 'American Samoa' },
  { code: 'MP', name: 'Northern Mariana Islands' },
]

// ─── Types ─────────────────────────────────────────────────────────────────────

type Path = 'unknown' | 'reg_a' | 'reg_d'

// Logical steps are path-dependent. We track a single numeric step and the
// chosen path. Progress bar renders dynamically based on path.
type Step = 1 | 2 | 3 | 4

// Step labels per path
const STEP_LABELS: Record<Path, string[]> = {
  unknown: ['Investor Profile', 'Investment Path'],
  reg_a:   ['Investor Profile', 'Investment Path', 'Suitability'],
  reg_d:   ['Investor Profile', 'Investment Path', 'Accreditation', 'Verification'],
}

// ─── Reg A limit preview (pure calc — mirrors lib/compliance/reg-a.ts) ─────────

function previewRegALimit(annualIncome: number, netWorth: number): number {
  const fromIncome   = annualIncome * 0.10
  const fromNetWorth = netWorth     * 0.10
  return Math.max(fromIncome, fromNetWorth, 2500)
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InvestorOnboardingPage() {
  const router = useRouter()
  const [step,  setStep]  = useState<Step>(1)
  const [path,  setPath]  = useState<Path>('unknown')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  // Step 1
  const [investorType, setInvestorType] = useState('individual')

  // Step 2 (path fork)
  const [pathChoice, setPathChoice] = useState<'reg_a' | 'reg_d' | ''>('')

  // Step 3 — Reg A suitability
  const [annualIncome,    setAnnualIncome]    = useState<string>('')
  const [netWorth,        setNetWorth]        = useState<string>('')
  const [jurisdiction,    setJurisdiction]    = useState<string>('')
  const [regAConfirmed,   setRegAConfirmed]   = useState(false)

  // Step 3 — Reg D accreditation
  const [selfDeclared, setSelfDeclared] = useState(false)

  // Step 4 — Reg D verification
  const [method, setMethod] = useState('third_party_letter')
  const [notes,  setNotes]  = useState('')

  // Derived Reg A limit preview
  const regAPreview = annualIncome && netWorth
    ? previewRegALimit(Number(annualIncome), Number(netWorth))
    : null

  // ── Step navigation ────────────────────────────────────────────────────────

  function advanceToStep2() { setStep(2) }

  function advanceToStep3() {
    if (!pathChoice) return
    setPath(pathChoice)
    setStep(3)
  }

  // ── Submit handlers ────────────────────────────────────────────────────────

  async function handleSubmitRegA() {
    setError(null)
    setSaving(true)
    try {
      const res = await fetch('/api/investor/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          investor_type: investorType,
          annual_income: Number(annualIncome),
          net_worth:     Number(netWorth),
          jurisdiction,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError((d as { error?: string }).error ?? 'Submission failed')
        return
      }
      router.push('/dashboard/investor/offerings')
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmitRegD() {
    setError(null)
    setSaving(true)
    try {
      await fetch('/api/investor/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ investor_type: investorType }),
      })
      const res = await fetch('/api/compliance/accreditation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verification_method: method, notes: notes || undefined }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Submission failed')
        return
      }
      router.push('/dashboard/investor/compliance')
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // ── Progress bar ───────────────────────────────────────────────────────────

  const stepLabels = STEP_LABELS[path]
  const totalSteps = stepLabels.length

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl space-y-8">

      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Investor Onboarding</h1>
        <p className="text-sm text-gray-500 mt-1">
          {path === 'reg_a'
            ? 'Complete your suitability profile to unlock Reg A investment opportunities'
            : path === 'reg_d'
            ? 'Complete all steps to unlock access to NexusBridge Capital LP'
            : 'Set up your investor account'}
        </p>
      </div>

      {/* Progress indicator */}
      <div className="flex flex-wrap items-center gap-2">
        {stepLabels.map((label, idx) => {
          const s = idx + 1
          const isDone    = step > s
          const isCurrent = step === s
          return (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                isDone    ? 'bg-green-500 text-white' :
                isCurrent ? 'bg-indigo-600 text-white' :
                            'bg-gray-200 text-gray-500'
              }`}>
                {isDone ? '✓' : s}
              </div>
              {s < totalSteps && (
                <div className={`h-px w-8 sm:w-12 ${isDone ? 'bg-green-400' : 'bg-gray-200'}`} />
              )}
            </div>
          )
        })}
        <span className="ml-1 sm:ml-3 text-sm text-gray-500">{stepLabels[step - 1]}</span>
      </div>

      {/* ── Step 1: Investor Profile ─────────────────────────────────────────── */}
      {step === 1 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <h2 className="text-base font-semibold text-gray-900">Investor Profile</h2>
          <p className="text-sm text-gray-500">
            Tell us how you are investing. This determines the verification documents required.
          </p>

          <div className="space-y-3">
            {[
              { value: 'individual', label: 'Individual',                    desc: 'Personal account — income and net worth are evaluated individually.' },
              { value: 'joint',      label: 'Joint / Spousal',               desc: 'Joint account — combined income and net worth apply.' },
              { value: 'entity',     label: 'Entity (LLC, Trust, Corp.)',    desc: 'Investing through a legal entity.' },
              { value: 'ira',        label: 'IRA / Retirement Account',      desc: 'Self-directed IRA or similar retirement vehicle.' },
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
              onClick={advanceToStep2}
              className="w-full sm:w-auto px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Investment Path Fork ─────────────────────────────────────── */}
      {step === 2 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <h2 className="text-base font-semibold text-gray-900">Choose Your Investment Path</h2>
          <p className="text-sm text-gray-500">
            NexusBridge offers two investment tracks. Your eligibility depends on whether you
            qualify as an accredited investor under SEC rules.
          </p>

          <div className="space-y-3">
            <label className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
              pathChoice === 'reg_a' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'
            }`}>
              <input
                type="radio"
                name="pathChoice"
                value="reg_a"
                checked={pathChoice === 'reg_a'}
                onChange={() => setPathChoice('reg_a')}
                className="mt-0.5 accent-indigo-600"
              />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-gray-900">Reg A Tier 2 — Open to All Investors</p>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-medium">Reg A</span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Available to all US investors. Non-accredited investors may invest up to 10% of
                  the greater of annual income or net worth per rolling 12 months (minimum $2,500).
                  No independent accreditation verification required.
                </p>
              </div>
            </label>

            <label className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
              pathChoice === 'reg_d' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'
            }`}>
              <input
                type="radio"
                name="pathChoice"
                value="reg_d"
                checked={pathChoice === 'reg_d'}
                onChange={() => setPathChoice('reg_d')}
                className="mt-0.5 accent-indigo-600"
              />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-gray-900">Reg D 506(c) — Accredited Investors Only</p>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 font-medium">Reg D</span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Requires verified accredited investor status (income &gt; $200K/$300K joint, or net
                  worth &gt; $1M excl. primary residence, or active FINRA license). No annual
                  investment limit. Accreditation must be independently verified.
                </p>
              </div>
            </label>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-3 pt-2">
            <button onClick={() => setStep(1)} className="text-sm text-gray-500 hover:text-gray-700 text-left">Back</button>
            <button
              disabled={!pathChoice}
              onClick={advanceToStep3}
              className="w-full sm:w-auto px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3 — Reg A: Suitability ──────────────────────────────────────── */}
      {step === 3 && path === 'reg_a' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <h2 className="text-base font-semibold text-gray-900">Investment Suitability</h2>
          <p className="text-sm text-gray-500">
            Under SEC Regulation A Tier 2, non-accredited investors may invest up to 10% of the
            greater of annual income or net worth per rolling 12-month period (minimum $2,500).
            Your answers below are self-certified and determine your personal investment limit.
          </p>

          {/* Annual Income */}
          <div>
            <label htmlFor="onb-annual-income" className="block text-xs font-medium text-gray-700 mb-1.5">
              Annual Income
            </label>
            <select
              id="onb-annual-income"
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
            <label htmlFor="onb-net-worth" className="block text-xs font-medium text-gray-700 mb-1.5">
              Net Worth <span className="font-normal text-gray-400">(excluding primary residence)</span>
            </label>
            <select
              id="onb-net-worth"
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
            <label htmlFor="onb-jurisdiction" className="block text-xs font-medium text-gray-700 mb-1.5">
              State / Territory of Residence
            </label>
            <select
              id="onb-jurisdiction"
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

          {/* Live limit preview */}
          {regAPreview !== null && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
              <p className="text-xs font-semibold text-indigo-800 mb-0.5">Your estimated annual investment limit</p>
              <p className="text-2xl font-bold text-indigo-700">${regAPreview.toLocaleString()}</p>
              <p className="text-xs text-indigo-600 mt-1">
                = 10% of the greater of your income or net worth, subject to the SEC $2,500 minimum.
                This is a self-certified estimate; your actual limit will be recalculated at subscription.
              </p>
            </div>
          )}

          {/* Certification */}
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={regAConfirmed}
              onChange={e => setRegAConfirmed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
            />
            <span className="text-xs text-gray-600 leading-relaxed">
              I certify that the information above is accurate to the best of my knowledge. I understand
              that NexusBridge relies on this self-certification to determine my Reg A Tier 2 investment
              eligibility under SEC Rule 251(d)(2)(C).
            </span>
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-3 pt-2">
            <button onClick={() => setStep(2)} className="text-sm text-gray-500 hover:text-gray-700 text-left">Back</button>
            <button
              disabled={!annualIncome || !netWorth || !jurisdiction || !regAConfirmed || saving}
              onClick={handleSubmitRegA}
              className="w-full sm:w-auto px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
            >
              {saving ? 'Saving…' : 'Complete Profile & View Offerings'}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3 — Reg D: Accreditation Disclosure ─────────────────────────── */}
      {step === 3 && path === 'reg_d' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <h2 className="text-base font-semibold text-gray-900">Accreditation Disclosure</h2>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-amber-800">Reg D 506(c) — Accredited Investors Only</p>
            <p className="text-sm text-amber-700 mt-1">
              NexusBridge Capital LP is offered exclusively to accredited investors under SEC Rule 506(c).
              Under this exemption, <strong>your status as an accredited investor must be independently verified</strong> —
              self-certification alone is not sufficient.
            </p>
          </div>

          <p className="text-sm text-gray-600">An accredited investor meets ONE of the following criteria:</p>

          <ul className="space-y-2 text-sm text-gray-700">
            <li className="flex gap-2"><span className="text-indigo-500 font-bold shrink-0">·</span>Annual income exceeding $200,000 (or $300,000 joint) for the past two years, with reasonable expectation of the same this year</li>
            <li className="flex gap-2"><span className="text-indigo-500 font-bold shrink-0">·</span>Net worth exceeding $1,000,000 individually or jointly, excluding primary residence</li>
            <li className="flex gap-2"><span className="text-indigo-500 font-bold shrink-0">·</span>Holder of an active FINRA Series 7, 65, or 82 license</li>
            <li className="flex gap-2"><span className="text-indigo-500 font-bold shrink-0">·</span>Entity with total assets exceeding $5,000,000 and not formed for the purpose of acquiring these securities</li>
          </ul>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={selfDeclared}
              onChange={(e) => setSelfDeclared(e.target.checked)}
              className="mt-0.5 accent-indigo-600"
            />
            <span className="text-sm text-gray-700">
              I confirm that I qualify as an accredited investor under the criteria above, and I understand
              that I will be required to provide documentation to verify my status.
            </span>
          </label>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-3 pt-2">
            <button onClick={() => setStep(2)} className="text-sm text-gray-500 hover:text-gray-700 text-left">Back</button>
            <button
              disabled={!selfDeclared}
              onClick={() => setStep(4)}
              className="w-full sm:w-auto px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* ── Step 4 — Reg D: Verification Method ──────────────────────────────── */}
      {step === 4 && path === 'reg_d' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <h2 className="text-base font-semibold text-gray-900">Select Verification Method</h2>
          <p className="text-sm text-gray-500">
            Choose how you will verify your accredited investor status. Our compliance team will
            review your submission and may request additional documentation.
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
              placeholder="Any additional context for the compliance team…"
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

          <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-3 pt-2">
            <button onClick={() => setStep(3)} className="text-sm text-gray-500 hover:text-gray-700 text-left">Back</button>
            <button
              disabled={saving}
              onClick={handleSubmitRegD}
              className="w-full sm:w-auto px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Submitting…' : 'Submit Accreditation Request'}
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
