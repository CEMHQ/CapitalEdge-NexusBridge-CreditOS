import { pgTable, uuid, text, numeric, timestamp } from 'drizzle-orm/pg-core'
import { applications } from './applications'

export const properties = pgTable('properties', {
  id: uuid('id').primaryKey().defaultRandom(),
  application_id: uuid('application_id').notNull().references(() => applications.id),
  address_line_1: text('address_line_1').notNull(),
  address_line_2: text('address_line_2'),
  city: text('city').notNull(),
  state: text('state').notNull(),
  postal_code: text('postal_code').notNull(),
  property_type: text('property_type').notNull(), // sfh, multifamily, condo, land, mixed_use, commercial
  occupancy_type: text('occupancy_type').notNull(), // owner_occupied, rental, vacant
  current_value: numeric('current_value', { precision: 18, scale: 2 }),
  arv_value: numeric('arv_value', { precision: 18, scale: 2 }),
  purchase_price: numeric('purchase_price', { precision: 18, scale: 2 }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
