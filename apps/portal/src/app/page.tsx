import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getDefaultRoute, getUserRole } from '@/lib/auth/roles'

export default async function RootPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Fetch role from DB — never from JWT metadata, which can be spoofed
  const role = await getUserRole(supabase, user.id)
  redirect(getDefaultRoute(role))
}
