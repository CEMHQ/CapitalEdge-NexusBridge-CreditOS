import { Button } from '@/components/ui/button'
import { formatPhone } from '@/lib/format'
import type { ApplicationData } from '@/app/(protected)/dashboard/borrower/apply/page'

type Props = {
  data: ApplicationData['profile']
  onChange: (v: Partial<ApplicationData['profile']>) => void
  onNext: () => void
}

export default function StepProfile({ data, onChange, onNext }: Props) {
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onNext()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Your Profile</h2>
        <p className="text-sm text-gray-500 mt-1">Tell us about yourself so we can get started.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Full Legal Name</label>
        <input
          type="text"
          required
          value={data.full_name}
          onChange={(e) => onChange({ full_name: e.target.value })}
          placeholder="John Smith"
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
        <input
          type="tel"
          required
          value={data.phone}
          onChange={(e) => onChange({ phone: formatPhone(e.target.value) })}
          placeholder="(555) 000-0000"
          maxLength={14}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit">Continue</Button>
      </div>
    </form>
  )
}
