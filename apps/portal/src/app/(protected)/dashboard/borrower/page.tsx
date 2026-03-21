import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/format'

export default async function BorrowerDashboard({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { submitted } = await searchParams

  // Load borrower's applications
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
        .order('created_at', { ascending: false })
    : { data: [] }

  const hasApplications = applications && applications.length > 0
  const latestApp = hasApplications ? applications[0] : null

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Borrower Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Welcome back, {user?.email}</p>
        </div>
        <a
          href="/dashboard/borrower/apply"
          className="inline-flex items-center px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700 transition-colors"
        >
          + New Application
        </a>
      </div>

      {submitted && (
        <div className="bg-green-50 border border-green-200 rounded-md px-4 py-3 text-sm text-green-800">
          Application <strong>{submitted}</strong> submitted successfully. Our team will be in touch shortly.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <DashboardCard
          title="Application Status"
          value={latestApp ? latestApp.application_status.replace(/_/g, ' ') : '—'}
          description={latestApp ? `#${latestApp.application_number}` : 'No active applications'}
        />
        <DashboardCard
          title="Requested Amount"
          value={latestApp ? formatCurrency(latestApp.requested_amount) : '—'}
          description={latestApp ? latestApp.loan_purpose : 'Submit an application to begin'}
        />
        <DashboardCard title="Documents Needed" value="—" description="Upload required documents" />
        <DashboardCard title="Tasks Due" value="0" description="No pending tasks" />
        <DashboardCard title="Messages" value="0" description="No unread messages" />
        <DashboardCard title="Funding Timeline" value="—" description="Pending application review" />
      </div>

      {hasApplications && (
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-3">Your Applications</h2>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {applications!.map((app) => (
              <a
                key={app.id}
                href={`/dashboard/borrower/applications/${app.id}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">#{app.application_number}</p>
                  <p className="text-xs text-gray-500 capitalize mt-0.5">
                    {app.loan_purpose.replace(/_/g, ' ')} · {formatCurrency(app.requested_amount)}
                  </p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full capitalize font-medium ${statusColor(app.application_status)}`}>
                  {app.application_status.replace(/_/g, ' ')}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function DashboardCard({ title, value, description }: { title: string; value: string; description: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-1">
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <p className="text-2xl font-semibold text-gray-900 capitalize">{value}</p>
      <p className="text-xs text-gray-400">{description}</p>
    </div>
  )
}


function statusColor(status: string) {
  switch (status) {
    case 'submitted': return 'bg-blue-50 text-blue-700'
    case 'under_review': return 'bg-yellow-50 text-yellow-700'
    case 'approved': return 'bg-green-50 text-green-700'
    case 'funded': return 'bg-green-100 text-green-800'
    case 'declined': return 'bg-red-50 text-red-700'
    default: return 'bg-gray-100 text-gray-600'
  }
}
