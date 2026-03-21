import { createClient } from '@/lib/supabase/server'
import { getUserRole } from '@/lib/auth/roles'
import { formatDate } from '@/lib/format'
import CreateTaskForm from '@/components/tasks/CreateTaskForm'
import TaskStatusButton from '@/components/tasks/TaskStatusButton'
import DeleteButton from '@/components/admin/DeleteButton'

const PRIORITY_COLORS: Record<string, string> = {
  low:    'bg-gray-100 text-gray-500',
  medium: 'bg-blue-50 text-blue-600',
  high:   'bg-orange-50 text-orange-700',
  urgent: 'bg-red-50 text-red-700',
}

const STATUS_TABS = ['open', 'in_progress', 'completed', 'cancelled'] as const

export default async function AdminTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const role = await getUserRole(supabase, user!.id)

  const params = await searchParams
  const activeStatus = STATUS_TABS.includes(params.status as typeof STATUS_TABS[number])
    ? params.status!
    : 'open'

  const isAdminOrManager = ['admin', 'manager'].includes(role)

  // Build query — admins see all, others see only their assigned tasks
  let query = supabase
    .from('tasks')
    .select(`
      id, title, description, task_owner_type, task_owner_id,
      task_status, priority, due_date, created_at, completed_at,
      assigned:assigned_to ( id, full_name, email ),
      creator:created_by ( full_name )
    `)
    .eq('task_status', activeStatus)
    .order('priority', { ascending: false })
    .order('due_date', { ascending: true, nullsFirst: false })

  if (!isAdminOrManager) {
    query = query.eq('assigned_to', user!.id)
  }

  const { data: tasks } = await query

  // Staff list for create form assignee dropdown (admin/manager only)
  const { data: staffProfiles } = isAdminOrManager
    ? await supabase
        .from('profiles')
        .select('id, full_name, email')
        .order('full_name')
    : { data: [] }

  // Count per status for tab badges
  const { data: counts } = await supabase
    .from('tasks')
    .select('task_status')
    .then(({ data }) => ({
      data: STATUS_TABS.reduce((acc, s) => {
        acc[s] = (data ?? []).filter((t) => t.task_status === s).length
        return acc
      }, {} as Record<string, number>),
    }))

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Tasks</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isAdminOrManager ? 'All tasks' : 'Your assigned tasks'}
          </p>
        </div>
        {isAdminOrManager && <CreateTaskForm staff={staffProfiles ?? []} />}
      </div>

      {/* Status tabs */}
      <div className="flex gap-2 flex-wrap">
        {STATUS_TABS.map((s) => (
          <a
            key={s}
            href={`/dashboard/admin/tasks?status=${s}`}
            className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${
              s === activeStatus
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {s.replace(/_/g, ' ')}
            {counts[s] > 0 && (
              <span className={`ml-1.5 ${s === activeStatus ? 'text-gray-300' : 'text-gray-400'}`}>
                {counts[s]}
              </span>
            )}
          </a>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Task</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Priority</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Linked To</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Assigned</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Due</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              {isAdminOrManager && <th className="px-5 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {!tasks?.length && (
              <tr>
                <td colSpan={isAdminOrManager ? 7 : 6} className="px-5 py-10 text-center text-sm text-gray-400">
                  No {activeStatus.replace(/_/g, ' ')} tasks.
                </td>
              </tr>
            )}
            {tasks?.map((task) => {
              const assignee = Array.isArray(task.assigned) ? task.assigned[0] : task.assigned
              const isOverdue = task.due_date && task.task_status !== 'completed' && task.task_status !== 'cancelled'
                && new Date(task.due_date) < new Date()

              return (
                <tr key={task.id} className="hover:bg-gray-50 transition-colors align-top">
                  <td className="px-5 py-4 max-w-xs">
                    <p className="font-medium text-gray-900">{task.title}</p>
                    {task.description && (
                      <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{task.description}</p>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${PRIORITY_COLORS[task.priority] ?? 'bg-gray-100 text-gray-600'}`}>
                      {task.priority}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-xs text-gray-500">
                    <p className="capitalize">{task.task_owner_type.replace(/_/g, ' ')}</p>
                    <p className="font-mono text-gray-400">{task.task_owner_id.slice(0, 8)}…</p>
                  </td>
                  <td className="px-5 py-4 text-xs text-gray-600">
                    {assignee ? (
                      <>
                        <p className="font-medium text-gray-900">{assignee.full_name ?? '—'}</p>
                        <p className="text-gray-400">{assignee.email}</p>
                      </>
                    ) : (
                      <span className="text-gray-400 italic">Unassigned</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-xs">
                    {task.due_date ? (
                      <span className={isOverdue ? 'text-red-600 font-medium' : 'text-gray-500'}>
                        {isOverdue && '⚠ '}{formatDate(task.due_date)}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <TaskStatusButton taskId={task.id} status={task.task_status} />
                  </td>
                  {isAdminOrManager && (
                    <td className="px-5 py-4">
                      <DeleteButton
                        label="Delete"
                        confirmMessage="Delete this task?"
                        onDelete={async () => {
                          const res = await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' })
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
