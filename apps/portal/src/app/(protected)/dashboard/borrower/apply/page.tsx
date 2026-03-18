'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import StepProfile from '@/components/application/StepProfile'
import StepProperty from '@/components/application/StepProperty'
import StepLoan from '@/components/application/StepLoan'
import StepReview from '@/components/application/StepReview'

export type ApplicationData = {
  profile: {
    full_name: string
    phone: string
  }
  property: {
    address_line_1: string
    address_line_2: string
    city: string
    state: string
    postal_code: string
    property_type: string
    occupancy_type: string
    current_value: string
    arv_value: string
    purchase_price: string
  }
  loan: {
    loan_purpose: string
    requested_amount: string
    requested_term_months: string
    exit_strategy: string
  }
}

const STEPS = ['Your Profile', 'Property Details', 'Loan Scenario', 'Review & Submit']

const emptyData: ApplicationData = {
  profile: { full_name: '', phone: '' },
  property: {
    address_line_1: '', address_line_2: '', city: '', state: '',
    postal_code: '', property_type: '', occupancy_type: '',
    current_value: '', arv_value: '', purchase_price: '',
  },
  loan: {
    loan_purpose: '', requested_amount: '', requested_term_months: '', exit_strategy: '',
  },
}

export default function ApplyPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [data, setData] = useState<ApplicationData>(emptyData)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateData(section: keyof ApplicationData, values: Partial<ApplicationData[keyof ApplicationData]>) {
    setData((prev) => ({ ...prev, [section]: { ...prev[section], ...values } }))
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)

    const res = await fetch('/api/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    const json = await res.json()

    if (!res.ok) {
      setError(json.error ?? 'Something went wrong. Please try again.')
      setSubmitting(false)
      return
    }

    router.push(`/dashboard/borrower?submitted=${json.application_number}`)
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">New Loan Application</h1>
        <p className="text-sm text-gray-500 mt-1">Step {step + 1} of {STEPS.length} — {STEPS[step]}</p>
      </div>

      {/* Progress bar */}
      <div className="flex gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex-1">
            <div className={`h-1.5 rounded-full ${i <= step ? 'bg-gray-900' : 'bg-gray-200'}`} />
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        {step === 0 && (
          <StepProfile
            data={data.profile}
            onChange={(v) => updateData('profile', v)}
            onNext={() => setStep(1)}
          />
        )}
        {step === 1 && (
          <StepProperty
            data={data.property}
            onChange={(v) => updateData('property', v)}
            onBack={() => setStep(0)}
            onNext={() => setStep(2)}
          />
        )}
        {step === 2 && (
          <StepLoan
            data={data.loan}
            onChange={(v) => updateData('loan', v)}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        )}
        {step === 3 && (
          <StepReview
            data={data}
            onBack={() => setStep(2)}
            onSubmit={handleSubmit}
            submitting={submitting}
            error={error}
          />
        )}
      </div>
    </div>
  )
}
