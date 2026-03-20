import { createClient } from '@/lib/supabase/server'
import { getUserRole } from '@/lib/auth/roles'
import { formatCurrency, formatDate } from '@/lib/format'
import Link from 'next/link'

const PRIORITY_COLORS: Record<string, string> = {
  low:    'bg-gray-100 text-gray-600',
  normal: 'bg-blue-50 text-blue-700',
  high:   'bg-amber-50 text-amber-700',
  urgent: 'bg-red-50 text-red-700',
}

export default async function UnderwriterCasesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const role = await getUserRole(supabase, user.id)

  let query = supabase
    .from('underwriting_cases')
    .select(`
      id,
      case_status,
      priority,
      opened_at,
      assigned_to,
      applications (
        id,
        application_number,
        application_status,
        requested_amount,
        loan_purpose,
        borrowers (
          profiles ( full_name )
        )
      )
    `)
    .neq('case_status', 'closed')
    .order('opened_at', { ascending: false })

  if (role === 'underwriter') {
    query = query.eq('assigned_to', user.id)
  }

  const { data: cases } = await query

  const open    = cases?.filter((c) => c.case_status === 'open') ?? []
  const inReview = cases?.filter((c) => c.case_status === 'in_review') ?? []
  const decided  = cases?.filter((c) => c.case_status === 'decision_made') ?? []

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Underwriting Cases</h1>
        <p className="text-sm text-gray-500 mt-1">
          {open.length} open · {inReview.length} in review · {decided.length} awaiting close
        </p>
      </div>

      <CaseTable title="Open" cases={open} />
      <CaseTable title="In Review" cases={inReview} />
      <CaseTable title="Decision Made" cases={decided} />

      {(cases?.length ?? 0) === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-sm text-gray-400">No active underwriting cases.</p>
        </div>
      )}
    </div>
  )
}

type CaseRow = {
  id: string
  case_status: string
  priority: string
  opened_at: string
  assigned_to: string | null
  applications: {
    id: string
    application_number: string
    application_status: string
    requested_amount: number | string | null
    loan_purpose: string | null
    borrowers: { profiles: { full_name: string | null } | { full_name: string | null }[] | null } | { profiles: { full_name: string | null } | { full_name: string | null }[] | null }[] | null
  } | {
    id: string
    application_number: string
    application_status: string
    requested_amount: number | string | null
    loan_purpose: string | null
    borrowers: { profiles: { full_name: string | null } | { full_name: string | null }[] | null } | { profiles: { full_name: string | null } | { full_name: string | null }[] | null }[] | null
  }[] | null
}

function CaseTable({ title, cases }: { title: string; cases: CaseRow[] }) {
  if (cases.length === 0) return null

  return (
    <div>
      <h2 className="text-base font-semibold text-gray-900 mb-3">
        {title}
        <span className="ml-2 text-sm font-normal text-gray-400">{cases.length}</span>
      </h2>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Application</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Borrower</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Opened</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {cases.map((c) => {
              const app      = Array.isArray(c.applications) ? c.applications[0] : c.applications
              const borrower = app && (Array.isArray(app.borrowers) ? app.borrowers[0] : app.borrowers)
              const profile  = borrower && (Array.isArray(borrower.profiles) ? borrower.profiles[0] : borrower.profiles)

              return (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <p className="text-sm font-medium text-gray-900">#{app?.application_number}</p>
                    <p className="text-xs text-gray-400 capitalize">{app?.loan_purpose?.replace(/_/g, ' ')}</p>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    {profile?.full_name ?? '—'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    {app?.requested_amount ? formatCurrency(app.requested_amount) : '—'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium capitalize ${PRIORITY_COLORS[c.priority] ?? 'bg-gray-100 text-gray-600'}`}>
                      {c.priority}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {formatDate(c.opened_at)}
                  </td>
                  <td className="px-6 py-4">
                    <Link
                      href={`/dashboard/underwriter/cases/${c.id}`}
                      className="text-sm text-gray-900 font-medium hover:underline"
                    >
                      Review
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
