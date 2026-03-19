-- Migration: 0009_extensions
-- Enables pg_partman and pg_cron extensions required for Phase 3 partitioned tables.
-- pg_partman: manages time-based table partitions (payments, audit_events, distributions, etc.)
-- pg_cron: schedules the pg_partman maintenance job to run hourly
--
-- Run each statement separately in the Supabase SQL Editor.

-- ─── 1. Enable pg_partman ─────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_partman SCHEMA partman;

-- ─── 2. Enable pg_cron ────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ─── 3. Schedule pg_partman maintenance ──────────────────────────────────────
-- Runs hourly to create future partitions and drop expired ones.
-- Note: Supabase installs pg_partman in the 'extensions' schema, not 'partman'
SELECT cron.schedule(
  'partman-maintenance',
  '0 * * * *',
  $$SELECT extensions.run_maintenance_proc()$$
);
