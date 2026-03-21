import { createClient } from '@/lib/supabase/server'
import { formatCurrency, formatDate } from '@/lib/format'

function statusColor(status: string) {
  switch (status) {
    case 'submitted':              return 'bg-blue-50 text-blue-700'
    case 'under_review':           return 'bg-yellow-50 text-yellow-700'
    case 'conditionally_approved': return 'bg-orange-50 text-orange-700'
    case 'approved':               return 'bg-green-50 text-green-700'
    case 'funded':                 return 'bg-green-100 text-green-800'
    case 'declined':               return 'bg-red-50 text-red-700'
    case 'closed':                 return 'bg-gray-100 text-gray-500'
    default:                       return 'bg-gray-100 text-gray-600'
  }
}

export default async function BorrowerApplicationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: borrower } = await supabase
    .from('borrowers')
    .select('id')
    .eq('profile_id', user!.id)
    .single()

  const { data: applications } = borrower
    ? await supabase
        .from('applications')
        .select('id, application_number, loan_purpose, requested_amount, application_status, submitted_at')
        .eq('borrower_id', borrower.id)
        .order('submitted_at', { ascending: false })
    : { data: [] }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">My Applications</h1>
          <p className="text-sm text-gray-500 mt-1">{applications?.length ?? 0} total</p>
        </div>
        <a
          href="/dashboard/borrower/apply"
          className="inline-flex items-center justify-center w-full sm:w-auto px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700 transition-colors"
        >
          + New Application
        </a>
      </div>

      {!applications?.length ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-sm font-medium text-gray-900">No applications yet</p>
          <p className="text-xs text-gray-400 mt-1">Start a new application to begin the process.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Application #</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Purpose</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Amount</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Submitted</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {applications.map((app) => (
                <tr key={app.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">#{app.application_number}</td>
                  <td className="px-4 py-3 capitalize text-gray-600 whitespace-nowrap">
                    {app.loan_purpose.replace(/_/g, ' ')}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                    {formatCurrency(app.requested_amount)}
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(app.submitted_at)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${statusColor(app.application_status)}`}>
                      {app.application_status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <a
                      href={`/dashboard/borrower/applications/${app.id}`}
                      className="text-xs font-medium text-gray-900 hover:underline"
                    >
                      View →
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
