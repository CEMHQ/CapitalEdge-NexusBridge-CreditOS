import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency, formatDate } from '@/lib/format'
import LoanStatusForm from '@/components/servicing/LoanStatusForm'
import RecordPaymentForm from '@/components/servicing/RecordPaymentForm'

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

const SCHEDULE_STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-gray-100 text-gray-600',
  paid:      'bg-green-50 text-green-700',
  partial:   'bg-amber-50 text-amber-700',
  missed:    'bg-red-50 text-red-700',
}

export default async function ServicingLoanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: loan } = await supabase
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

  if (!loan) notFound()

  const [{ data: schedule }, { data: paymentsData }, { data: draws }] = await Promise.all([
    supabase.from('payment_schedule').select('*').eq('loan_id', id).order('period_number'),
    supabase.from('payments').select('*').eq('loan_id', id).order('payment_date', { ascending: false }),
    supabase.from('draws').select('*').eq('loan_id', id).order('created_at', { ascending: false }),
  ])

  const app     = Array.isArray(loan.applications) ? loan.applications[0] : loan.applications
  const borrower = app && (Array.isArray(app.borrowers) ? app.borrowers[0] : app.borrowers)
  const profile  = borrower && (Array.isArray(borrower.profiles) ? borrower.profiles[0] : borrower.profiles)

  const isActive = ['active', 'delinquent', 'matured'].includes(loan.loan_status)

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link href="/dashboard/servicing/loans" className="text-sm text-gray-400 hover:text-gray-600">
            ← All Loans
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900 mt-1">{loan.loan_number}</h1>
          <p className="text-sm text-gray-500 mt-0.5">Funded {formatDate(loan.funding_date)}</p>
        </div>
        <LoanStatusForm loanId={loan.id} currentStatus={loan.loan_status} />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Outstanding Balance</p>
          <p className="text-xl font-semibold text-gray-900 mt-1">{formatCurrency(loan.outstanding_balance)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Total Paid</p>
          <p className="text-xl font-semibold text-gray-900 mt-1">{formatCurrency(loan.total_paid)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Maturity Date</p>
          <p className="text-xl font-semibold text-gray-900 mt-1">{formatDate(loan.maturity_date)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Loan details */}
        <Section title="Loan Details">
          <Row label="Loan Number"    value={loan.loan_number} />
          <Row label="Status"         value={loan.loan_status.replace(/_/g, ' ')} />
          <Row label="Principal"      value={formatCurrency(loan.principal_amount)} />
          <Row label="Rate"           value={`${(Number(loan.interest_rate) * 100).toFixed(2)}%`} />
          <Row label="Origination Fee" value={formatCurrency(loan.origination_fee)} />
          <Row label="Term"           value={`${loan.term_months} months`} />
          <Row label="Payment Type"   value={loan.payment_type.replace(/_/g, ' ')} />
          <Row label="Funding Date"   value={formatDate(loan.funding_date)} />
          <Row label="Maturity Date"  value={formatDate(loan.maturity_date)} />
          {loan.payoff_date && <Row label="Payoff Date" value={formatDate(loan.payoff_date)} />}
        </Section>

        {/* Borrower */}
        <Section title="Borrower">
          <Row label="Name"   value={profile?.full_name} />
          <Row label="Email"  value={profile?.email} />
          <Row label="Phone"  value={profile?.phone} />
          <Row label="Application" value={`#${app?.application_number}`} />
          <Row label="Purpose"     value={app?.loan_purpose?.replace(/_/g, ' ')} />
        </Section>
      </div>

      {/* Payment Schedule */}
      {schedule && schedule.length > 0 && (
        <Section title="Payment Schedule">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">#</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Due Date</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Principal</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Interest</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Total</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {schedule.map((s) => (
                  <tr key={s.id} className="text-sm">
                    <td className="px-4 py-2 text-gray-500">{s.period_number}</td>
                    <td className="px-4 py-2 text-gray-700">{formatDate(s.due_date)}</td>
                    <td className="px-4 py-2 text-gray-700">{formatCurrency(s.scheduled_principal)}</td>
                    <td className="px-4 py-2 text-gray-700">{formatCurrency(s.scheduled_interest)}</td>
                    <td className="px-4 py-2 font-medium text-gray-900">{formatCurrency(s.scheduled_total)}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium capitalize ${SCHEDULE_STATUS_COLORS[s.schedule_status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {s.schedule_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Record Payment */}
      {isActive && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6">
          <h2 className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-4">Record Payment</h2>
          <RecordPaymentForm
            loanId={loan.id}
            schedule={(schedule ?? []).filter((s) => s.schedule_status !== 'paid')}
          />
        </div>
      )}

      {/* Payment History */}
      {paymentsData && paymentsData.length > 0 && (
        <Section title="Payment History">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Date</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Amount</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Principal</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Interest</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Method</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paymentsData.map((p) => (
                  <tr key={p.id} className="text-sm">
                    <td className="px-4 py-2 text-gray-700">{formatDate(p.payment_date)}</td>
                    <td className="px-4 py-2 font-medium text-gray-900">{formatCurrency(p.payment_amount)}</td>
                    <td className="px-4 py-2 text-gray-600">{formatCurrency(p.principal_applied)}</td>
                    <td className="px-4 py-2 text-gray-600">{formatCurrency(p.interest_applied)}</td>
                    <td className="px-4 py-2 text-gray-500 capitalize">{p.payment_method ?? '—'}</td>
                    <td className="px-4 py-2 text-gray-400 text-xs">{p.external_reference ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Draws */}
      {draws && draws.length > 0 && (
        <Section title="Draw Requests">
          <ul className="space-y-2">
            {draws.map((d) => (
              <li key={d.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-900">{formatCurrency(d.draw_amount)}</p>
                  {d.description && <p className="text-xs text-gray-400">{d.description}</p>}
                  <p className="text-xs text-gray-400 mt-0.5">Requested {formatDate(d.created_at)}</p>
                </div>
                <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                  d.draw_status === 'funded'    ? 'bg-green-50 text-green-700' :
                  d.draw_status === 'approved'  ? 'bg-blue-50 text-blue-700' :
                  d.draw_status === 'cancelled' ? 'bg-gray-100 text-gray-400' :
                  'bg-amber-50 text-amber-700'
                }`}>
                  {d.draw_status}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}
