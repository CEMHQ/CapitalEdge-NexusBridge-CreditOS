import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core'

export const accreditationRecords = pgTable('accreditation_records', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  investorId:           uuid('investor_id').notNull(),
  verificationMethod:   text('verification_method').notNull(),
  provider:             text('provider').notNull().default('manual'),
  providerReferenceId:  text('provider_reference_id'),
  status:               text('status').notNull().default('pending'),
  verifiedAt:           timestamp('verified_at', { withTimezone: true }),
  expiresAt:            timestamp('expires_at', { withTimezone: true }),
  evidenceDocumentId:   uuid('evidence_document_id'),
  reviewerNotes:        text('reviewer_notes'),
  reviewedBy:           uuid('reviewed_by'),
  reviewedAt:           timestamp('reviewed_at', { withTimezone: true }),
  createdAt:            timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:            timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy:            uuid('created_by'),
})
