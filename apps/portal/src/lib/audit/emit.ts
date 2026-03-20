import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

export type AuditEventType =
  | 'loan_status_change'
  | 'loan_created'
  | 'application_status_change'
  | 'underwriting_decision'
  | 'underwriting_assigned'
  | 'condition_updated'
  | 'document_action'
  | 'payment_recorded'
  | 'draw_action'
  | 'distribution_issued'
  | 'capital_call_issued'
  | 'subscription_action'
  | 'override'
  | 'permission_change'
  | 'user_invited'
  | 'user_deleted'
  | 'user_updated'
  | 'investor_updated'
  | 'investor_deleted'
  | 'workflow_created'
  | 'workflow_updated'
  | 'workflow_deleted'
  | 'workflow_triggered'
  | 'signature_sent'
  | 'signature_completed'
  | 'signature_declined'
  | 'signature_voided'
  | 'signature_resent'

export type AuditEntityType =
  | 'loan'
  | 'application'
  | 'document'
  | 'subscription'
  | 'fund'
  | 'user'
  | 'investor'
  | 'underwriting_case'
  | 'underwriting_decision'
  | 'payment'
  | 'draw'
  | 'condition'
  | 'distribution'
  | 'workflow_trigger'
  | 'workflow_execution'
  | 'signature_request'

export interface AuditEventParams {
  actorProfileId: string | null
  eventType: AuditEventType
  entityType?: AuditEntityType
  entityId?: string
  oldValue?: Record<string, unknown>
  newValue?: Record<string, unknown>
  ipAddress?: string
  userAgent?: string
  eventPayload?: Record<string, unknown>
}

// Inserts an immutable audit event using the service role client (bypasses RLS).
// Called server-side only — never from client components.
// Fire-and-forget: errors are logged but do not throw to avoid blocking the main operation.
export async function emitAuditEvent(params: AuditEventParams): Promise<void> {
  try {
    const adminClient = createAdminClient()
    await adminClient.from('audit_events').insert({
      actor_profile_id: params.actorProfileId,
      event_type: params.eventType,
      entity_type: params.entityType ?? null,
      entity_id: params.entityId ?? null,
      old_value: params.oldValue ?? null,
      new_value: params.newValue ?? null,
      ip_address: params.ipAddress ?? null,
      user_agent: params.userAgent ?? null,
      event_payload: params.eventPayload ?? null,
    })
  } catch (err) {
    // Audit failure must not block the main operation — log and continue
    console.error('[audit] Failed to emit audit event:', err)
  }
}
