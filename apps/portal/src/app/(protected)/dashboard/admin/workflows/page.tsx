import { createClient } from '@/lib/supabase/server'
import { getUserRole } from '@/lib/auth/roles'
import { formatDate } from '@/lib/format'
import { redirect } from 'next/navigation'
import CreateWorkflowForm from '@/components/workflows/CreateWorkflowForm'
import WorkflowToggleButton from '@/components/workflows/WorkflowToggleButton'
import DeleteButton from '@/components/admin/DeleteButton'

const EVENT_TYPE_LABELS: Record<string, string> = {
  application_status_changed:   'Application status changed',
  document_uploaded:            'Document uploaded',
  document_reviewed:            'Document reviewed',
  payment_received:             'Payment received',
  loan_status_changed:          'Loan status changed',
  condition_updated:            'Condition updated',
  subscription_status_changed:  'Subscription status changed',
}

export default async function WorkflowsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const role = await getUserRole(supabase, user!.id)

  if (!['admin', 'manager'].includes(role)) redirect('/dashboard/admin')

  const isAdmin = role === 'admin'

  const { data: triggers } = await supabase
    .from('workflow_triggers')
    .select(`
      id, name, description, event_type, conditions, actions, is_active, created_at,
      creator:created_by ( full_name )
    `)
    .order('created_at', { ascending: false })

  // Execution counts per trigger
  const { data: execCounts } = await supabase
    .from('workflow_executions')
    .select('trigger_id, execution_status')

  const countMap: Record<string, { total: number; failed: number }> = {}
  for (const ex of execCounts ?? []) {
    if (!countMap[ex.trigger_id]) countMap[ex.trigger_id] = { total: 0, failed: 0 }
    countMap[ex.trigger_id].total++
    if (ex.execution_status !== 'success') countMap[ex.trigger_id].failed++
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Workflow Automation</h1>
          <p className="text-sm text-gray-500 mt-1">
            Event-driven triggers that automate task creation, notifications, and case assignment.
          </p>
        </div>
        {isAdmin && <CreateWorkflowForm />}
      </div>

      {/* Info callout */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
        <strong>How it works:</strong> When an event fires (e.g. an application moves to{' '}
        <code className="bg-blue-100 px-1 rounded">under_review</code>), the engine checks each active trigger.
        If the event matches the trigger&apos;s conditions, the configured actions execute automatically.
        Disable a trigger to pause it without deleting it.
      </div>

      {/* Triggers table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Trigger</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Event</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Conditions</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Executions</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Active</th>
              {isAdmin && <th className="px-5 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {!triggers?.length && (
              <tr>
                <td colSpan={isAdmin ? 7 : 6} className="px-5 py-10 text-center text-sm text-gray-400">
                  No workflow triggers yet. Click &ldquo;New Workflow&rdquo; to create one.
                </td>
              </tr>
            )}
            {triggers?.map((trigger) => {
              const creator = Array.isArray(trigger.creator) ? trigger.creator[0] : trigger.creator
              const counts = countMap[trigger.id] ?? { total: 0, failed: 0 }
              const actions = (trigger.actions ?? []) as Array<{ type: string }>
              const conditions = trigger.conditions as Record<string, unknown>
              const conditionKeys = Object.keys(conditions)

              return (
                <tr key={trigger.id} className="hover:bg-gray-50 transition-colors align-top">
                  <td className="px-5 py-4 max-w-xs">
                    <p className="font-medium text-gray-900">{trigger.name}</p>
                    {trigger.description && (
                      <p className="text-xs text-gray-400 mt-0.5">{trigger.description}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      Created {formatDate(trigger.created_at)}
                      {creator?.full_name ? ` · ${creator.full_name}` : ''}
                    </p>
                  </td>
                  <td className="px-5 py-4">
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                      {EVENT_TYPE_LABELS[trigger.event_type] ?? trigger.event_type}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-xs text-gray-500">
                    {conditionKeys.length === 0 ? (
                      <span className="text-gray-400 italic">Any</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {conditionKeys.map((k) => (
                          <li key={k}>
                            <span className="font-mono text-gray-700">{k}</span>
                            {' = '}
                            <span className="font-mono text-blue-700">{String(conditions[k])}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-5 py-4 text-xs text-gray-500">
                    <ul className="space-y-0.5">
                      {actions.map((a, i) => (
                        <li key={i} className="capitalize">{a.type.replace(/_/g, ' ')}</li>
                      ))}
                    </ul>
                  </td>
                  <td className="px-5 py-4 text-xs">
                    {counts.total === 0 ? (
                      <span className="text-gray-400">—</span>
                    ) : (
                      <>
                        <span className="text-gray-700 font-medium">{counts.total}</span>
                        {counts.failed > 0 && (
                          <span className="ml-1 text-red-500">({counts.failed} failed)</span>
                        )}
                      </>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    {isAdmin ? (
                      <WorkflowToggleButton triggerId={trigger.id} isActive={trigger.is_active} />
                    ) : (
                      <span className={`text-xs font-medium ${trigger.is_active ? 'text-green-600' : 'text-gray-400'}`}>
                        {trigger.is_active ? 'Active' : 'Inactive'}
                      </span>
                    )}
                  </td>
                  {isAdmin && (
                    <td className="px-5 py-4">
                      <DeleteButton
                        label="Delete"
                        confirmMessage="Delete this workflow trigger?"
                        onDelete={async () => {
                          const res = await fetch(`/api/admin/workflows/${trigger.id}`, { method: 'DELETE' })
                          const data = await res.json()
                          if (!res.ok) return { error: data.error ?? 'Delete failed' }
                        }}
                        onSuccess={() => { window.location.reload() }}
                      />
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
