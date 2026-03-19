import { pgTable, uuid, text, date, timestamp } from 'drizzle-orm/pg-core'

export const tasks = pgTable('tasks', {
  id:            uuid('id').primaryKey().defaultRandom(),
  taskOwnerType: text('task_owner_type').notNull(),
  taskOwnerId:   uuid('task_owner_id').notNull(),
  assignedTo:    uuid('assigned_to'),
  title:         text('title').notNull(),
  description:   text('description'),
  taskStatus:    text('task_status').notNull().default('open'),
  priority:      text('priority').notNull().default('medium'),
  dueDate:       date('due_date'),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt:   timestamp('completed_at', { withTimezone: true }),
  createdBy:     uuid('created_by'),
})
