import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { emitNotification } from '@/lib/notifications/emit'

// ─── Types ────────────────────────────────────────────────────────────────────

export type WorkflowEventType =
  | 'application_status_changed'
  | 'document_uploaded'
  | 'document_reviewed'
  | 'payment_received'
  | 'loan_status_changed'
  | 'condition_updated'
  | 'subscription_status_changed'

export type WorkflowActionType =
  | 'create_task'
  | 'send_notification'
  | 'assign_case'

interface WorkflowAction {
  type: WorkflowActionType
  // create_task params
  title?: string
  description?: string
  task_owner_type?: string
  task_owner_type_from?: string   // pulls value from event payload key
  task_owner_id_from?: string     // pulls value from event payload key
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  due_days?: number
  assigned_to_from?: string       // pulls assignee UUID from event payload key
  // send_notification params
  recipient_id_from?: string
  message_template?: string
  link_url?: string
  // assign_case params
  case_id_from?: string
  assignee_from?: string
}

interface ActionResult {
  type: string
  status: 'success' | 'failed'
  result?: Record<string, unknown>
  error?: string
}

// ─── Condition evaluation ─────────────────────────────────────────────────────

function conditionsMatch(
  conditions: Record<string, unknown>,
  payload: Record<string, unknown>
): boolean {
  for (const [key, expected] of Object.entries(conditions)) {
    if (payload[key] !== expected) return false
  }
  return true
}

// ─── Resolve a value from the payload or use a literal ───────────────────────

function resolveFrom(
  payload: Record<string, unknown>,
  fromKey: string | undefined,
  literal: unknown
): unknown {
  if (fromKey) return payload[fromKey]
  return literal
}

// ─── Action executors ─────────────────────────────────────────────────────────

async function executeCreateTask(
  action: WorkflowAction,
  payload: Record<string, unknown>
): Promise<ActionResult> {
  try {
    const adminClient = createAdminClient()

    const ownerType = String(
      resolveFrom(payload, action.task_owner_type_from, action.task_owner_type) ?? ''
    )
    const ownerId = String(
      resolveFrom(payload, action.task_owner_id_from, null) ?? ''
    )
    const assignedTo = action.assigned_to_from
      ? (payload[action.assigned_to_from] as string | undefined) ?? null
      : null

    if (!ownerType || !ownerId) {
      return { type: 'create_task', status: 'failed', error: 'Missing task_owner_type or task_owner_id' }
    }

    let dueDate: string | null = null
    if (action.due_days) {
      const d = new Date()
      d.setDate(d.getDate() + action.due_days)
      dueDate = d.toISOString().slice(0, 10)
    }

    const { data, error } = await adminClient.from('tasks').insert({
      task_owner_type: ownerType,
      task_owner_id:   ownerId,
      title:           action.title ?? 'Automated task',
      description:     action.description ?? null,
      priority:        action.priority ?? 'medium',
      due_date:        dueDate,
      assigned_to:     assignedTo,
      task_status:     'open',
      created_by:      null, // system-generated
    }).select('id').single()

    if (error) return { type: 'create_task', status: 'failed', error: error.message }
    return { type: 'create_task', status: 'success', result: { task_id: data.id } }
  } catch (err) {
    return { type: 'create_task', status: 'failed', error: String(err) }
  }
}

async function executeSendNotification(
  action: WorkflowAction,
  payload: Record<string, unknown>
): Promise<ActionResult> {
  try {
    const recipientId = action.recipient_id_from
      ? (payload[action.recipient_id_from] as string | undefined)
      : undefined

    if (!recipientId) {
      return { type: 'send_notification', status: 'failed', error: 'Missing recipient_id' }
    }

    const message = action.message_template ?? 'A workflow action was triggered.'
    await emitNotification({
      recipientProfileId: recipientId,
      subject: 'Workflow Notification',
      message,
      linkUrl: action.link_url,
    })

    return { type: 'send_notification', status: 'success' }
  } catch (err) {
    return { type: 'send_notification', status: 'failed', error: String(err) }
  }
}

async function executeAssignCase(
  action: WorkflowAction,
  payload: Record<string, unknown>
): Promise<ActionResult> {
  try {
    const adminClient = createAdminClient()
    const caseId = action.case_id_from
      ? (payload[action.case_id_from] as string | undefined)
      : undefined
    const assigneeId = action.assignee_from
      ? (payload[action.assignee_from] as string | undefined)
      : undefined

    if (!caseId || !assigneeId) {
      return { type: 'assign_case', status: 'failed', error: 'Missing case_id or assignee' }
    }

    const { error } = await adminClient
      .from('underwriting_cases')
      .update({ assigned_to: assigneeId })
      .eq('id', caseId)

    if (error) return { type: 'assign_case', status: 'failed', error: error.message }
    return { type: 'assign_case', status: 'success', result: { case_id: caseId } }
  } catch (err) {
    return { type: 'assign_case', status: 'failed', error: String(err) }
  }
}

// ─── Main engine function ─────────────────────────────────────────────────────

export async function fireWorkflowTrigger(
  eventType: WorkflowEventType,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const adminClient = createAdminClient()

    // Fetch active triggers for this event type
    const { data: triggers, error: fetchError } = await adminClient
      .from('workflow_triggers')
      .select('id, conditions, actions')
      .eq('event_type', eventType)
      .eq('is_active', true)

    if (fetchError || !triggers?.length) return

    for (const trigger of triggers) {
      const conditions = (trigger.conditions ?? {}) as Record<string, unknown>
      const actions = (trigger.actions ?? []) as WorkflowAction[]

      if (!conditionsMatch(conditions, payload)) continue

      const startMs = Date.now()
      const actionResults: ActionResult[] = []

      for (const action of actions) {
        let result: ActionResult
        switch (action.type) {
          case 'create_task':
            result = await executeCreateTask(action, payload)
            break
          case 'send_notification':
            result = await executeSendNotification(action, payload)
            break
          case 'assign_case':
            result = await executeAssignCase(action, payload)
            break
          default:
            result = { type: action.type, status: 'failed', error: 'Unknown action type' }
        }
        actionResults.push(result)
      }

      const durationMs = Date.now() - startMs
      const anyFailed = actionResults.some((r) => r.status === 'failed')
      const allFailed = actionResults.every((r) => r.status === 'failed')
      const executionStatus = allFailed ? 'failed' : anyFailed ? 'partial_failure' : 'success'

      // Log execution — fire-and-forget, do not block
      void adminClient.from('workflow_executions').insert({
        trigger_id:       trigger.id,
        event_payload:    payload,
        execution_status: executionStatus,
        actions_executed: actionResults,
        duration_ms:      durationMs,
      })
    }
  } catch (err) {
    // Never throw — workflow failures must not block the triggering request
    console.error('[workflow] fireWorkflowTrigger error:', err)
  }
}
