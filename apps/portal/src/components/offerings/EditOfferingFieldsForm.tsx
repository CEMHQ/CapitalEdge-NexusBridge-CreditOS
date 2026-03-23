'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, X } from 'lucide-react'

interface Props {
  offeringId: string
  current: {
    title: string
    description: string | null
    max_offering_amount: number
    min_investment: number
    max_investment: number | null
    per_share_price: number | null
    shares_offered: number | null
    sec_file_number: string | null
    qualification_date: string | null
    offering_open_date: string | null
    offering_close_date: string | null
    jurisdiction_restrictions: string[]
  }
}

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','PR','GU','VI','AS','MP',
]

export default function EditOfferingFieldsForm({ offeringId, current }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    title:                    current.title,
    description:              current.description ?? '',
    max_offering_amount:      String(current.max_offering_amount),
    min_investment:           String(current.min_investment),
    max_investment:           current.max_investment != null ? String(current.max_investment) : '',
    per_share_price:          current.per_share_price != null ? String(current.per_share_price) : '',
    shares_offered:           current.shares_offered != null ? String(current.shares_offered) : '',
    sec_file_number:          current.sec_file_number ?? '',
    qualification_date:       current.qualification_date ?? '',
    offering_open_date:       current.offering_open_date ?? '',
    offering_close_date:      current.offering_close_date ?? '',
    restricted_states:        Array.isArray(current.jurisdiction_restrictions)
                                ? [...current.jurisdiction_restrictions]
                                : [] as string[],
  })

  function toggleState(code: string) {
    setForm(f => ({
      ...f,
      restricted_states: f.restricted_states.includes(code)
        ? f.restricted_states.filter(s => s !== code)
        : [...f.restricted_states, code],
    }))
  }

  function handleOpen() {
    // Reset to current values each time the dialog is opened
    setForm({
      title:                    current.title,
      description:              current.description ?? '',
      max_offering_amount:      String(current.max_offering_amount),
      min_investment:           String(current.min_investment),
      max_investment:           current.max_investment != null ? String(current.max_investment) : '',
      per_share_price:          current.per_share_price != null ? String(current.per_share_price) : '',
      shares_offered:           current.shares_offered != null ? String(current.shares_offered) : '',
      sec_file_number:          current.sec_file_number ?? '',
      qualification_date:       current.qualification_date ?? '',
      offering_open_date:       current.offering_open_date ?? '',
      offering_close_date:      current.offering_close_date ?? '',
      restricted_states:        Array.isArray(current.jurisdiction_restrictions)
                                  ? [...current.jurisdiction_restrictions]
                                  : [],
    })
    setError(null)
    setOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const body: Record<string, unknown> = {
      title:                     form.title,
      description:               form.description || null,
      max_offering_amount:       parseFloat(form.max_offering_amount),
      min_investment:            parseFloat(form.min_investment),
      max_investment:            form.max_investment ? parseFloat(form.max_investment) : null,
      per_share_price:           form.per_share_price ? parseFloat(form.per_share_price) : null,
      shares_offered:            form.shares_offered ? parseInt(form.shares_offered, 10) : null,
      sec_file_number:           form.sec_file_number || null,
      qualification_date:        form.qualification_date || null,
      offering_open_date:        form.offering_open_date || null,
      offering_close_date:       form.offering_close_date || null,
      jurisdiction_restrictions: form.restricted_states,
    }

    const res = await fetch(`/api/admin/offerings/${offeringId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error ?? 'Failed to update offering')
      return
    }

    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <button
        onClick={handleOpen}
        title="Edit offering details"
        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 font-medium transition-colors px-2 py-1 rounded hover:bg-gray-100"
      >
        <Pencil size={12} />
        Edit Fields
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Edit Offering Fields</h2>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

              {/* Title */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Title *</label>
                <input
                  required
                  type="text"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
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
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Min Investment ($) *</label>
                  <input
                    required
                    type="number"
                    min="1"
                    step="0.01"
                    value={form.min_investment}
                    onChange={e => setForm(f => ({ ...f, min_investment: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Max Investment ($)</label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={form.max_investment}
                    onChange={e => setForm(f => ({ ...f, max_investment: e.target.value }))}
                    placeholder="No limit"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Price per Unit ($)</label>
                  <input
                    type="number"
                    min="0.0001"
                    step="0.0001"
                    value={form.per_share_price}
                    onChange={e => setForm(f => ({ ...f, per_share_price: e.target.value }))}
                    placeholder="—"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Units Offered</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={form.shares_offered}
                    onChange={e => setForm(f => ({ ...f, shares_offered: e.target.value }))}
                    placeholder="—"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
              </div>

              {/* SEC Filing */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
                  <label className="block text-xs font-medium text-gray-700 mb-1">Qualification Date</label>
                  <input
                    type="date"
                    value={form.qualification_date}
                    onChange={e => setForm(f => ({ ...f, qualification_date: e.target.value }))}
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
                  {loading ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
