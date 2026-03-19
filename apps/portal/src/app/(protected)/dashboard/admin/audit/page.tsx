import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/format'
import Link from 'next/link'

const EVENT_TYPES = [
  'application_status_change',
  'document_action',
  'underwriting_decision',
  'underwriting_assigned',
  'condition_updated',
  'loan_created',
  'loan_status_change',
  'payment_recorded',
  'draw_action',
  'subscription_action',
  'distribution_issued',
  'capital_call_issued',
  'user_invited',
  'user_deleted',
  'user_updated',
  'investor_updated',
  'investor_deleted',
  'override',
  'permission_change',
] as const

const ENTITY_TYPES = [
  'application', 'document', 'loan', 'payment', 'draw',
  'subscription', 'fund', 'user', 'investor',
  'underwriting_case', 'underwriting_decision', 'condition', 'distribution',
] as const

const ENTITY_LINKS: Record<string, (id: string) => string> = {
  application:  (id) => `/dashboard/admin/applications/${id}`,
  document:     (id) => `/dashboard/admin/documents/${id}`,
  loan:         (id) => `/dashboard/servicing/loans/${id}`,
  user:         ()   => `/dashboard/admin/users`,
  investor:     ()   => `/dashboard/admin/investors`,
}

function eventTypeBadgeColor(type: string): string {
  if (type.includes('delete') || type.includes('declined')) return 'bg-red-50 text-red-700'
  if (type.includes('status_change') || type.includes('updated')) return 'bg-blue-50 text-blue-700'
  if (type.includes('created') || type.includes('invited')) return 'bg-green-50 text-green-700'
  if (type.includes('decision') || type.includes('override')) return 'bg-purple-50 text-purple-700'
  return 'bg-gray-100 text-gray-600'
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{
    event_type?: string
    entity_type?: string
    date_from?: string
    date_to?: string
    page?: string
  }>
}) {
  const supabase = await createClient()
  const params = await searchParams

  const eventTypeFilter  = params.event_type  || null
  const entityTypeFilter = params.entity_type || null
  const dateFrom         = params.date_from   || null
  const dateTo           = params.date_to     || null
  const page             = Math.max(1, parseInt(params.page ?? '1', 10))
  const pageSize         = 50
  const offset           = (page - 1) * pageSize

  let query = supabase
    .from('audit_events')
    .select(`
      id, event_type, entity_type, entity_id,
      old_value, new_value, event_payload,
      created_at,
      profiles!actor_profile_id ( full_name, email )
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1)

  if (eventTypeFilter)  query = query.eq('event_type', eventTypeFilter)
  if (entityTypeFilter) query = query.eq('entity_type', entityTypeFilter)
  if (dateFrom)         query = query.gte('created_at', dateFrom)
  if (dateTo)           query = query.lte('created_at', dateTo + 'T23:59:59Z')

  const { data: events, count } = await query
  const totalPages = Math.ceil((count ?? 0) / pageSize)

  function buildUrl(overrides: Record<string, string | null>) {
    const p = new URLSearchParams()
    const merged = {
      event_type:  eventTypeFilter,
      entity_type: entityTypeFilter,
      date_from:   dateFrom,
      date_to:     dateTo,
      page:        String(page),
      ...overrides,
    }
    for (const [k, v] of Object.entries(merged)) {
      if (v) p.set(k, v)
    }
    return `/dashboard/admin/audit?${p.toString()}`
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Audit Log</h1>
        <p className="text-sm text-gray-500 mt-1">{count ?? 0} events</p>
      </div>

      {/* Filters */}
      <form method="GET" action="/dashboard/admin/audit" className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-500">Event Type</label>
          <select
            name="event_type"
            defaultValue={eventTypeFilter ?? ''}
            className="block border border-gray-300 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
          >
            <option value="">All events</option>
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-500">Entity Type</label>
          <select
            name="entity_type"
            defaultValue={entityTypeFilter ?? ''}
            className="block border border-gray-300 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
          >
            <option value="">All entities</option>
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-500">From</label>
          <input
            type="date" name="date_from"
            defaultValue={dateFrom ?? ''}
            className="block border border-gray-300 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-500">To</label>
          <input
            type="date" name="date_to"
            defaultValue={dateTo ?? ''}
            className="block border border-gray-300 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
          />
        </div>
        <button
          type="submit"
          className="px-3 py-1.5 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700 transition-colors"
        >
          Filter
        </button>
        {(eventTypeFilter || entityTypeFilter || dateFrom || dateTo) && (
          <a
            href="/dashboard/admin/audit"
            className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-800 underline"
          >
            Clear
          </a>
        )}
      </form>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Time</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actor</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Event</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Entity</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {!events?.length && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-sm text-gray-400">
                  No audit events found.
                </td>
              </tr>
            )}
            {events?.map((ev) => {
              const actor   = Array.isArray(ev.profiles) ? ev.profiles[0] : ev.profiles
              const payload = ev.event_payload ?? ev.new_value ?? ev.old_value
              const entityLink = ev.entity_type && ev.entity_id
                ? ENTITY_LINKS[ev.entity_type]?.(ev.entity_id)
                : null

              return (
                <tr key={ev.id} className="hover:bg-gray-50 transition-colors align-top">
                  <td className="px-5 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {formatDate(ev.created_at)}
                  </td>
                  <td className="px-5 py-3">
                    {actor ? (
                      <>
                        <p className="text-xs font-medium text-gray-900">{actor.full_name ?? '—'}</p>
                        <p className="text-xs text-gray-400">{actor.email}</p>
                      </>
                    ) : (
                      <span className="text-xs text-gray-400 italic">System</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${eventTypeBadgeColor(ev.event_type)}`}>
                      {ev.event_type.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs">
                    {ev.entity_type && (
                      <p className="text-gray-500 capitalize">{ev.entity_type.replace(/_/g, ' ')}</p>
                    )}
                    {entityLink && ev.entity_id ? (
                      <Link href={entityLink} className="text-gray-400 font-mono hover:underline">
                        {ev.entity_id.slice(0, 8)}…
                      </Link>
                    ) : ev.entity_id ? (
                      <span className="text-gray-400 font-mono">{ev.entity_id.slice(0, 8)}…</span>
                    ) : null}
                  </td>
                  <td className="px-5 py-3 max-w-xs">
                    {payload && (
                      <details className="group">
                        <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-700 list-none">
                          <span className="underline">View payload</span>
                        </summary>
                        <pre className="mt-1 text-[10px] text-gray-600 bg-gray-50 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
                          {JSON.stringify(payload, null, 2)}
                        </pre>
                      </details>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={buildUrl({ page: String(page - 1) })}
                className="px-3 py-1.5 border border-gray-300 rounded-md hover:bg-gray-50 text-xs font-medium"
              >
                ← Previous
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={buildUrl({ page: String(page + 1) })}
                className="px-3 py-1.5 border border-gray-300 rounded-md hover:bg-gray-50 text-xs font-medium"
              >
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
