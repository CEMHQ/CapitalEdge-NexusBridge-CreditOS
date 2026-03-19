import { pgTable, uuid, text, numeric, integer, date, timestamp, boolean, unique } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const funds = pgTable('funds', {
  id:            uuid('id').primaryKey().defaultRandom(),
  fundName:      text('fund_name').notNull().default('NexusBridge Capital LP'),
  fundStatus:    text('fund_status').notNull().default('open'),
  targetSize:    numeric('target_size', { precision: 15, scale: 2 }).notNull().default('50000000'),
  maxCapacity:   numeric('max_capacity', { precision: 15, scale: 2 }).notNull().default('50000000'),
  inceptionDate: date('inception_date'),
  notes:         text('notes'),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().default(sql`NOW()`),
  updatedAt:     timestamp('updated_at', { withTimezone: true }).notNull().default(sql`NOW()`),
  createdBy:     uuid('created_by'),
})

export const fundSubscriptions = pgTable('fund_subscriptions', {
  id:                    uuid('id').primaryKey().defaultRandom(),
  fundId:                uuid('fund_id').notNull(),
  investorId:            uuid('investor_id').notNull(),
  commitmentAmount:      numeric('commitment_amount', { precision: 15, scale: 2 }).notNull(),
  fundedAmount:          numeric('funded_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  subscriptionStatus:    text('subscription_status').notNull().default('pending'),
  reservationStatus:     text('reservation_status').notNull().default('pending'),
  reservationExpiresAt:  timestamp('reservation_expires_at', { withTimezone: true }),
  fcfsPosition:          integer('fcfs_position'),
  reservedAt:            timestamp('reserved_at', { withTimezone: true }),
  confirmedAt:           timestamp('confirmed_at', { withTimezone: true }),
  notes:                 text('notes'),
  createdAt:             timestamp('created_at', { withTimezone: true }).notNull().default(sql`NOW()`),
  updatedAt:             timestamp('updated_at', { withTimezone: true }).notNull().default(sql`NOW()`),
  createdBy:             uuid('created_by'),
})

export const fundAllocations = pgTable('fund_allocations', {
  id:               uuid('id').primaryKey().defaultRandom(),
  subscriptionId:   uuid('subscription_id').notNull(),
  loanId:           uuid('loan_id').notNull(),
  allocationAmount: numeric('allocation_amount', { precision: 15, scale: 2 }).notNull(),
  allocationDate:   date('allocation_date').notNull(),
  allocationStatus: text('allocation_status').notNull().default('active'),
  notes:            text('notes'),
  createdAt:        timestamp('created_at', { withTimezone: true }).notNull().default(sql`NOW()`),
  updatedAt:        timestamp('updated_at', { withTimezone: true }).notNull().default(sql`NOW()`),
  createdBy:        uuid('created_by'),
})

export const navSnapshots = pgTable('nav_snapshots', {
  id:               uuid('id').primaryKey().defaultRandom(),
  fundId:           uuid('fund_id').notNull(),
  snapshotDate:     date('snapshot_date').notNull(),
  totalNav:         numeric('total_nav', { precision: 15, scale: 2 }).notNull(),
  totalCommitted:   numeric('total_committed', { precision: 15, scale: 2 }).notNull().default('0'),
  totalDeployed:    numeric('total_deployed', { precision: 15, scale: 2 }).notNull().default('0'),
  totalDistributed: numeric('total_distributed', { precision: 15, scale: 2 }).notNull().default('0'),
  navPerUnit:       numeric('nav_per_unit', { precision: 15, scale: 6 }).notNull().default('1.000000'),
  loanCount:        integer('loan_count').notNull().default(0),
  investorCount:    integer('investor_count').notNull().default(0),
  notes:            text('notes'),
  createdAt:        timestamp('created_at', { withTimezone: true }).notNull().default(sql`NOW()`),
  updatedAt:        timestamp('updated_at', { withTimezone: true }).notNull().default(sql`NOW()`),
  createdBy:        uuid('created_by'),
})
