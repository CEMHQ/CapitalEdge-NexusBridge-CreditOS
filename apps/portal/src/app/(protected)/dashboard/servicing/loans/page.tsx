import { createClient } from '@/lib/supabase/server'
import { formatCurrency, formatDate } from '@/lib/format'
import Link from 'next/link'

const STATUS_COLORS: Record<string, string> = {
  pending_funding: 'bg-gray-100 text-gray-600',
  active:          'bg-green-50 text-green-700',
  matured:         'bg-amber-50 text-amber-700',
  delinquent:      'bg-orange-50 text-orange-700',
  defaulted:       'bg-red-50 text-red-700',
  paid_off:        'bg-blue-50 text-blue-700',
  charged_off:     'bg-red-100 text-red-800',
  closed:          'bg-gray-50 text-gray-400',
}

export default async function ServicingLoansPage() {
  const supabase = await createClient()

  const { data: loans } = await supabase
    .from('loans')
    .select(`
      id, loan_number, loan_status, principal_amount, interest_rate,
      term_months, funding_date, maturity_date, outstanding_balance, total_paid,
      applications (
        application_number, loan_purpose,
        borrowers ( profiles ( full_name ) )
      )
    `)
    .order('created_at', { ascending: false })

  const active      = loans?.filter((l) => l.loan_status === 'active') ?? []
  const pending     = loans?.filter((l) => l.loan_status === 'pending_funding') ?? []
  const problem     = loans?.filter((l) => ['delinquent', 'defaulted', 'matured'].includes(l.loan_status)) ?? []
  const closed      = loans?.filter((l) => ['paid_off', 'charged_off', 'closed'].includes(l.loan_status)) ?? []

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Loans</h1>
        <p className="text-sm text-gray-500 mt-1">
          {active.length} active · {pending.length} pending funding · {problem.length} require attention
        </p>
      </div>

      <LoanTable title="Requires Attention" loans={problem} highlight />
      <LoanTable title="Active" loans={active} />
      <LoanTable title="Pending Funding" loans={pending} />
      <LoanTable title="Closed / Paid Off" loans={closed} collapsed />

      {(loans?.length ?? 0) === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-sm text-gray-400">No loans yet.</p>
        </div>
      )}
    </div>
  )
}

function LoanTable({
  title,
  loans,
  highlight = false,
  collapsed = false,
}: {
  title:      string
  loans:      any[]
  highlight?: boolean
  collapsed?: boolean
}) {
  if (loans.length === 0 && collapsed) return null
  if (loans.length === 0) return null

  return (
    <div>
      <h2 className={`text-base font-semibold mb-3 ${highlight ? 'text-red-700' : 'text-gray-900'}`}>
        {title}
        <span className="ml-2 text-sm font-normal text-gray-400">{loans.length}</span>
      </h2>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Loan</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Borrower</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Principal</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Balance</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rate</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Maturity</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loans.map((loan) => {
              const app      = Array.isArray(loan.applications) ? loan.applications[0] : loan.applications
              const borrower = app && (Array.isArray(app.borrowers) ? app.borrowers[0] : app.borrowers)
              const profile  = borrower && (Array.isArray(borrower.profiles) ? borrower.profiles[0] : borrower.profiles)

              return (
                <tr key={loan.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <p className="text-sm font-medium text-gray-900">{loan.loan_number}</p>
                    <p className="text-xs text-gray-400 capitalize">{app?.loan_purpose?.replace(/_/g, ' ')}</p>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    {profile?.full_name ?? '—'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    {formatCurrency(loan.principal_amount)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    {formatCurrency(loan.outstanding_balance)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    {loan.interest_rate ? `${(Number(loan.interest_rate) * 100).toFixed(2)}%` : '—'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {formatDate(loan.maturity_date)}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLORS[loan.loan_status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {loan.loan_status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <Link
                      href={`/dashboard/servicing/loans/${loan.id}`}
                      className="text-sm text-gray-900 font-medium hover:underline"
                    >
                      Manage
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
