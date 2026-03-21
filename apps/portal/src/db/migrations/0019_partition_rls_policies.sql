-- Migration: 0019_partition_rls_policies
-- Fixes the Supabase security advisor warning:
--   "RLS Enabled No Policy" on activity_logs_* and audit_events_* partitions.
--
-- Root cause: PostgreSQL propagates ALTER TABLE ... ENABLE ROW LEVEL SECURITY to
-- child partitions, but RLS policies defined on the parent table are NOT inherited
-- by the child partitions. Each physical partition needs its own policy.
--
-- pg_partman pre-creates future partitions (p_premake=4) and will keep creating
-- new ones weekly/monthly, so we also schedule a daily pg_cron job to apply
-- policies to any new partition that is missing them.

-- ─── 1. Helper function ────────────────────────────────────────────────────────
-- Idempotent: skips any partition that already has at least one policy.
-- Security definer so pg_cron can call it without elevated per-session privileges.

CREATE OR REPLACE FUNCTION apply_partition_rls_policies()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT
      c.relname AS partition_name,
      p.relname AS parent_name
    FROM pg_inherits  i
    JOIN pg_class     c ON c.oid = i.inhrelid
    JOIN pg_class     p ON p.oid = i.inhparent
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND p.relname IN ('audit_events', 'activity_logs')
      AND NOT EXISTS (
        SELECT 1 FROM pg_policy pol WHERE pol.polrelid = c.oid
      )
  LOOP
    IF r.parent_name = 'audit_events' THEN
      EXECUTE format(
        'CREATE POLICY "audit_events_select_admin" ON public.%I FOR SELECT USING (is_admin())',
        r.partition_name
      );
    ELSIF r.parent_name = 'activity_logs' THEN
      EXECUTE format(
        'CREATE POLICY "activity_logs_select_admin" ON public.%I FOR SELECT USING (is_admin())',
        r.partition_name
      );
    END IF;
  END LOOP;
END;
$$;

-- ─── 2. Apply to all existing partitions now ───────────────────────────────────
-- Covers every currently flagged partition: activity_logs_default,
-- activity_logs_p20260219 through _p20260416, audit_events_default, etc.

SELECT apply_partition_rls_policies();

-- ─── 3. Schedule daily maintenance for future partitions ──────────────────────
-- pg_partman creates future partitions ahead of time (p_premake=4).
-- Running this daily at 02:00 UTC guarantees new partitions get policies
-- before the pg_partman maintenance window promotes them into active use.
-- The function is idempotent — safe to run repeatedly.

SELECT cron.schedule(
  'apply-partition-rls-daily',
  '0 2 * * *',
  $$SELECT apply_partition_rls_policies()$$
);
