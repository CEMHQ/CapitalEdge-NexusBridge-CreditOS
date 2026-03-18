import { Button } from '@/components/ui/button'
import { formatCurrencyInput, parseCurrencyInput } from '@/lib/format'
import type { ApplicationData } from '@/app/(protected)/dashboard/borrower/apply/page'

type Props = {
  data: ApplicationData['property']
  onChange: (v: Partial<ApplicationData['property']>) => void
  onBack: () => void
  onNext: () => void
}

const PROPERTY_TYPES = [
  { value: 'sfh', label: 'Single Family Home' },
  { value: 'multifamily', label: 'Multifamily (2–4 units)' },
  { value: 'condo', label: 'Condo' },
  { value: 'land', label: 'Land' },
  { value: 'mixed_use', label: 'Mixed Use' },
  { value: 'commercial', label: 'Commercial' },
]

const OCCUPANCY_TYPES = [
  { value: 'owner_occupied', label: 'Owner Occupied' },
  { value: 'rental', label: 'Rental / Investment' },
  { value: 'vacant', label: 'Vacant' },
]

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
]

function CurrencyInput({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string
  value: string
  onChange: (raw: string) => void
  placeholder?: string
  required?: boolean
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
        <input
          type="text"
          inputMode="numeric"
          required={required}
          value={value ? formatCurrencyInput(value) : ''}
          onChange={(e) => onChange(parseCurrencyInput(e.target.value))}
          placeholder={placeholder}
          className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>
    </div>
  )
}

export default function StepProperty({ data, onChange, onBack, onNext }: Props) {
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onNext()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Property Details</h2>
        <p className="text-sm text-gray-500 mt-1">Tell us about the collateral property.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Street Address</label>
        <input
          type="text"
          required
          value={data.address_line_1}
          onChange={(e) => onChange({ address_line_1: e.target.value })}
          placeholder="123 Main St"
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Suite / Unit (optional)</label>
        <input
          type="text"
          value={data.address_line_2}
          onChange={(e) => onChange({ address_line_2: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
          <input
            type="text"
            required
            value={data.city}
            onChange={(e) => onChange({ city: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
          <select
            required
            value={data.state}
            onChange={(e) => onChange({ state: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            <option value="">—</option>
            {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">ZIP Code</label>
          <input
            type="text"
            required
            maxLength={5}
            value={data.postal_code}
            onChange={(e) => onChange({ postal_code: e.target.value.replace(/\D/g, '') })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Property Type</label>
          <select
            required
            value={data.property_type}
            onChange={(e) => onChange({ property_type: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            <option value="">Select type</option>
            {PROPERTY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Occupancy</label>
          <select
            required
            value={data.occupancy_type}
            onChange={(e) => onChange({ occupancy_type: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            <option value="">Select occupancy</option>
            {OCCUPANCY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <CurrencyInput
          label="Current Value"
          value={data.current_value}
          onChange={(v) => onChange({ current_value: v })}
          placeholder="Optional"
        />
        <CurrencyInput
          label="ARV"
          value={data.arv_value}
          onChange={(v) => onChange({ arv_value: v })}
          placeholder="After repair value"
        />
        <CurrencyInput
          label="Purchase Price"
          value={data.purchase_price}
          onChange={(v) => onChange({ purchase_price: v })}
          placeholder="Optional"
        />
      </div>

      <div className="flex justify-between pt-2">
        <Button type="button" variant="outline" onClick={onBack}>Back</Button>
        <Button type="submit">Continue</Button>
      </div>
    </form>
  )
}
