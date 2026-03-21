import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/format'
import DeleteUserButton from '@/components/admin/DeleteUserButton'
import EditUserRoleButton from '@/components/admin/EditUserRoleButton'

type UserRole = {
  role: string
}

type UserRow = {
  id: string
  email: string | null
  full_name: string | null
  status: string | null
  created_at: string
  user_roles: UserRole[] | UserRole | null
}

export default async function AdminUsersPage() {
  const supabase = await createClient()

  const [{ data: { user: currentUser } }, { data: users }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from('profiles')
      .select(`id, email, full_name, status, created_at, user_roles(role)`)
      .order('created_at', { ascending: false }),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Users</h1>
        <p className="text-sm text-gray-500 mt-1">{users?.length ?? 0} total users</p>
      </div>

      {/* ── Mobile: card list ───────────────────────────────────────── */}
      <div className="sm:hidden space-y-3">
        {(!users || users.length === 0) && (
          <p className="text-sm text-gray-400 text-center py-8">No users found.</p>
        )}
        {(users as UserRow[] | null)?.map((u) => {
          const roleEntry = Array.isArray(u.user_roles) ? u.user_roles[0] : u.user_roles
          const roleName = roleEntry?.role ?? null
          return (
            <div key={u.id} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{u.full_name ?? '—'}</p>
                  <p className="text-xs text-gray-400 truncate">{u.email ?? '—'}</p>
                </div>
                {roleName ? <RoleBadge role={roleName} /> : <span className="text-xs text-gray-400">—</span>}
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <span className="text-gray-500">Status</span>
                <span>{u.status ? <StatusBadge status={u.status} /> : <span className="text-gray-400">—</span>}</span>
                <span className="text-gray-500">Joined</span>
                <span className="text-gray-700">{formatDate(u.created_at)}</span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                <EditUserRoleButton
                  userId={u.id}
                  currentRole={roleName}
                  isSelf={u.id === currentUser?.id}
                />
                <DeleteUserButton
                  userId={u.id}
                  userEmail={u.email ?? u.id}
                  isSelf={u.id === currentUser?.id}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Desktop: table ──────────────────────────────────────────── */}
      <div className="hidden sm:block bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                Joined
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap" colSpan={2}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(!users || users.length === 0) && (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-sm text-gray-400">
                  No users found.
                </td>
              </tr>
            )}
            {(users as UserRow[] | null)?.map((u) => {
              const roleEntry = Array.isArray(u.user_roles) ? u.user_roles[0] : u.user_roles
              const roleName = roleEntry?.role ?? null

              return (
                <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 whitespace-nowrap">
                    {u.full_name ?? '—'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 whitespace-nowrap">
                    {u.email ?? '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {roleName ? (
                      <RoleBadge role={roleName} />
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {u.status ? (
                      <StatusBadge status={u.status} />
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                    {formatDate(u.created_at)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <EditUserRoleButton
                      userId={u.id}
                      currentRole={roleName}
                      isSelf={u.id === currentUser?.id}
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <DeleteUserButton
                      userId={u.id}
                      userEmail={u.email ?? u.id}
                      isSelf={u.id === currentUser?.id}
                    />
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const colorMap: Record<string, string> = {
    admin: 'bg-purple-50 text-purple-700',
    manager: 'bg-blue-50 text-blue-700',
    underwriter: 'bg-indigo-50 text-indigo-700',
    servicing: 'bg-cyan-50 text-cyan-700',
    investor: 'bg-green-50 text-green-700',
    borrower: 'bg-amber-50 text-amber-700',
  }
  const colors = colorMap[role] ?? 'bg-gray-100 text-gray-600'
  const label = role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  return (
    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${colors}`}>
      {label}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    active: 'bg-green-50 text-green-700',
    inactive: 'bg-gray-100 text-gray-600',
    suspended: 'bg-red-50 text-red-700',
    pending: 'bg-amber-50 text-amber-700',
  }
  const colors = colorMap[status] ?? 'bg-gray-100 text-gray-600'
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  return (
    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${colors}`}>
      {label}
    </span>
  )
}
