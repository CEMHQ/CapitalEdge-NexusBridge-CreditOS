'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  investorId: string
  accreditationStatus: string
  kycStatus: string
  onboardingStatus: string
}

const ACCREDITATION_OPTIONS = ['pending', 'verified', 'expired'] as const
const KYC_OPTIONS = ['not_started', 'in_progress', 'approved', 'failed'] as const
const ONBOARDING_OPTIONS = ['pending', 'in_progress', 'complete'] as const

function label(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function EditInvestorStatusButton({
  investorId,
  accreditationStatus,
  kycStatus,
  onboardingStatus,
}: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [accreditation, setAccreditation] = useState(accreditationStatus)
  const [kyc, setKyc] = useState(kycStatus)
  const [onboarding, setOnboarding] = useState(onboardingStatus)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/investors/${investorId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accreditation_status: accreditation,
          kyc_status: kyc,
          onboarding_status: onboarding,
        }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Save failed')
        setSaving(false)
        return
      }
      setEditing(false)
      router.refresh()
    } catch {
      setError('Network error')
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-xs text-gray-500 hover:text-gray-800 font-medium underline"
      >
        Edit
      </button>
    )
  }

  return (
    <div className="space-y-2 min-w-[220px]">
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 w-24">Accreditation</span>
        <select
          value={accreditation}
          onChange={(e) => setAccreditation(e.target.value)}
          disabled={saving}
          className="text-xs border border-gray-300 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-gray-400 flex-1"
        >
          {ACCREDITATION_OPTIONS.map((o) => (
            <option key={o} value={o}>{label(o)}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 w-24">KYC</span>
        <select
          value={kyc}
          onChange={(e) => setKyc(e.target.value)}
          disabled={saving}
          className="text-xs border border-gray-300 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-gray-400 flex-1"
        >
          {KYC_OPTIONS.map((o) => (
            <option key={o} value={o}>{label(o)}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 w-24">Onboarding</span>
        <select
          value={onboarding}
          onChange={(e) => setOnboarding(e.target.value)}
          disabled={saving}
          className="text-xs border border-gray-300 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-gray-400 flex-1"
        >
          {ONBOARDING_OPTIONS.map((o) => (
            <option key={o} value={o}>{label(o)}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2 pt-0.5">
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-xs text-green-700 hover:text-green-900 font-medium disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={() => { setEditing(false); setError(null) }}
          disabled={saving}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          Cancel
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  )
}
