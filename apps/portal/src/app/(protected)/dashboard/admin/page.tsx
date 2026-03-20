import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function AdminDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Summary counts
  const { count: submittedCount } = await supabase
    .from('applications')
    .select('*', { count: 'exact', head: true })
    .eq('application_status', 'submitted')

  const { count: underReviewCount } = await supabase
    .from('applications')
    .select('*', { count: 'exact', head: true })
    .eq('application_status', 'under_review')

  const { count: totalCount } = await supabase
    .from('applications')
    .select('*', { count: 'exact', head: true })

  const { count: fundedCount } = await supabase
    .from('applications')
    .select('*', { count: 'exact', head: true })
    .eq('application_status', 'funded')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Admin Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Signed in as {user?.email}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <DashboardCard
          title="Needs Review"
          value={String(submittedCount ?? 0)}
          description="Submitted, awaiting review"
          href="/dashboard/admin/applications?status=submitted"
        />
        <DashboardCard
          title="In Review"
          value={String(underReviewCount ?? 0)}
          description="Currently under review"
          href="/dashboard/admin/applications?status=under_review"
        />
        <DashboardCard
          title="Total Applications"
          value={String(totalCount ?? 0)}
          description="All time"
          href="/dashboard/admin/applications"
        />
        <DashboardCard
          title="Loans Funded"
          value={String(fundedCount ?? 0)}
          description="Successfully funded"
          href="/dashboard/admin/applications?status=funded"
        />
      </div>

      <div className="flex gap-3">
        <Link
          href="/dashboard/admin/applications"
          className="inline-flex items-center px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700 transition-colors"
        >
          View All Applications
        </Link>
      </div>
    </div>
  )
}

function DashboardCard({
  title,
  value,
  description,
  href,
}: {
  title: string
  value: string
  description: string
  href: string
}) {
  return (
    <a
      href={href}
      className="bg-white rounded-xl border border-gray-200 p-5 space-y-1 hover:border-gray-300 transition-colors block"
    >
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <p className="text-2xl font-semibold text-gray-900">{value}</p>
      <p className="text-xs text-gray-400">{description}</p>
    </a>
  )
}
