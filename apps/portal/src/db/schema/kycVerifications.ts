import { pgTable, uuid, text, integer, jsonb, timestamp } from 'drizzle-orm/pg-core'

export const kycVerifications = pgTable('kyc_verifications', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  entityType:           text('entity_type').notNull(),
  entityId:             uuid('entity_id').notNull(),
  provider:             text('provider').notNull().default('manual'),
  providerReferenceId:  text('provider_reference_id'),
  verificationType:     text('verification_type').notNull().default('identity'),
  status:               text('status').notNull().default('pending'),
  resultJson:           jsonb('result_json'),
  failureReason:        text('failure_reason'),
  verifiedAt:           timestamp('verified_at', { withTimezone: true }),
  expiresAt:            timestamp('expires_at', { withTimezone: true }),
  retryCount:           integer('retry_count').notNull().default(0),
  maxRetries:           integer('max_retries').notNull().default(3),
  createdAt:            timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:            timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy:            uuid('created_by'),
})
