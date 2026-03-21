'use client'

import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  Menu,
  X,
  LogOut,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  FileText,
  Users,
  TrendingUp,
  Shield,
  FolderOpen,
  ClipboardCheck,
  UserCog,
  CheckSquare,
  GitBranch,
  ScrollText,
  UserPlus,
  BarChart2,
  Receipt,
  Bell,
  ClipboardList,
  Landmark,
  type LucideIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import type { UserRole } from '@/lib/auth/roles'
import NotificationBell from './NotificationBell'

// ─── Nav link definitions ─────────────────────────────────────────────────────

type NavLink = { label: string; href: string; icon: LucideIcon }

const NAV_LINKS: Record<UserRole, NavLink[]> = {
  borrower: [
    { label: 'Dashboard',       href: '/dashboard/borrower',              icon: LayoutDashboard },
    { label: 'My Applications', href: '/dashboard/borrower/applications', icon: FileText },
    { label: 'Documents',       href: '/dashboard/borrower/documents',    icon: FolderOpen },
    { label: 'Notifications',   href: '/dashboard/notifications',         icon: Bell },
  ],
  investor: [
    { label: 'Dashboard',     href: '/dashboard/investor',            icon: LayoutDashboard },
    { label: 'Portfolio',     href: '/dashboard/investor/portfolio',  icon: BarChart2 },
    { label: 'Statements',    href: '/dashboard/investor/statements', icon: Receipt },
    { label: 'Compliance',    href: '/dashboard/investor/compliance', icon: Shield },
    { label: 'Notifications', href: '/dashboard/notifications',       icon: Bell },
  ],
  admin: [
    { label: 'Dashboard',    href: '/dashboard/admin',             icon: LayoutDashboard },
    { label: 'Applications', href: '/dashboard/admin/applications', icon: FileText },
    { label: 'Investors',    href: '/dashboard/admin/investors',    icon: Users },
    { label: 'Fund',         href: '/dashboard/admin/fund',         icon: TrendingUp },
    { label: 'Compliance',   href: '/dashboard/admin/compliance',   icon: Shield },
    { label: 'Documents',    href: '/dashboard/admin/documents',    icon: FolderOpen },
    { label: 'Underwriting', href: '/dashboard/underwriter',        icon: ClipboardCheck },
    { label: 'Users',        href: '/dashboard/admin/users',        icon: UserCog },
    { label: 'Tasks',        href: '/dashboard/admin/tasks',        icon: CheckSquare },
    { label: 'Workflows',    href: '/dashboard/admin/workflows',    icon: GitBranch },
    { label: 'Audit Log',    href: '/dashboard/admin/audit',        icon: ScrollText },
    { label: 'Invite User',  href: '/dashboard/admin/invite',       icon: UserPlus },
  ],
  manager: [
    { label: 'Dashboard',    href: '/dashboard/admin',              icon: LayoutDashboard },
    { label: 'Applications', href: '/dashboard/admin/applications', icon: FileText },
    { label: 'Investors',    href: '/dashboard/admin/investors',    icon: Users },
    { label: 'Compliance',   href: '/dashboard/admin/compliance',   icon: Shield },
    { label: 'Documents',    href: '/dashboard/admin/documents',    icon: FolderOpen },
    { label: 'Tasks',        href: '/dashboard/admin/tasks',        icon: CheckSquare },
    { label: 'Audit Log',    href: '/dashboard/admin/audit',        icon: ScrollText },
    { label: 'Invite User',  href: '/dashboard/admin/invite',       icon: UserPlus },
  ],
  underwriter: [
    { label: 'Dashboard', href: '/dashboard/underwriter',       icon: LayoutDashboard },
    { label: 'Cases',     href: '/dashboard/underwriter/cases', icon: ClipboardList },
    { label: 'Tasks',     href: '/dashboard/admin/tasks',       icon: CheckSquare },
  ],
  servicing: [
    { label: 'Dashboard', href: '/dashboard/servicing',       icon: LayoutDashboard },
    { label: 'Loans',     href: '/dashboard/servicing/loans', icon: Landmark },
    { label: 'Tasks',     href: '/dashboard/admin/tasks',     icon: CheckSquare },
  ],
}

// Dashboard roots need exact matching so sub-pages don't keep "Dashboard"
// highlighted alongside the active section link.
const EXACT_PATHS = new Set([
  '/dashboard/admin',
  '/dashboard/borrower',
  '/dashboard/investor',
  '/dashboard/underwriter',
  '/dashboard/servicing',
])

// ─── Role badge color map ─────────────────────────────────────────────────────

const ROLE_COLORS: Record<UserRole, string> = {
  admin:       'bg-violet-100 text-violet-700',
  manager:     'bg-blue-100 text-blue-700',
  underwriter: 'bg-amber-100 text-amber-700',
  servicing:   'bg-teal-100 text-teal-700',
  investor:    'bg-emerald-100 text-emerald-700',
  borrower:    'bg-slate-100 text-slate-600',
}

// ─── BrandMark ────────────────────────────────────────────────────────────────

function BrandSquare() {
  return (
    <div className="w-7 h-7 rounded-md bg-gray-900 flex items-center justify-center shrink-0">
      <span className="text-white text-xs font-bold leading-none tracking-tight">NB</span>
    </div>
  )
}

function BrandMark({ collapsed }: { collapsed: boolean }) {
  return (
    <div
      className={[
        'flex items-center border-b border-gray-100 shrink-0',
        collapsed ? 'justify-center px-0 py-5' : 'gap-2.5 px-5 py-5',
      ].join(' ')}
    >
      <BrandSquare />
      {!collapsed && (
        <div className="leading-none overflow-hidden">
          <p className="text-[13px] font-semibold text-gray-900 tracking-tight whitespace-nowrap">NexusBridge</p>
          <p className="text-[10px] text-gray-400 tracking-wide uppercase mt-0.5">CreditOS</p>
        </div>
      )}
    </div>
  )
}

// ─── NavLinks ─────────────────────────────────────────────────────────────────

function NavLinks({
  role,
  collapsed,
  onNavigate,
}: {
  role: UserRole
  collapsed: boolean
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const links = NAV_LINKS[role] ?? []

  return (
    <ul className="space-y-0.5" role="list">
      {links.map((link) => {
        const active = EXACT_PATHS.has(link.href)
          ? pathname === link.href
          : pathname === link.href || pathname.startsWith(link.href + '/')

        const Icon = link.icon

        if (collapsed) {
          return (
            <li key={link.href}>
              <a
                href={link.href}
                onClick={onNavigate}
                title={link.label}
                aria-label={link.label}
                aria-current={active ? 'page' : undefined}
                className={[
                  'flex items-center justify-center w-10 h-10 mx-auto rounded-lg transition-all duration-150',
                  active
                    ? 'bg-gray-900 text-white shadow-sm'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900',
                ].join(' ')}
              >
                <Icon size={18} aria-hidden="true" />
              </a>
            </li>
          )
        }

        return (
          <li key={link.href}>
            <a
              href={link.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={[
                'flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-all duration-150 font-medium',
                active
                  ? 'bg-gray-900 text-white shadow-sm'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900',
              ].join(' ')}
            >
              <Icon size={18} className="shrink-0" aria-hidden="true" />
              <span className="truncate">{link.label}</span>
            </a>
          </li>
        )
      })}
    </ul>
  )
}

// ─── UserFooter ───────────────────────────────────────────────────────────────

function UserFooter({
  user,
  role,
  collapsed,
  onSignOut,
}: {
  user: User
  role: UserRole
  collapsed: boolean
  onSignOut: () => void
}) {
  if (collapsed) {
    return (
      <div className="shrink-0 border-t border-gray-100 py-3 flex flex-col items-center gap-2">
        <NotificationBell />
        <button
          onClick={onSignOut}
          className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut size={16} aria-hidden="true" />
        </button>
      </div>
    )
  }

  return (
    <div className="shrink-0 border-t border-gray-100 px-4 py-4">
      {/* Top row: bell + role badge */}
      <div className="flex items-center justify-between mb-3">
        <NotificationBell />
        <span
          className={[
            'text-[11px] font-medium px-2 py-0.5 rounded-full capitalize',
            ROLE_COLORS[role] ?? 'bg-gray-100 text-gray-600',
          ].join(' ')}
        >
          {role}
        </span>
      </div>

      {/* Email row */}
      <p
        className="text-xs text-gray-500 truncate mb-3 leading-none"
        title={user.email ?? ''}
      >
        {user.email}
      </p>

      {/* Sign out */}
      <button
        onClick={onSignOut}
        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors"
      >
        <LogOut size={13} aria-hidden="true" />
        Sign out
      </button>
    </div>
  )
}

// ─── CollapseToggle ───────────────────────────────────────────────────────────

function CollapseToggle({
  collapsed,
  onToggle,
}: {
  collapsed: boolean
  onToggle: () => void
}) {
  return (
    <div className="shrink-0 border-t border-gray-100 flex justify-center py-2">
      <button
        onClick={onToggle}
        className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed
          ? <ChevronRight size={15} aria-hidden="true" />
          : <ChevronLeft size={15} aria-hidden="true" />
        }
      </button>
    </div>
  )
}

// ─── SidebarContent ───────────────────────────────────────────────────────────

function SidebarContent({
  role,
  user,
  collapsed,
  onNavigate,
  showToggle = false,
  onSignOut,
  onToggleCollapse,
}: {
  role: UserRole
  user: User
  collapsed: boolean
  onNavigate?: () => void
  showToggle?: boolean
  onSignOut: () => void
  onToggleCollapse?: () => void
}) {
  return (
    <>
      <nav className="flex-1 overflow-y-auto py-3 scrollbar-none" style={{ padding: collapsed ? '12px 6px' : '12px' }}>
        <NavLinks role={role} collapsed={collapsed} onNavigate={onNavigate} />
      </nav>
      <UserFooter user={user} role={role} collapsed={collapsed} onSignOut={onSignOut} />
      {showToggle && onToggleCollapse && (
        <CollapseToggle collapsed={collapsed} onToggle={onToggleCollapse} />
      )}
    </>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DashboardNav({ user, role }: { user: User; role: UserRole }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  // Initialize collapsed state directly from matchMedia — no setState in effect
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(min-width: 640px) and (max-width: 1023px)').matches
  })

  const router = useRouter()
  const supabase = createClient()

  // Subscribe to viewport changes — no setState in effect body
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px) and (max-width: 1023px)')
    const handler = () => setIsCollapsed(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      {/* ── Desktop + Tablet sidebar (sm+) ───────────────────────────────── */}
      <aside
        className={[
          'hidden sm:flex flex-col shrink-0 bg-white border-r border-gray-100 sticky top-0 h-screen overflow-hidden',
          'transition-all duration-200 ease-in-out',
          isCollapsed ? 'w-16' : 'w-60',
        ].join(' ')}
      >
        <BrandMark collapsed={isCollapsed} />
        <SidebarContent
          role={role}
          user={user}
          collapsed={isCollapsed}
          showToggle
          onSignOut={handleSignOut}
          onToggleCollapse={() => setIsCollapsed((c) => !c)}
        />
      </aside>

      {/* ── Mobile top bar (< sm) ─────────────────────────────────────────── */}
      <header className="sm:hidden sticky top-0 z-40 bg-white border-b border-gray-100">
        <div className="flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-gray-900 flex items-center justify-center shrink-0">
              <span className="text-white text-[10px] font-bold leading-none">NB</span>
            </div>
            <span className="text-sm font-semibold text-gray-900 tracking-tight">NexusBridge</span>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <button
              onClick={() => setMobileOpen(true)}
              className="p-1.5 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
              aria-label="Open navigation menu"
            >
              <Menu size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      {/* ── Mobile drawer (< sm) ─────────────────────────────────────────── */}
      {mobileOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm sm:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer panel */}
          <aside className="fixed inset-y-0 left-0 z-50 w-72 bg-white shadow-2xl flex flex-col sm:hidden">
            {/* Drawer header */}
            <div className="flex items-center justify-between border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2.5 px-5 py-5">
                <BrandSquare />
                <div className="leading-none">
                  <p className="text-[13px] font-semibold text-gray-900 tracking-tight">NexusBridge</p>
                  <p className="text-[10px] text-gray-400 tracking-wide uppercase mt-0.5">CreditOS</p>
                </div>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="mr-4 p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                aria-label="Close navigation menu"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <SidebarContent
              role={role}
              user={user}
              collapsed={false}
              onNavigate={() => setMobileOpen(false)}
              onSignOut={handleSignOut}
            />
          </aside>
        </>
      )}
    </>
  )
}
