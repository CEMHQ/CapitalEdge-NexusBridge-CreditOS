import { pgTable, uuid, text, numeric, timestamp } from 'drizzle-orm/pg-core'

export const investors = pgTable('investors', {
  id: uuid('id').primaryKey().defaultRandom(),
  profileId: uuid('profile_id').notNull().unique(),
  investorType: text('investor_type').notNull().default('individual'),
  accreditationStatus: text('accreditation_status').notNull().default('pending'),
  kycStatus: text('kyc_status').notNull().default('not_started'),
  amlStatus: text('aml_status').notNull().default('not_started'),
  onboardingStatus: text('onboarding_status').notNull().default('pending'),
  // Reg A Tier 2 financial profile — used to compute the 10%-of-income/net-worth limit
  annualIncome: numeric('annual_income', { precision: 15, scale: 2 }),
  netWorth:     numeric('net_worth',     { precision: 15, scale: 2 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
