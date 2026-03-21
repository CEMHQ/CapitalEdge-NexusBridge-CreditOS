import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUserRole } from '@/lib/auth/roles'
import DashboardNav from '@/components/layout/DashboardNav'

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Fetch role from DB — never from JWT metadata
  const role = await getUserRole(supabase, user.id)

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar (desktop) + mobile top bar rendered by DashboardNav */}
      <DashboardNav user={user} role={role} />

      {/*
        Main content area.
        - lg: takes remaining width beside the fixed sidebar
        - below lg: full width (sidebar is replaced by the mobile top bar)
        - flex-col so the mobile top bar from DashboardNav stacks naturally
      */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* On mobile the sticky top bar is rendered inside DashboardNav above,
            so content starts immediately below it. */}
        <main className="flex-1 p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
