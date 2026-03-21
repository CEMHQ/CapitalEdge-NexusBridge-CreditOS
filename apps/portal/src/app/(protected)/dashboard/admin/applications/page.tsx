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
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Applications</h1>
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

      {/* ── Mobile: card list ───────────────────────────────────────── */}
      <div className="sm:hidden space-y-3">
        {!applications?.length && (
          <p className="text-sm text-gray-400 text-center py-8">No applications found.</p>
        )}
        {applications?.map((app) => {
          const borrower = Array.isArray(app.borrowers) ? app.borrowers[0] : app.borrowers
          const profile = borrower && (Array.isArray(borrower.profiles) ? borrower.profiles[0] : borrower.profiles)
          return (
            <div key={app.id} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">#{app.application_number}</p>
                  <p className="text-sm text-gray-700 truncate">{profile?.full_name || '—'}</p>
                  <p className="text-xs text-gray-400 truncate">{profile?.email}</p>
                </div>
                <span className={`shrink-0 px-2 py-1 rounded-full text-xs font-medium capitalize ${statusColor(app.application_status)}`}>
                  {app.application_status.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <span className="text-gray-500">Purpose</span>
                <span className="text-gray-700 capitalize">{app.loan_purpose.replace(/_/g, ' ')}</span>
                <span className="text-gray-500">Amount</span>
                <span className="text-gray-700 font-medium">{formatCurrency(app.requested_amount)}</span>
                <span className="text-gray-500">Submitted</span>
                <span className="text-gray-700">{formatDate(app.submitted_at)}</span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                <a href={`/dashboard/admin/applications/${app.id}`} className="text-sm font-medium text-gray-900 hover:underline">
                  Review →
                </a>
                <DeleteApplicationRowButton applicationId={app.id} />
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Desktop: table ──────────────────────────────────────────── */}
      <div className="hidden sm:block overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Application #</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Borrower</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Purpose</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Amount</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Submitted</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Status</th>
              <th className="px-4 py-3" />
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {!applications?.length && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-400">
                  No applications found.
                </td>
              </tr>
            )}
            {applications?.map((app) => {
              const borrower = Array.isArray(app.borrowers) ? app.borrowers[0] : app.borrowers
              const profile = borrower && (Array.isArray(borrower.profiles) ? borrower.profiles[0] : borrower.profiles)
              return (
                <tr key={app.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">#{app.application_number}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 whitespace-nowrap">{profile?.full_name || '—'}</p>
                    <p className="text-xs text-gray-400 whitespace-nowrap">{profile?.email}</p>
                  </td>
                  <td className="px-4 py-3 capitalize text-gray-600 whitespace-nowrap">
                    {app.loan_purpose.replace(/_/g, ' ')}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                    {formatCurrency(app.requested_amount)}
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {formatDate(app.submitted_at)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${statusColor(app.application_status)}`}>
                      {app.application_status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <a href={`/dashboard/admin/applications/${app.id}`} className="text-xs font-medium text-gray-900 hover:underline">
                      Review →
                    </a>
                  </td>
                  <td className="px-4 py-3 text-right">
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
