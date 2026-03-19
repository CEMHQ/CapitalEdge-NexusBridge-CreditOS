import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUserRole } from '@/lib/auth/roles'
import { formatCurrency, formatDate } from '@/lib/format'
import { runRulesEngine, type ApplicationSnapshot } from '@/lib/underwriting/rules-engine'
import DecisionForm from '@/components/underwriter/DecisionForm'
import AddConditionForm from '@/components/underwriter/AddConditionForm'

const SEVERITY_COLORS: Record<string, string> = {
  low:      'bg-gray-100 text-gray-600',
  medium:   'bg-amber-50 text-amber-700',
  high:     'bg-orange-50 text-orange-700',
  critical: 'bg-red-50 text-red-700',
}

const CONDITION_STATUS_COLORS: Record<string, string> = {
  open:      'bg-amber-50 text-amber-700',
  satisfied: 'bg-green-50 text-green-700',
  waived:    'bg-gray-100 text-gray-500',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">{title}</h2>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900">{value || '—'}</span>
    </div>
  )
}

export default async function UnderwriterCaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const role = await getUserRole(supabase, user.id)

  const { data: uwCase } = await supabase
    .from('underwriting_cases')
    .select(`
      id,
      case_status,
      priority,
      opened_at,
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
          address_line_1, address_line_2, city, state, postal_code,
          property_type, occupancy_type,
          current_value, arv_value, purchase_price
        ),
        loan_requests (
          requested_ltv, requested_ltc, requested_dscr
        )
      )
    `)
    .eq('id', id)
    .single()

  if (!uwCase) notFound()

  const [{ data: conditions }, { data: decisions }, { data: riskFlags }] = await Promise.all([
    supabase.from('conditions').select('*').eq('case_id', id).order('created_at'),
    supabase.from('underwriting_decisions').select('*').eq('case_id', id).order('decided_at', { ascending: false }),
    supabase.from('risk_flags').select('*').eq('case_id', id).order('severity'),
  ])

  const app      = Array.isArray(uwCase.applications) ? uwCase.applications[0] : uwCase.applications
  const borrower = app && (Array.isArray(app.borrowers) ? app.borrowers[0] : app.borrowers)
  const profile  = borrower && (Array.isArray(borrower.profiles) ? borrower.profiles[0] : borrower.profiles)
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

  const canDecide = ['admin', 'manager', 'underwriter'].includes(role) && uwCase.case_status !== 'closed'

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <a href="/dashboard/underwriter/cases" className="text-sm text-gray-400 hover:text-gray-600">
            ← All Cases
          </a>
          <h1 className="text-2xl font-semibold text-gray-900 mt-1">
            Case — #{app?.application_number}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Opened {formatDate(uwCase.opened_at)} · Status:{' '}
            <span className="capitalize font-medium text-gray-700">{uwCase.case_status.replace(/_/g, ' ')}</span>
          </p>
        </div>
        <span className={`inline-block text-xs px-2 py-1 rounded-full font-medium capitalize ${
          uwCase.priority === 'urgent' ? 'bg-red-50 text-red-700' :
          uwCase.priority === 'high'   ? 'bg-amber-50 text-amber-700' :
          'bg-blue-50 text-blue-700'
        }`}>
          {uwCase.priority} priority
        </span>
      </div>

      {/* Risk Score Banner */}
      {rulesResult && (
        <div className={`rounded-xl border px-5 py-4 ${
          rulesResult.recommendation === 'decline'     ? 'bg-red-50 border-red-200' :
          rulesResult.recommendation === 'review'      ? 'bg-amber-50 border-amber-200' :
          rulesResult.recommendation === 'conditional' ? 'bg-blue-50 border-blue-200' :
          'bg-green-50 border-green-200'
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">
                Rules Engine:{' '}
                <span className="capitalize">{rulesResult.recommendation.replace(/_/g, ' ')}</span>
              </p>
              <p className="text-xs text-gray-600 mt-0.5">
                Risk score: {rulesResult.risk_score}/100 · {rulesResult.flags.length} flags
                {rulesResult.blocking_flags > 0 && ` · ${rulesResult.blocking_flags} blocking`}
              </p>
            </div>
          </div>

          {rulesResult.flags.length > 0 && (
            <ul className="mt-3 space-y-1">
              {rulesResult.flags.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-xs">
                  <span className={`mt-0.5 inline-block px-1.5 py-0.5 rounded text-xs font-medium ${SEVERITY_COLORS[f.severity]}`}>
                    {f.severity}
                  </span>
                  <span className="text-gray-700">{f.description}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Borrower */}
        <Section title="Borrower">
          <Row label="Name"        value={profile?.full_name} />
          <Row label="Email"       value={profile?.email} />
          <Row label="Phone"       value={profile?.phone} />
          <Row label="KYC Status"  value={borrower?.kyc_status} />
          <Row label="AML Status"  value={borrower?.aml_status} />
        </Section>

        {/* Loan */}
        <Section title="Loan Scenario">
          <Row label="Purpose"        value={app?.loan_purpose?.replace(/_/g, ' ')} />
          <Row label="Amount"         value={app?.requested_amount ? formatCurrency(app.requested_amount) : null} />
          <Row label="Term"           value={app?.requested_term_months ? `${app.requested_term_months} months` : null} />
          <Row label="Exit Strategy"  value={app?.exit_strategy?.replace(/_/g, ' ')} />
          <Row label="LTV"            value={loanReq?.requested_ltv ? `${(loanReq.requested_ltv * 100).toFixed(1)}%` : null} />
          <Row label="LTC"            value={loanReq?.requested_ltc ? `${(loanReq.requested_ltc * 100).toFixed(1)}%` : null} />
          <Row label="DSCR"           value={loanReq?.requested_dscr ? String(loanReq.requested_dscr) : null} />
        </Section>
      </div>

      {/* Property */}
      {property && (
        <Section title="Property">
          <div className="grid grid-cols-2 gap-x-8">
            <Row label="Address"    value={[property.address_line_1, property.address_line_2].filter(Boolean).join(', ')} />
            <Row label="City / State" value={`${property.city}, ${property.state} ${property.postal_code}`} />
            <Row label="Type"       value={property.property_type?.replace(/_/g, ' ')} />
            <Row label="Occupancy"  value={property.occupancy_type?.replace(/_/g, ' ')} />
            <Row label="Current Value" value={property.current_value ? formatCurrency(property.current_value) : null} />
            <Row label="ARV"        value={property.arv_value ? formatCurrency(property.arv_value) : null} />
            <Row label="Purchase Price" value={property.purchase_price ? formatCurrency(property.purchase_price) : null} />
          </div>
        </Section>
      )}

      {/* Conditions */}
      <Section title="Conditions">
        {conditions && conditions.length > 0 ? (
          <ul className="space-y-2 mb-4">
            {conditions.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-4 py-2 border-b border-gray-100 last:border-0">
                <div>
                  <p className="text-sm text-gray-900">{c.description}</p>
                  <p className="text-xs text-gray-400 capitalize mt-0.5">{c.condition_type.replace(/_/g, ' ')}</p>
                </div>
                <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium capitalize whitespace-nowrap ${CONDITION_STATUS_COLORS[c.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {c.status}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-400 mb-4">No conditions yet.</p>
        )}

        {canDecide && (
          <AddConditionForm caseId={id} />
        )}
      </Section>

      {/* Past Decisions */}
      {decisions && decisions.length > 0 && (
        <Section title="Decision History">
          <ul className="space-y-3">
            {decisions.map((d) => (
              <li key={d.id} className="py-2 border-b border-gray-100 last:border-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-900 capitalize">
                    {d.decision_type.replace(/_/g, ' ')}
                  </p>
                  <p className="text-xs text-gray-400">{formatDate(d.decided_at)}</p>
                </div>
                {d.approved_amount && (
                  <p className="text-xs text-gray-600 mt-0.5">
                    Approved: {formatCurrency(d.approved_amount)}
                    {d.approved_rate && ` · ${(d.approved_rate * 100).toFixed(2)}%`}
                    {d.approved_term_months && ` · ${d.approved_term_months}mo`}
                  </p>
                )}
                {d.decision_notes && (
                  <p className="text-xs text-gray-500 mt-1 italic">{d.decision_notes}</p>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Decision Form */}
      {canDecide && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
          <h2 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-4">
            Record Decision
          </h2>
          <DecisionForm applicationId={app?.id ?? ''} caseId={id} />
        </div>
      )}
    </div>
  )
}
