import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserRole } from '@/lib/auth/roles'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)

  const { data: loan, error } = await supabase
    .from('loans')
    .select(`
      id, loan_number, loan_status, principal_amount, interest_rate,
      origination_fee, term_months, payment_type, funding_date,
      maturity_date, payoff_date, outstanding_balance, accrued_interest,
      total_paid, notes, created_at,
      applications (
        id, application_number, loan_purpose,
        borrowers ( profiles ( full_name, email, phone ) )
      )
    `)
    .eq('id', id)
    .single()

  if (error || !loan) return NextResponse.json({ error: 'Loan not found' }, { status: 404 })

  // Fetch related data
  const [{ data: schedule }, { data: paymentsData }, { data: drawsData }] = await Promise.all([
    supabase
      .from('payment_schedule')
      .select('*')
      .eq('loan_id', id)
      .order('period_number'),
    supabase
      .from('payments')
      .select('*')
      .eq('loan_id', id)
      .order('payment_date', { ascending: false }),
    supabase
      .from('draws')
      .select('*')
      .eq('loan_id', id)
      .order('created_at', { ascending: false }),
  ])

  return NextResponse.json({
    loan,
    schedule:  schedule ?? [],
    payments:  paymentsData ?? [],
    draws:     drawsData ?? [],
  })
}
