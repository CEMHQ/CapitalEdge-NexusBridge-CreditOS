import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core'

export const notifications = pgTable('notifications', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  recipientProfileId:  uuid('recipient_profile_id').notNull(),
  notificationType:    text('notification_type').notNull().default('in_app'),
  subject:             text('subject'),
  message:             text('message').notNull(),
  linkUrl:             text('link_url'),
  deliveryStatus:      text('delivery_status').notNull().default('pending'),
  createdAt:           timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  sentAt:              timestamp('sent_at', { withTimezone: true }),
  readAt:              timestamp('read_at', { withTimezone: true }),
})
