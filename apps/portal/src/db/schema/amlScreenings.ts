import { pgTable, uuid, text, jsonb, timestamp } from 'drizzle-orm/pg-core'

export const amlScreenings = pgTable('aml_screenings', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  entityType:           text('entity_type').notNull(),
  entityId:             uuid('entity_id').notNull(),
  provider:             text('provider').notNull().default('manual'),
  providerReferenceId:  text('provider_reference_id'),
  screeningType:        text('screening_type').notNull().default('ofac'),
  status:               text('status').notNull().default('pending'),
  resultJson:           jsonb('result_json'),
  matchDetails:         text('match_details'),
  reviewedBy:           uuid('reviewed_by'),
  reviewedAt:           timestamp('reviewed_at', { withTimezone: true }),
  createdAt:            timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:            timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
