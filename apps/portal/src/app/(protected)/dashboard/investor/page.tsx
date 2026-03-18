import { createClient } from '@/lib/supabase/server'

export default async function InvestorDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Investor Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Welcome back, {user?.email}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <DashboardCard title="Total Committed Capital" value="$0" description="No active commitments" />
        <DashboardCard title="Capital Deployed" value="$0" description="Pending allocation" />
        <DashboardCard title="Current Yield" value="—" description="No active positions" />
        <DashboardCard title="Active Loans" value="0" description="No loan exposure" />
        <DashboardCard title="Distribution History" value="$0" description="No distributions yet" />
        <DashboardCard title="eDocs" value="0" description="No documents available" />
      </div>
    </div>
  )
}

function DashboardCard({
  title,
  value,
  description,
}: {
  title: string
  value: string
  description: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-1">
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <p className="text-2xl font-semibold text-gray-900">{value}</p>
      <p className="text-xs text-gray-400">{description}</p>
    </div>
  )
}
