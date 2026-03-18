import { pgTable, uuid, text, numeric, integer, timestamp } from 'drizzle-orm/pg-core'
import { borrowers } from './borrowers'

export const applications = pgTable('applications', {
  id: uuid('id').primaryKey().defaultRandom(),
  borrower_id: uuid('borrower_id').notNull().references(() => borrowers.id),
  application_number: text('application_number').notNull().unique(),
  loan_purpose: text('loan_purpose').notNull(), // bridge, renovation, contingency, other
  requested_amount: numeric('requested_amount', { precision: 18, scale: 2 }).notNull(),
  requested_term_months: integer('requested_term_months').notNull(),
  exit_strategy: text('exit_strategy').notNull(), // sale, refinance, repayment
  application_status: text('application_status').notNull().default('draft'),
  // draft, submitted, under_review, conditionally_approved, approved, declined, funded, closed
  submitted_at: timestamp('submitted_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
