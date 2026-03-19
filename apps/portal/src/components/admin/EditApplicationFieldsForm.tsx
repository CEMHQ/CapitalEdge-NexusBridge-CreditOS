'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Property = {
  address_line_1:  string | null
  address_line_2:  string | null
  city:            string | null
  state:           string | null
  postal_code:     string | null
  property_type:   string
  occupancy_type:  string
  current_value:   number | null
  arv_value:       number | null
  purchase_price:  number | null
}

type Props = {
  applicationId:         string
  loanPurpose:           string
  requestedAmount:       number | null
  requestedTermMonths:   number | null
  exitStrategy:          string | null
  property:              Property | null
}

const LOAN_PURPOSES   = ['bridge', 'renovation', 'contingency', 'other'] as const
const EXIT_STRATEGIES = ['sale', 'refinance', 'repayment'] as const
const PROPERTY_TYPES  = ['sfh', 'multifamily', 'condo', 'land', 'mixed_use', 'commercial'] as const
const OCCUPANCY_TYPES = ['owner_occupied', 'rental', 'vacant'] as const

const LOAN_PURPOSE_LABELS: Record<string, string> = {
  bridge: 'Bridge Loan', renovation: 'Renovation / Fix & Flip',
  contingency: 'Contingency / GAP Funding', other: 'Other',
}
const EXIT_LABELS: Record<string, string> = {
  sale: 'Sale of Property', refinance: 'Refinance', repayment: 'Cash Repayment',
}
const PROPERTY_TYPE_LABELS: Record<string, string> = {
  sfh: 'Single Family Home', multifamily: 'Multifamily (2–4 units)',
  condo: 'Condo', land: 'Land', mixed_use: 'Mixed Use', commercial: 'Commercial',
}
const OCCUPANCY_LABELS: Record<string, string> = {
  owner_occupied: 'Owner Occupied', rental: 'Rental / Investment', vacant: 'Vacant',
}

function inputClass(extra = '') {
  return `w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400 ${extra}`
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-gray-500">{label}</label>
      {children}
    </div>
  )
}

export default function EditApplicationFieldsForm({
  applicationId,
  loanPurpose,
  requestedAmount,
  requestedTermMonths,
  exitStrategy,
  property,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    loan_purpose:          loanPurpose,
    requested_amount:      requestedAmount?.toString() ?? '',
    requested_term_months: requestedTermMonths?.toString() ?? '',
    exit_strategy:         exitStrategy ?? 'sale',
    address_line_1:        property?.address_line_1 ?? '',
    address_line_2:        property?.address_line_2 ?? '',
    city:                  property?.city ?? '',
    state:                 property?.state ?? '',
    postal_code:           property?.postal_code ?? '',
    property_type:         property?.property_type ?? 'sfh',
    occupancy_type:        property?.occupancy_type ?? 'owner_occupied',
    current_value:         property?.current_value?.toString() ?? '',
    arv_value:             property?.arv_value?.toString() ?? '',
    purchase_price:        property?.purchase_price?.toString() ?? '',
  })

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/applications/${applicationId}/fields`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loan_purpose:          form.loan_purpose,
          requested_amount:      form.requested_amount,
          requested_term_months: form.requested_term_months,
          exit_strategy:         form.exit_strategy,
          property: {
            address_line_1: form.address_line_1,
            address_line_2: form.address_line_2 || undefined,
            city:           form.city,
            state:          form.state,
            postal_code:    form.postal_code,
            property_type:  form.property_type,
            occupancy_type: form.occupancy_type,
            current_value:  form.current_value || undefined,
            arv_value:      form.arv_value || undefined,
            purchase_price: form.purchase_price || undefined,
          },
        }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Save failed')
        setSaving(false)
        return
      }
      setOpen(false)
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-gray-500 hover:text-gray-800 underline"
      >
        Edit Details
      </button>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Edit Application Details</h2>
        <button onClick={() => setOpen(false)} className="text-xs text-gray-400 hover:text-gray-700">Cancel</button>
      </div>

      {/* Loan Fields */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Loan</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Loan Purpose">
            <select value={form.loan_purpose} onChange={(e) => set('loan_purpose', e.target.value)} className={inputClass()}>
              {LOAN_PURPOSES.map((p) => <option key={p} value={p}>{LOAN_PURPOSE_LABELS[p]}</option>)}
            </select>
          </Field>
          <Field label="Requested Amount ($)">
            <input
              type="number" min={25000} max={10000000}
              value={form.requested_amount}
              onChange={(e) => set('requested_amount', e.target.value)}
              className={inputClass()}
            />
          </Field>
          <Field label="Term (months)">
            <input
              type="number" min={1} max={360}
              value={form.requested_term_months}
              onChange={(e) => set('requested_term_months', e.target.value)}
              className={inputClass()}
            />
          </Field>
          <Field label="Exit Strategy">
            <select value={form.exit_strategy} onChange={(e) => set('exit_strategy', e.target.value)} className={inputClass()}>
              {EXIT_STRATEGIES.map((s) => <option key={s} value={s}>{EXIT_LABELS[s]}</option>)}
            </select>
          </Field>
        </div>
      </div>

      {/* Property Fields */}
      {property && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Property</p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Address Line 1">
              <input type="text" value={form.address_line_1} onChange={(e) => set('address_line_1', e.target.value)} className={inputClass('col-span-2')} />
            </Field>
            <Field label="Address Line 2">
              <input type="text" value={form.address_line_2} onChange={(e) => set('address_line_2', e.target.value)} className={inputClass()} />
            </Field>
            <Field label="City">
              <input type="text" value={form.city} onChange={(e) => set('city', e.target.value)} className={inputClass()} />
            </Field>
            <Field label="State (2-letter)">
              <input type="text" maxLength={2} value={form.state} onChange={(e) => set('state', e.target.value.toUpperCase())} className={inputClass()} />
            </Field>
            <Field label="ZIP Code">
              <input type="text" value={form.postal_code} onChange={(e) => set('postal_code', e.target.value)} className={inputClass()} />
            </Field>
            <Field label="Property Type">
              <select value={form.property_type} onChange={(e) => set('property_type', e.target.value)} className={inputClass()}>
                {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{PROPERTY_TYPE_LABELS[t]}</option>)}
              </select>
            </Field>
            <Field label="Occupancy">
              <select value={form.occupancy_type} onChange={(e) => set('occupancy_type', e.target.value)} className={inputClass()}>
                {OCCUPANCY_TYPES.map((t) => <option key={t} value={t}>{OCCUPANCY_LABELS[t]}</option>)}
              </select>
            </Field>
            <Field label="Current Value ($)">
              <input type="number" min={0} value={form.current_value} onChange={(e) => set('current_value', e.target.value)} className={inputClass()} />
            </Field>
            <Field label="ARV ($)">
              <input type="number" min={0} value={form.arv_value} onChange={(e) => set('arv_value', e.target.value)} className={inputClass()} />
            </Field>
            <Field label="Purchase Price ($)">
              <input type="number" min={0} value={form.purchase_price} onChange={(e) => set('purchase_price', e.target.value)} className={inputClass()} />
            </Field>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
        <button
          onClick={() => setOpen(false)}
          disabled={saving}
          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
