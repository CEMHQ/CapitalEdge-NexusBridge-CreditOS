import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserRole } from '@/lib/auth/roles'
import { validateBody } from '@/lib/validation/validate'
import { createLoanSchema } from '@/lib/validation/schemas'
import { createLoanLimiter } from '@/lib/rate-limit/index'
import { applyRateLimit } from '@/lib/rate-limit/apply'
import { emitAuditEvent } from '@/lib/audit/emit'

// Compute maturity date from funding date + term
function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().split('T')[0]
}

// Generate interest-only payment schedule entries
function buildInterestOnlySchedule(
  loanId: string,
  principal: number,
  rate: number,
  termMonths: number,
  fundingDate: string,
  userId: string,
) {
  const monthlyRate = rate / 12
  const monthlyInterest = Math.round(principal * monthlyRate * 100) / 100

  return Array.from({ length: termMonths }, (_, i) => {
    const dueDate = addMonths(fundingDate, i + 1)
    const isLast  = i === termMonths - 1
    return {
      loan_id:             loanId,
      period_number:       i + 1,
      due_date:            dueDate,
      scheduled_principal: isLast ? principal : 0,
      scheduled_interest:  monthlyInterest,
      scheduled_total:     isLast ? principal + monthlyInterest : monthlyInterest,
      created_by:          userId,
    }
  })
}

export async function POST(request: Request) {
  const validation = await validateBody(request, createLoanSchema)
  if (!validation.success) return validation.response

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (!['admin', 'manager'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const blocked = await applyRateLimit(createLoanLimiter, user.id)
  if (blocked) return blocked

  const data = validation.data

  // Verify application is approved
  const { data: app } = await supabase
    .from('applications')
    .select('id, application_status, application_number')
    .eq('id', data.application_id)
    .single()

  if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  if (app.application_status !== 'approved') {
    return NextResponse.json({ error: 'Application must be in approved status to create a loan' }, { status: 422 })
  }

  // Check no loan already exists for this application
  const { data: existing } = await supabase
    .from('loans')
    .select('id')
    .eq('application_id', data.application_id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'A loan already exists for this application' }, { status: 409 })
  }

  const maturityDate = addMonths(data.funding_date, data.term_months)

  const { data: loan, error: loanErr } = await supabase
    .from('loans')
    .insert({
      application_id:      data.application_id,
      loan_number:         '', // trigger will set this
      loan_status:         'pending_funding',
      principal_amount:    data.principal_amount,
      interest_rate:       data.interest_rate,
      origination_fee:     data.origination_fee ?? 0,
      term_months:         data.term_months,
      payment_type:        data.payment_type,
      funding_date:        data.funding_date,
      maturity_date:       maturityDate,
      outstanding_balance: data.principal_amount,
      created_by:          user.id,
    })
    .select('id, loan_number')
    .single()

  if (loanErr || !loan) {
    return NextResponse.json({ error: loanErr?.message ?? 'Failed to create loan' }, { status: 500 })
  }

  // Build payment schedule for interest_only and balloon loans
  if (data.payment_type !== 'amortizing') {
    const schedule = buildInterestOnlySchedule(
      loan.id,
      data.principal_amount,
      data.interest_rate,
      data.term_months,
      data.funding_date,
      user.id,
    )
    await supabase.from('payment_schedule').insert(schedule)
  }

  // Advance application to funded
  await supabase
    .from('applications')
    .update({ application_status: 'funded', updated_at: new Date().toISOString() })
    .eq('id', data.application_id)

  await emitAuditEvent({
    actor_id:    user.id,
    actor_role:  role,
    event_type:  'loan.created',
    entity_type: 'loan',
    entity_id:   loan.id,
    payload: { application_id: data.application_id, loan_number: loan.loan_number },
  })

  return NextResponse.json({ success: true, loan_id: loan.id, loan_number: loan.loan_number }, { status: 201 })
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (!['admin', 'manager', 'servicing'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')

  let query = supabase
    .from('loans')
    .select(`
      id, loan_number, loan_status, principal_amount, interest_rate,
      term_months, payment_type, funding_date, maturity_date,
      outstanding_balance, total_paid, created_at,
      applications (
        id, application_number, loan_purpose,
        borrowers ( profiles ( full_name, email ) )
      )
    `)
    .order('created_at', { ascending: false })

  if (status) query = query.eq('loan_status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ loans: data ?? [] })
}
