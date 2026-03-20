'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  promissory_note:        'Promissory Note',
  deed_of_trust:          'Deed of Trust',
  loan_agreement:         'Loan Agreement',
  subscription_agreement: 'Subscription Agreement',
}

interface SignerForm {
  name: string
  email: string
  role: string
}

export default function SendForSignatureButton({
  entityType,
  entityId,
  availableDocTypes,
}: {
  entityType: 'application' | 'subscription'
  entityId: string
  availableDocTypes: string[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [docType, setDocType] = useState(availableDocTypes[0] ?? '')
  const [message, setMessage] = useState('')
  const [signers, setSigners] = useState<SignerForm[]>([
    { name: '', email: '', role: 'Borrower' },
  ])

  function addSigner() {
    if (signers.length < 5) {
      setSigners((prev) => [...prev, { name: '', email: '', role: '' }])
    }
  }

  function removeSigner(i: number) {
    setSigners((prev) => prev.filter((_, idx) => idx !== i))
  }

  function updateSigner(i: number, field: keyof SignerForm, value: string) {
    setSigners((prev) => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s))
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)

    const res = await fetch('/api/signatures/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entity_type:   entityType,
        entity_id:     entityId,
        document_type: docType,
        signers,
        message: message || undefined,
      }),
    })

    const data = await res.json()
    setSaving(false)

    if (!res.ok) {
      setError(data.error ?? 'Failed to send signature request')
      return
    }

    setOpen(false)
    router.refresh()
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
      >
        Send for Signature
      </button>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Send for Signature</h3>
        <button onClick={() => setOpen(false)} className="text-sm text-gray-400 hover:text-gray-600">Cancel</button>
      </div>

      <form onSubmit={handleSend} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Document Type</label>
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {availableDocTypes.map((dt) => (
              <option key={dt} value={dt}>{DOCUMENT_TYPE_LABELS[dt] ?? dt}</option>
            ))}
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-gray-700">Signers</label>
            {signers.length < 5 && (
              <button type="button" onClick={addSigner} className="text-xs text-indigo-600 hover:text-indigo-800">
                + Add signer
              </button>
            )}
          </div>
          <div className="space-y-2">
            {signers.map((signer, i) => (
              <div key={i} className="grid grid-cols-3 gap-2 items-center">
                <input
                  required
                  placeholder="Full name"
                  value={signer.name}
                  onChange={(e) => updateSigner(i, 'name', e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <input
                  required
                  type="email"
                  placeholder="Email"
                  value={signer.email}
                  onChange={(e) => updateSigner(i, 'email', e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <div className="flex gap-1">
                  <input
                    required
                    placeholder="Role"
                    value={signer.role}
                    onChange={(e) => updateSigner(i, 'role', e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  {signers.length > 1 && (
                    <button type="button" onClick={() => removeSigner(i)} className="text-red-400 hover:text-red-600 text-xs px-1">
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Message to signers (optional)</label>
          <textarea
            rows={2}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Please review and sign the attached document."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => setOpen(false)} className="text-sm text-gray-500 hover:text-gray-700">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Sending...' : 'Send for Signature'}
          </button>
        </div>
      </form>
    </div>
  )
}
