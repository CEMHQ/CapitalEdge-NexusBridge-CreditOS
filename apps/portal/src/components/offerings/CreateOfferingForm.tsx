'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'

interface Props {
  funds: { id: string; fund_name: string }[]
}

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','PR','GU','VI','AS','MP',
]

export default function CreateOfferingForm({ funds }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    fund_id:              '',
    offering_type:        'reg_a' as 'reg_a' | 'reg_d' | 'reg_cf',
    title:                '',
    description:          '',
    max_offering_amount:  '',
    min_investment:       '2500',
    sec_file_number:      '',
    offering_open_date:   '',
    offering_close_date:  '',
    // Jurisdiction restrictions as a toggle list
    restricted_states:    [] as string[],
  })

  function toggleState(code: string) {
    setForm(f => ({
      ...f,
      restricted_states: f.restricted_states.includes(code)
        ? f.restricted_states.filter(s => s !== code)
        : [...f.restricted_states, code],
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const body = {
      fund_id:                  form.fund_id,
      offering_type:            form.offering_type,
      title:                    form.title,
      description:              form.description || undefined,
      max_offering_amount:      parseFloat(form.max_offering_amount),
      min_investment:           parseFloat(form.min_investment) || 2500,
      sec_file_number:          form.sec_file_number || undefined,
      offering_open_date:       form.offering_open_date || undefined,
      offering_close_date:      form.offering_close_date || undefined,
      jurisdiction_restrictions: form.restricted_states,
    }

    const res = await fetch('/api/admin/offerings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error ?? 'Failed to create offering')
      return
    }

    setOpen(false)
    setForm({
      fund_id: '', offering_type: 'reg_a', title: '', description: '',
      max_offering_amount: '', min_investment: '2500',
      sec_file_number: '', offering_open_date: '', offering_close_date: '',
      restricted_states: [],
    })
    router.refresh()
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
      >
        <Plus size={15} />
        New Offering
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">New Offering</h2>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              {/* Fund */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Fund *</label>
                <select
                  required
                  value={form.fund_id}
                  onChange={e => setForm(f => ({ ...f, fund_id: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="">Select a fund…</option>
                  {funds.map(f => (
                    <option key={f.id} value={f.id}>{f.fund_name}</option>
                  ))}
                </select>
              </div>

              {/* Type + Title */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Offering Type *</label>
                  <select
                    value={form.offering_type}
                    onChange={e => setForm(f => ({ ...f, offering_type: e.target.value as typeof form.offering_type }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  >
                    <option value="reg_a">Reg A Tier 2</option>
                    <option value="reg_d">Reg D 506(c)</option>
                    <option value="reg_cf">Reg CF</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Title *</label>
                  <input
                    required
                    type="text"
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="NexusBridge Capital LP Series A"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
              </div>

              {/* Financial terms */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Max Offering Amount ($) *</label>
                  <input
                    required
                    type="number"
                    min="1"
                    step="0.01"
                    value={form.max_offering_amount}
                    onChange={e => setForm(f => ({ ...f, max_offering_amount: e.target.value }))}
                    placeholder="75000000"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Min Investment ($)</label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={form.min_investment}
                    onChange={e => setForm(f => ({ ...f, min_investment: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
              </div>

              {/* SEC Filing */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">SEC File Number</label>
                  <input
                    type="text"
                    value={form.sec_file_number}
                    onChange={e => setForm(f => ({ ...f, sec_file_number: e.target.value }))}
                    placeholder="024-12345"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Opens</label>
                  <input
                    type="date"
                    value={form.offering_open_date}
                    onChange={e => setForm(f => ({ ...f, offering_open_date: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Closes</label>
                  <input
                    type="date"
                    value={form.offering_close_date}
                    onChange={e => setForm(f => ({ ...f, offering_close_date: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Brief description shown to investors…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
                />
              </div>

              {/* Jurisdiction restrictions */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Restricted States
                  <span className="text-gray-400 font-normal ml-1">(offering not available in selected states)</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {US_STATES.map(code => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => toggleState(code)}
                      className={[
                        'text-xs px-2 py-0.5 rounded border font-medium transition-colors',
                        form.restricted_states.includes(code)
                          ? 'bg-red-600 border-red-600 text-white'
                          : 'border-gray-200 text-gray-600 hover:border-gray-400',
                      ].join(' ')}
                    >
                      {code}
                    </button>
                  ))}
                </div>
                {form.restricted_states.length > 0 && (
                  <p className="text-xs text-red-600 mt-1">
                    Restricted in: {form.restricted_states.join(', ')}
                  </p>
                )}
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Creating…' : 'Create Offering'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
