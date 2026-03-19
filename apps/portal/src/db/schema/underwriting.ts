import {
  pgTable,
  uuid,
  text,
  numeric,
  integer,
  boolean,
  timestamp,
} from 'drizzle-orm/pg-core'

export const underwritingCases = pgTable('underwriting_cases', {
  id:            uuid('id').primaryKey().defaultRandom(),
  applicationId: uuid('application_id').notNull(),
  assignedTo:    uuid('assigned_to'),
  caseStatus:    text('case_status').notNull().default('open'),
  priority:      text('priority').notNull().default('normal'),
  openedAt:      timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
  closedAt:      timestamp('closed_at', { withTimezone: true }),
  notes:         text('notes'),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:     timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy:     uuid('created_by'),
})

export const underwritingDecisions = pgTable('underwriting_decisions', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  caseId:             uuid('case_id').notNull(),
  decisionType:       text('decision_type').notNull(),
  approvedAmount:     numeric('approved_amount', { precision: 15, scale: 2 }),
  approvedRate:       numeric('approved_rate', { precision: 8, scale: 6 }),
  approvedTermMonths: integer('approved_term_months'),
  approvedLtv:        numeric('approved_ltv', { precision: 6, scale: 4 }),
  approvedLtc:        numeric('approved_ltc', { precision: 6, scale: 4 }),
  conditionsSummary:  text('conditions_summary'),
  decisionNotes:      text('decision_notes'),
  decidedBy:          uuid('decided_by').notNull(),
  decidedAt:          timestamp('decided_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt:          timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:          timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy:          uuid('created_by'),
})

export const conditions = pgTable('conditions', {
  id:            uuid('id').primaryKey().defaultRandom(),
  caseId:        uuid('case_id').notNull(),
  conditionType: text('condition_type').notNull(),
  description:   text('description').notNull(),
  status:        text('status').notNull().default('open'),
  satisfiedAt:   timestamp('satisfied_at', { withTimezone: true }),
  notes:         text('notes'),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:     timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy:     uuid('created_by'),
})

export const riskFlags = pgTable('risk_flags', {
  id:          uuid('id').primaryKey().defaultRandom(),
  caseId:      uuid('case_id').notNull(),
  flagType:    text('flag_type').notNull(),
  severity:    text('severity').notNull().default('medium'),
  description: text('description').notNull(),
  source:      text('source').notNull().default('system'),
  resolved:    boolean('resolved').notNull().default(false),
  resolvedAt:  timestamp('resolved_at', { withTimezone: true }),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy:   uuid('created_by'),
})

export type UnderwritingCase     = typeof underwritingCases.$inferSelect
export type UnderwritingDecision = typeof underwritingDecisions.$inferSelect
export type Condition            = typeof conditions.$inferSelect
export type RiskFlag             = typeof riskFlags.$inferSelect
