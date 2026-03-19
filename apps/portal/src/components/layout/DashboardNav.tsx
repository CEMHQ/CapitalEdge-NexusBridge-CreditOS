'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import type { UserRole } from '@/lib/auth/roles'

export default function DashboardNav({ user, role }: { user: User; role: UserRole }) {
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center gap-8">
            <span className="text-lg font-semibold text-gray-900">NexusBridge</span>
            <NavLinks role={role} />
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">{user.email}</span>
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full capitalize">
              {role}
            </span>
            <button
              onClick={handleSignOut}
              className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}

function NavLinks({ role }: { role: UserRole }) {
  const links: Record<UserRole, { label: string; href: string }[]> = {
    borrower: [
      { label: 'Dashboard', href: '/dashboard/borrower' },
      { label: 'My Applications', href: '/dashboard/borrower/applications' },
      { label: 'Documents', href: '/dashboard/borrower/documents' },
    ],
    investor: [
      { label: 'Dashboard', href: '/dashboard/investor' },
      { label: 'Portfolio', href: '/dashboard/investor/portfolio' },
      { label: 'Statements', href: '/dashboard/investor/statements' },
    ],
    admin: [
      { label: 'Dashboard', href: '/dashboard/admin' },
      { label: 'Applications', href: '/dashboard/admin/applications' },
      { label: 'Investors', href: '/dashboard/admin/investors' },
      { label: 'Documents', href: '/dashboard/admin/documents' },
      { label: 'Underwriting', href: '/dashboard/underwriter' },
      { label: 'Users', href: '/dashboard/admin/users' },
      { label: 'Invite User', href: '/dashboard/admin/invite' },
    ],
    manager: [
      { label: 'Dashboard', href: '/dashboard/admin' },
      { label: 'Applications', href: '/dashboard/admin/applications' },
      { label: 'Investors', href: '/dashboard/admin/investors' },
      { label: 'Documents', href: '/dashboard/admin/documents' },
      { label: 'Invite User', href: '/dashboard/admin/invite' },
    ],
    underwriter: [
      { label: 'Dashboard', href: '/dashboard/underwriter' },
      { label: 'Cases', href: '/dashboard/underwriter/cases' },
    ],
    servicing: [
      { label: 'Dashboard', href: '/dashboard/servicing' },
      { label: 'Loans', href: '/dashboard/servicing/loans' },
    ],
  }

  return (
    <div className="flex gap-6">
      {links[role]?.map((link) => (
        <a
          key={link.href}
          href={link.href}
          className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          {link.label}
        </a>
      ))}
    </div>
  )
}
