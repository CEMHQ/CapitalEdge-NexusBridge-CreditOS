import { pgTable, uuid, text, jsonb, timestamp } from 'drizzle-orm/pg-core'

// Partitioned by created_at (weekly) via pg_partman.
export const activityLogs = pgTable('activity_logs', {
  id:             uuid('id').notNull().defaultRandom(),
  actorProfileId: uuid('actor_profile_id'),
  entityType:     text('entity_type').notNull(),
  entityId:       uuid('entity_id').notNull(),
  action:         text('action').notNull(),
  metadata:       jsonb('metadata'),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
