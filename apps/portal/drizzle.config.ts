import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/schema',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    // Use Transaction Pooler (port 6543) for app queries
    // Use direct connection (port 5432) for migrations only
    url: process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL!,
  },
})
