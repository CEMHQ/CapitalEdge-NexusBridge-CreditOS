import { createClient } from '@/lib/supabase/server'
import { formatCurrency, formatDate } from '@/lib/format'
import DeleteApplicationRowButton from '@/components/admin/DeleteApplicationRowButton'

const STATUS_OPTIONS = [
  'all', 'submitted', 'under_review', 'conditionally_approved', 'approved', 'declined', 'funded', 'closed',
]

function statusColor(status: string) {
  switch (status) {
    case 'submitted': return 'bg-blue-50 text-blue-700'
    case 'under_review': return 'bg-yellow-50 text-yellow-700'
    case 'conditionally_approved': return 'bg-orange-50 text-orange-700'
    case 'approved': return 'bg-green-50 text-green-700'
    case 'funded': return 'bg-green-100 text-green-800'
    case 'declined': return 'bg-red-50 text-red-700'
    case 'closed': return 'bg-gray-100 text-gray-500'
    default: return 'bg-gray-100 text-gray-600'
  }
}

export default async function AdminApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const supabase = await createClient()
  const { status } = await searchParams
  const activeFilter = status && status !== 'all' ? status : null

  let query = supabase
    .from('applications')
    .select(`
      id,
      application_number,
      loan_purpose,
      requested_amount,
      application_status,
      submitted_at,
      borrowers (
        id,
        profiles (
          full_name,
          email
        )
      )
    `)
    .order('submitted_at', { ascending: false })

  if (activeFilter) {
    query = query.eq('application_status', activeFilter)
  }

  const { data: applications, error } = await query

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Applications</h1>
        <p className="text-sm text-gray-500 mt-1">{applications?.length ?? 0} total</p>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((s) => (
          <a
            key={s}
            href={s === 'all' ? '/dashboard/admin/applications' : `/dashboard/admin/applications?status=${s}`}
            className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${
              (s === 'all' && !activeFilter) || s === activeFilter
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {s.replace(/_/g, ' ')}
          </a>
        ))}
      </div>

      {error && (
        <p className="text-sm text-red-600">Failed to load applications: {error.message}</p>
      )}

      {/* Applications table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Application #</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Borrower</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Purpose</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Submitted</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              <th className="px-5 py-3" />
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {!applications?.length && (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-sm text-gray-400">
                  No applications found.
                </td>
              </tr>
            )}
            {applications?.map((app) => {
              const borrower = Array.isArray(app.borrowers) ? app.borrowers[0] : app.borrowers
              const profile = borrower && (Array.isArray(borrower.profiles) ? borrower.profiles[0] : borrower.profiles)

              return (
                <tr key={app.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-4 font-medium text-gray-900">#{app.application_number}</td>
                  <td className="px-5 py-4">
                    <p className="font-medium text-gray-900">{profile?.full_name || '—'}</p>
                    <p className="text-xs text-gray-400">{profile?.email}</p>
                  </td>
                  <td className="px-5 py-4 capitalize text-gray-600">
                    {app.loan_purpose.replace(/_/g, ' ')}
                  </td>
                  <td className="px-5 py-4 font-medium text-gray-900">
                    {formatCurrency(app.requested_amount)}
                  </td>
                  <td className="px-5 py-4 text-gray-500">
                    {formatDate(app.submitted_at)}
                  </td>
                  <td className="px-5 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${statusColor(app.application_status)}`}>
                      {app.application_status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <a
                      href={`/dashboard/admin/applications/${app.id}`}
                      className="text-xs font-medium text-gray-900 hover:underline"
                    >
                      Review →
                    </a>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <DeleteApplicationRowButton applicationId={app.id} />
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
