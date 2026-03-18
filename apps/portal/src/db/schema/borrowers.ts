import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core'
import { profiles } from './profiles'

export const borrowers = pgTable('borrowers', {
  id: uuid('id').primaryKey().defaultRandom(),
  profile_id: uuid('profile_id').notNull().references(() => profiles.id),
  borrower_type: text('borrower_type').notNull().default('individual'), // individual, entity
  onboarding_status: text('onboarding_status').notNull().default('pending'), // pending, active, blocked
  kyc_status: text('kyc_status').notNull().default('not_started'), // not_started, pending, verified, rejected
  aml_status: text('aml_status').notNull().default('not_started'), // not_started, pending, cleared, flagged
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
