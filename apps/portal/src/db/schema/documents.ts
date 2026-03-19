import { pgTable, uuid, text, bigint, timestamp, date } from 'drizzle-orm/pg-core'

export const documents = pgTable('documents', {
  id:              uuid('id').primaryKey().defaultRandom(),
  ownerType:       text('owner_type').notNull(),
  ownerId:         uuid('owner_id').notNull(),
  documentType:    text('document_type').notNull(),
  fileName:        text('file_name').notNull(),
  storagePath:     text('storage_path').notNull(),
  mimeType:        text('mime_type').notNull(),
  fileSizeBytes:   bigint('file_size_bytes', { mode: 'number' }).notNull(),
  uploadStatus:    text('upload_status').notNull().default('pending'),
  reviewStatus:    text('review_status').notNull().default('pending_review'),
  rejectionReason: text('rejection_reason'),
  reviewedBy:      uuid('reviewed_by'),
  reviewedAt:      timestamp('reviewed_at', { withTimezone: true }),
  expiresAt:       timestamp('expires_at', { withTimezone: true }),
  uploadedBy:      uuid('uploaded_by').notNull(),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const documentRequests = pgTable('document_requests', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  requestOwnerType:    text('request_owner_type').notNull(),
  requestOwnerId:      uuid('request_owner_id').notNull(),
  documentType:        text('document_type').notNull(),
  requestStatus:       text('request_status').notNull().default('open'),
  dueDate:             date('due_date'),
  fulfilledDocumentId: uuid('fulfilled_document_id'),
  notes:               text('notes'),
  createdAt:           timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:           timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy:           uuid('created_by'),
})
