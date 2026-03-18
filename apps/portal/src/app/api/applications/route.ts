import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendApplicationSubmittedEmail } from '@/lib/email'
import { validateBody } from '@/lib/validation/validate'
import { createApplicationSchema } from '@/lib/validation/schemas'
import { submitApplicationLimiter } from '@/lib/rate-limit/index'
import { applyRateLimit } from '@/lib/rate-limit/apply'

function generateApplicationNumber(): string {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const random = Math.floor(Math.random() * 90000) + 10000
  return `NB-${year}${month}${day}-${random}`
}

export async function POST(request: Request) {
  const validation = await validateBody(request, createApplicationSchema)
  if (!validation.success) return validation.response

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const blocked = await applyRateLimit(submitApplicationLimiter, user.id)
  if (blocked) return blocked

  const { profile, property, loan } = validation.data

  // 1. Upsert profile
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({
      id: user.id,
      email: user.email,
      full_name: profile.full_name,
      phone: profile.phone,
      status: 'active',
      updated_at: new Date().toISOString(),
    })

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  // 2. Get or create borrower record
  let borrower_id: string

  const { data: existingBorrower } = await supabase
    .from('borrowers')
    .select('id')
    .eq('profile_id', user.id)
    .single()

  if (existingBorrower) {
    borrower_id = existingBorrower.id
  } else {
    const { data: newBorrower, error: borrowerError } = await supabase
      .from('borrowers')
      .insert({ profile_id: user.id })
      .select('id')
      .single()

    if (borrowerError || !newBorrower) {
      return NextResponse.json({ error: borrowerError?.message ?? 'Failed to create borrower' }, { status: 500 })
    }

    borrower_id = newBorrower.id
  }

  // 3. Create application
  const { data: application, error: appError } = await supabase
    .from('applications')
    .insert({
      borrower_id,
      application_number: generateApplicationNumber(),
      loan_purpose: loan.loan_purpose,
      requested_amount: loan.requested_amount,
      requested_term_months: loan.requested_term_months,
      exit_strategy: loan.exit_strategy,
      application_status: 'submitted',
      submitted_at: new Date().toISOString(),
    })
    .select('id, application_number')
    .single()

  if (appError || !application) {
    return NextResponse.json({ error: appError?.message ?? 'Failed to create application' }, { status: 500 })
  }

  // 4. Create property record
  const { error: propertyError } = await supabase
    .from('properties')
    .insert({
      application_id: application.id,
      address_line_1: property.address_line_1,
      address_line_2: property.address_line_2 ?? null,
      city: property.city,
      state: property.state,
      postal_code: property.postal_code,
      property_type: property.property_type,
      occupancy_type: property.occupancy_type,
      current_value: property.current_value ?? null,
      arv_value: property.arv_value ?? null,
      purchase_price: property.purchase_price ?? null,
    })

  if (propertyError) {
    return NextResponse.json({ error: propertyError.message }, { status: 500 })
  }

  // 5. Create loan request record
  const { error: loanReqError } = await supabase
    .from('loan_requests')
    .insert({
      application_id: application.id,
      requested_principal: loan.requested_amount,
    })

  if (loanReqError) {
    return NextResponse.json({ error: loanReqError.message }, { status: 500 })
  }

  // 6. Notify admin
  await sendApplicationSubmittedEmail({
    applicationNumber: application.application_number,
    borrowerEmail: user.email!,
    borrowerName: profile.full_name,
    loanPurpose: loan.loan_purpose,
    requestedAmount: String(loan.requested_amount),
    applicationId: application.id,
  })

  return NextResponse.json({
    success: true,
    application_id: application.id,
    application_number: application.application_number,
  })
}
