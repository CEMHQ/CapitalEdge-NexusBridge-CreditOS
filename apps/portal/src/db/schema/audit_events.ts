import { pgTable, uuid, text, jsonb, inet, timestamp } from 'drizzle-orm/pg-core'

// Partitioned by created_at (monthly) via pg_partman.
// Append-only — no updates or deletes permitted.
export const auditEvents = pgTable('audit_events', {
  id:             uuid('id').notNull().defaultRandom(),
  actorProfileId: uuid('actor_profile_id'),
  eventType:      text('event_type').notNull(),
  entityType:     text('entity_type'),
  entityId:       uuid('entity_id'),
  oldValue:       jsonb('old_value'),
  newValue:       jsonb('new_value'),
  ipAddress:      inet('ip_address'),
  userAgent:      text('user_agent'),
  eventPayload:   jsonb('event_payload'),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
