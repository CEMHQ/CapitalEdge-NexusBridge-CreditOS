'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

const ROLES = [
  { value: 'investor', label: 'Investor' },
  { value: 'underwriter', label: 'Underwriter' },
  { value: 'servicing', label: 'Servicing' },
  { value: 'manager', label: 'Manager' },
  { value: 'admin', label: 'Admin' },
]

type InviteStatus = { email: string; success: boolean; error?: string }

export default function InvitePage() {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('investor')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<InviteStatus[]>([])

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const res = await fetch('/api/auth/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role }),
    })

    const json = await res.json()

    setResults((prev) => [
      { email, success: res.ok, error: json.error },
      ...prev,
    ])

    if (res.ok) setEmail('')
    setLoading(false)
  }

  return (
    <div className="space-y-8 max-w-xl">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Invite User</h1>
        <p className="text-sm text-gray-500 mt-1">
          Send an invitation email. The recipient will set their own password on first login.
        </p>
      </div>

      <form onSubmit={handleInvite} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="investor@example.com"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1">
            Borrowers sign up publicly — only use this for investors and internal staff.
          </p>
        </div>

        <Button type="submit" disabled={loading} className="w-full">
          {loading ? 'Sending invite...' : 'Send Invitation'}
        </Button>
      </form>

      {/* Invite history for this session */}
      {results.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700">Sent this session</h2>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {results.map((r, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{r.email}</p>
                  {r.error && <p className="text-xs text-red-500 mt-0.5">{r.error}</p>}
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                  r.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                }`}>
                  {r.success ? 'Invited' : 'Failed'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
