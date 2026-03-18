import type { SupabaseClient } from '@supabase/supabase-js'

export type UserRole =
  | 'borrower'
  | 'investor'
  | 'admin'
  | 'underwriter'
  | 'servicing'
  | 'manager'

// Fetch the authenticated user's role from the user_roles table.
// Falls back to 'borrower' if no row exists (safe default — least privilege).
// Uses the anon client with the user's session so RLS applies.
export async function getUserRole(supabase: SupabaseClient, userId: string): Promise<UserRole> {
  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .single()
  return (data?.role ?? 'borrower') as UserRole
}

// Which roles can access each route prefix
export const ROLE_ROUTE_MAP: Record<string, UserRole[]> = {
  '/dashboard/borrower': ['borrower', 'admin', 'manager'],
  '/dashboard/investor': ['investor', 'admin', 'manager'],
  '/dashboard/admin': ['admin', 'manager'],
  '/dashboard/underwriter': ['underwriter', 'admin', 'manager'],
  '/dashboard/servicing': ['servicing', 'admin', 'manager'],
}

export function getDefaultRoute(role: UserRole): string {
  switch (role) {
    case 'borrower':
      return '/dashboard/borrower'
    case 'investor':
      return '/dashboard/investor'
    case 'admin':
    case 'manager':
      return '/dashboard/admin'
    case 'underwriter':
      return '/dashboard/underwriter'
    case 'servicing':
      return '/dashboard/servicing'
    default:
      return '/login'
  }
}

export function canAccess(role: UserRole, pathname: string): boolean {
  const matchedRoute = Object.keys(ROLE_ROUTE_MAP).find((route) =>
    pathname.startsWith(route)
  )
  if (!matchedRoute) return true // no restriction defined
  return ROLE_ROUTE_MAP[matchedRoute].includes(role)
}
