import { pgTable, uuid, numeric, timestamp } from 'drizzle-orm/pg-core'
import { applications } from './applications'

export const loan_requests = pgTable('loan_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  application_id: uuid('application_id').notNull().references(() => applications.id),
  requested_principal: numeric('requested_principal', { precision: 18, scale: 2 }).notNull(),
  requested_interest_rate: numeric('requested_interest_rate', { precision: 8, scale: 4 }),
  requested_points: numeric('requested_points', { precision: 8, scale: 4 }),
  requested_ltv: numeric('requested_ltv', { precision: 8, scale: 4 }),
  requested_ltc: numeric('requested_ltc', { precision: 8, scale: 4 }),
  requested_dscr: numeric('requested_dscr', { precision: 8, scale: 4 }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
