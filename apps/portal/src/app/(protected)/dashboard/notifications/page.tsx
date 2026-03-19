import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/format'
import MarkAllReadButton from '@/components/notifications/MarkAllReadButton'

export default async function NotificationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: notifications } = await supabase
    .from('notifications')
    .select('id, subject, message, link_url, delivery_status, created_at, read_at')
    .eq('recipient_profile_id', user!.id)
    .order('created_at', { ascending: false })
    .limit(100)

  const all = notifications ?? []
  const unread = all.filter((n) => n.delivery_status !== 'read')

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Notifications</h1>
          <p className="text-sm text-gray-500 mt-1">
            {unread.length} unread · {all.length} total
          </p>
        </div>
        {unread.length > 0 && <MarkAllReadButton />}
      </div>

      {all.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-sm text-gray-400">No notifications yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
          {all.map((n) => (
            <div
              key={n.id}
              className={`px-5 py-4 ${n.delivery_status !== 'read' ? 'bg-blue-50/40' : ''}`}
            >
              <div className="flex items-start gap-3">
                {n.delivery_status !== 'read' && (
                  <span className="mt-1.5 w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                )}
                <div className={`flex-1 ${n.delivery_status !== 'read' ? '' : 'pl-5'}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      {n.subject && (
                        <p className="text-sm font-semibold text-gray-900">{n.subject}</p>
                      )}
                      <p className="text-sm text-gray-700 mt-0.5">{n.message}</p>
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">{formatDate(n.created_at)}</span>
                  </div>
                  {n.link_url && (
                    <a
                      href={n.link_url}
                      className="text-xs text-gray-500 hover:text-gray-800 underline mt-1 inline-block"
                    >
                      View →
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
