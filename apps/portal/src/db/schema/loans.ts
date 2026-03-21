import {
  pgTable,
  uuid,
  text,
  numeric,
  integer,
  date,
  timestamp,
} from 'drizzle-orm/pg-core'

export const loans = pgTable('loans', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  applicationId:      uuid('application_id').notNull(),
  loanNumber:         text('loan_number').notNull().unique(),
  loanStatus:         text('loan_status').notNull().default('pending_funding'),
  principalAmount:    numeric('principal_amount', { precision: 15, scale: 2 }).notNull(),
  interestRate:       numeric('interest_rate', { precision: 8, scale: 6 }).notNull(),
  originationFee:     numeric('origination_fee', { precision: 15, scale: 2 }).notNull().default('0'),
  termMonths:         integer('term_months').notNull(),
  paymentType:        text('payment_type').notNull(),
  fundingDate:        date('funding_date'),
  maturityDate:       date('maturity_date'),
  payoffDate:         date('payoff_date'),
  outstandingBalance: numeric('outstanding_balance', { precision: 15, scale: 2 }).notNull(),
  accruedInterest:    numeric('accrued_interest', { precision: 15, scale: 2 }).notNull().default('0'),
  totalPaid:          numeric('total_paid', { precision: 15, scale: 2 }).notNull().default('0'),
  notes:              text('notes'),
  createdAt:          timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:          timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy:          uuid('created_by'),
})

export const paymentSchedule = pgTable('payment_schedule', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  loanId:             uuid('loan_id').notNull(),
  periodNumber:       integer('period_number').notNull(),
  dueDate:            date('due_date').notNull(),
  scheduledPrincipal: numeric('scheduled_principal', { precision: 15, scale: 2 }).notNull().default('0'),
  scheduledInterest:  numeric('scheduled_interest', { precision: 15, scale: 2 }).notNull().default('0'),
  scheduledTotal:     numeric('scheduled_total', { precision: 15, scale: 2 }).notNull(),
  scheduleStatus:     text('schedule_status').notNull().default('scheduled'),
  createdAt:          timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:          timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy:          uuid('created_by'),
})

export const payments = pgTable('payments', {
  id:                uuid('id').primaryKey().defaultRandom(),
  loanId:            uuid('loan_id').notNull(),
  paymentScheduleId: uuid('payment_schedule_id'),
  paymentDate:       date('payment_date').notNull(),
  paymentAmount:     numeric('payment_amount', { precision: 15, scale: 2 }).notNull(),
  principalApplied:  numeric('principal_applied', { precision: 15, scale: 2 }).notNull().default('0'),
  interestApplied:   numeric('interest_applied', { precision: 15, scale: 2 }).notNull().default('0'),
  feesApplied:       numeric('fees_applied', { precision: 15, scale: 2 }).notNull().default('0'),
  paymentMethod:     text('payment_method'),
  externalReference: text('external_reference'),
  notes:             text('notes'),
  createdAt:         timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:         timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy:         uuid('created_by'),
})

export const draws = pgTable('draws', {
  id:          uuid('id').primaryKey().defaultRandom(),
  loanId:      uuid('loan_id').notNull(),
  drawAmount:  numeric('draw_amount', { precision: 15, scale: 2 }).notNull(),
  drawStatus:  text('draw_status').notNull().default('pending'),
  description: text('description'),
  approvedBy:  uuid('approved_by'),
  approvedAt:  timestamp('approved_at', { withTimezone: true }),
  fundedAt:    timestamp('funded_at', { withTimezone: true }),
  notes:       text('notes'),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy:   uuid('created_by'),
})

export type Loan            = typeof loans.$inferSelect
export type PaymentSchedule = typeof paymentSchedule.$inferSelect
export type Payment         = typeof payments.$inferSelect
export type Draw            = typeof draws.$inferSelect
