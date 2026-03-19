import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserRole } from '@/lib/auth/roles'
import { runRulesEngine, type ApplicationSnapshot } from '@/lib/underwriting/rules-engine'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (!['admin', 'manager', 'underwriter'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: uwCase, error } = await supabase
    .from('underwriting_cases')
    .select(`
      id,
      case_status,
      priority,
      opened_at,
      closed_at,
      assigned_to,
      notes,
      applications (
        id,
        application_number,
        application_status,
        loan_purpose,
        requested_amount,
        requested_term_months,
        exit_strategy,
        submitted_at,
        borrowers (
          kyc_status,
          aml_status,
          profiles ( full_name, email, phone )
        ),
        properties (
          address_line_1, city, state, postal_code,
          property_type, occupancy_type,
          current_value, arv_value, purchase_price
        ),
        loan_requests (
          id,
          requested_ltv, requested_ltc, requested_dscr
        )
      )
    `)
    .eq('id', id)
    .single()

  if (error || !uwCase) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 })
  }

  // Fetch conditions and decisions
  const [{ data: conditions }, { data: decisions }, { data: riskFlags }] = await Promise.all([
    supabase.from('conditions').select('*').eq('case_id', id).order('created_at'),
    supabase.from('underwriting_decisions').select('*').eq('case_id', id).order('decided_at', { ascending: false }),
    supabase.from('risk_flags').select('*').eq('case_id', id).order('severity'),
  ])

  // Run rules engine for live analysis
  const app = Array.isArray(uwCase.applications) ? uwCase.applications[0] : uwCase.applications
  const borrower = app && (Array.isArray(app.borrowers) ? app.borrowers[0] : app.borrowers)
  const property = app && (Array.isArray(app.properties) ? app.properties[0] : app.properties)
  const loanReq  = app && (Array.isArray(app.loan_requests) ? app.loan_requests[0] : app.loan_requests)

  let rulesResult = null
  if (app && property) {
    const snap: ApplicationSnapshot = {
      requested_amount:      app.requested_amount ?? 0,
      requested_term_months: app.requested_term_months ?? 0,
      loan_purpose:          app.loan_purpose ?? '',
      current_value:         property.current_value ?? null,
      arv_value:             property.arv_value ?? null,
      purchase_price:        property.purchase_price ?? null,
      requested_ltv:         loanReq?.requested_ltv ?? null,
      requested_ltc:         loanReq?.requested_ltc ?? null,
      requested_dscr:        loanReq?.requested_dscr ?? null,
      property_type:         property.property_type ?? '',
      occupancy_type:        property.occupancy_type ?? '',
      kyc_status:            borrower?.kyc_status ?? 'pending',
      aml_status:            borrower?.aml_status ?? 'pending',
    }
    rulesResult = runRulesEngine(snap)
  }

  return NextResponse.json({
    case: uwCase,
    conditions:   conditions ?? [],
    decisions:    decisions ?? [],
    risk_flags:   riskFlags ?? [],
    rules_engine: rulesResult,
  })
}
