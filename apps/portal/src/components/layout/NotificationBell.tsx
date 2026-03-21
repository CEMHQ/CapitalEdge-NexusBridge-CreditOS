'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

type Notification = {
  id: string
  subject: string | null
  message: string
  link_url: string | null
  delivery_status: string
  created_at: string
  read_at: string | null
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(true)
  const [dropdownPos, setDropdownPos] = useState<{ top?: number; bottom?: number; left?: number; right?: number }>({ left: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  async function fetchNotifications() {
    try {
      const res = await fetch('/api/notifications')
      if (!res.ok) return
      const data = await res.json() as { notifications: Notification[]; unread: number }
      setNotifications(data.notifications)
      setUnread(data.unread)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchNotifications()
    // Poll every 60 seconds for new notifications
    const interval = setInterval(fetchNotifications, 60000)
    return () => clearInterval(interval)
  }, [])

  const openDropdown = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      const dropdownWidth = 320
      const gap = 8

      const spaceRight = window.innerWidth - rect.right

      if (spaceRight >= dropdownWidth + gap) {
        // Sidebar bell (desktop/tablet) — open to the right, anchored above the bell
        setDropdownPos({
          bottom: window.innerHeight - rect.top + gap,
          left: rect.right + gap,
        })
      } else {
        // Mobile header bell — open below the bell, pinned 8px from right edge
        setDropdownPos({
          top: rect.bottom + gap,
          right: gap,
        })
      }
    }
    setOpen((o) => !o)
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  async function markAllRead() {
    await fetch('/api/notifications', { method: 'PATCH' })
    setNotifications((prev) => prev.map((n) => ({ ...n, delivery_status: 'read' })))
    setUnread(0)
  }

  async function handleClick(n: Notification) {
    if (n.delivery_status !== 'read') {
      await fetch(`/api/notifications/${n.id}`, { method: 'PATCH' })
      setNotifications((prev) =>
        prev.map((x) => x.id === n.id ? { ...x, delivery_status: 'read' } : x)
      )
      setUnread((prev) => Math.max(0, prev - 1))
    }
    if (n.link_url) {
      setOpen(false)
      window.location.href = n.link_url
    }
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={openDropdown}
        className="relative p-1.5 text-gray-500 hover:text-gray-900 transition-colors"
        aria-label="Notifications"
      >
        {/* Bell icon */}
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={dropdownRef}
          style={{ top: dropdownPos.top, bottom: dropdownPos.bottom, left: dropdownPos.left, right: dropdownPos.right }}
          className="fixed w-80 max-w-[calc(100vw-16px)] bg-white rounded-xl border border-gray-200 shadow-lg z-[200] overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-900">Notifications</span>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-gray-500 hover:text-gray-800 underline"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-gray-100">
            {loading && (
              <p className="px-4 py-6 text-sm text-center text-gray-400">Loading…</p>
            )}
            {!loading && notifications.length === 0 && (
              <p className="px-4 py-6 text-sm text-center text-gray-400">No notifications yet.</p>
            )}
            {notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${
                  n.delivery_status !== 'read' ? 'bg-blue-50/40' : ''
                }`}
              >
                <div className="flex items-start gap-2">
                  {n.delivery_status !== 'read' && (
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                  )}
                  <div className={n.delivery_status !== 'read' ? '' : 'pl-3.5'}>
                    {n.subject && (
                      <p className="text-xs font-semibold text-gray-900">{n.subject}</p>
                    )}
                    <p className="text-xs text-gray-700 leading-snug">{n.message}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{timeAgo(n.created_at)}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="px-4 py-2.5 border-t border-gray-100 text-center">
            <a
              href="/dashboard/notifications"
              onClick={() => setOpen(false)}
              className="text-xs text-gray-500 hover:text-gray-800 underline"
            >
              View all notifications
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
