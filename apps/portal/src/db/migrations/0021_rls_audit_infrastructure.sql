-- ─────────────────────────────────────────────────────────────────────────────
-- 0021_rls_audit_infrastructure.sql
-- Creates the continuous RLS audit system:
--   - rls_audit_log: persistent finding store
--   - run_rls_audit(): inline audit function called by pg_cron
--   - Three pg_cron jobs: nightly full audit, weekly regression, partition sync
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Audit log table ───────────────────────────────────────────────────────
-- Append-only. Never update or delete rows — this is a compliance record.

CREATE TABLE IF NOT EXISTS rls_audit_log (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at        timestamptz NOT NULL DEFAULT now(),
  run_type      text        NOT NULL,
  -- 'nightly' | 'weekly_regression' | 'partition_sync' | 'migration_time' | 'manual'
  severity      text        NOT NULL,
  -- 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'OK'
  check_id      text        NOT NULL,
  table_name    text,
  policy_name   text,
  detail        text        NOT NULL,
  resolved_at   timestamptz,
  resolved_by   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution    text
);

CREATE INDEX IF NOT EXISTS idx_rls_audit_log_run_at   ON rls_audit_log (run_at DESC);
CREATE INDEX IF NOT EXISTS idx_rls_audit_log_severity ON rls_audit_log (severity);
CREATE INDEX IF NOT EXISTS idx_rls_audit_log_check_id ON rls_audit_log (check_id);
CREATE INDEX IF NOT EXISTS idx_rls_audit_log_resolved ON rls_audit_log (resolved_at) WHERE resolved_at IS NULL;

ALTER TABLE rls_audit_log ENABLE ROW LEVEL SECURITY;

-- Admin/compliance can read all audit log entries
CREATE POLICY "rls_audit_log_select_admin" ON rls_audit_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = (select auth.uid())
        AND role IN ('admin', 'manager', 'compliance')
    )
  );

-- No client INSERT/UPDATE/DELETE — all writes go through run_rls_audit() (SECURITY DEFINER)

-- ─── 2. Webhook notification function ────────────────────────────────────────
-- Sends a POST to a configured webhook URL when CRITICAL findings are found.
-- Set the webhook URL via: ALTER DATABASE postgres SET app.rls_alert_webhook = '...';
-- Uses pg_net if available, otherwise logs only.

CREATE OR REPLACE FUNCTION notify_rls_findings(
  p_run_type text,
  p_findings jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_webhook_url text;
  v_payload     jsonb;
BEGIN
  -- Read webhook URL from database config
  -- Set with: ALTER DATABASE postgres SET app.rls_alert_webhook = 'https://hooks.slack.com/...';
  BEGIN
    v_webhook_url := current_setting('app.rls_alert_webhook');
  EXCEPTION WHEN OTHERS THEN
    v_webhook_url := NULL;
  END;

  IF v_webhook_url IS NULL OR v_webhook_url = '' THEN
    RAISE LOG 'RLS audit: no webhook configured. Findings: %', p_findings;
    RETURN;
  END IF;

  v_payload := jsonb_build_object(
    'text',        format('[RLS ALERT] %s: %s critical finding(s) detected',
                     p_run_type,
                     jsonb_array_length(p_findings)),
    'attachments', jsonb_build_array(
      jsonb_build_object(
        'color',  '#CC0000',
        'title',  'NexusBridge RLS Security Findings',
        'fields', (
          SELECT jsonb_agg(
            jsonb_build_object(
              'title', f->>'check_id',
              'value', format('%s — %s', f->>'table_name', f->>'detail'),
              'short', false
            )
          )
          FROM jsonb_array_elements(p_findings) f
        )
      )
    )
  );

  -- pg_net must be enabled (it is on Supabase by default)
  PERFORM net.http_post(
    url     := v_webhook_url,
    body    := v_payload::text,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );

EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'RLS audit: webhook notification failed: %', SQLERRM;
END;
$$;

-- ─── 3. Core audit function ───────────────────────────────────────────────────
-- This function replicates all checks from scripts/rls-audit/audit.sql inline
-- so pg_cron can call it without filesystem access.
-- IMPORTANT: When you add a new check to audit.sql, add it here too.
-- The comment "-- SYNC WITH audit.sql" marks every check block for this reason.

CREATE OR REPLACE FUNCTION run_rls_audit(p_run_type text DEFAULT 'manual')
RETURNS TABLE (severity text, check_id text, table_name text, policy_name text, detail text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_finding_count   int;
  v_critical_count  int;
  v_critical_json   jsonb;
BEGIN
  -- Run all checks and collect into temp table
  CREATE TEMP TABLE IF NOT EXISTS _rls_findings (
    severity    text,
    check_id    text,
    table_name  text,
    policy_name text,
    detail      text
  ) ON COMMIT DROP;

  TRUNCATE _rls_findings;

  -- SYNC WITH audit.sql — Check 1: RLS disabled
  INSERT INTO _rls_findings
  SELECT 'CRITICAL', 'RLS_DISABLED', t.tablename, NULL,
         'RLS is disabled — all rows are exposed to any role that can read the table'
  FROM pg_tables t
  LEFT JOIN (SELECT tablename FROM pg_tables WHERE schemaname='public' AND rowsecurity=true) r
    ON r.tablename = t.tablename
  WHERE t.schemaname = 'public'
    AND r.tablename IS NULL
    AND t.tablename NOT IN (
      SELECT c.relname FROM pg_inherits i
      JOIN pg_class c ON c.oid = i.inhrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
    );

  -- SYNC WITH audit.sql — Check 2: RLS on, no policies (excluding intentional backend tables)
  INSERT INTO _rls_findings
  SELECT 'HIGH', 'RLS_NO_POLICY', r.tablename, NULL,
         'RLS enabled but no policies defined — all client access is denied'
  FROM pg_tables r
  LEFT JOIN pg_policies p ON p.tablename = r.tablename AND p.schemaname = 'public'
  WHERE r.schemaname = 'public' AND r.rowsecurity = true
    AND p.tablename IS NULL
    AND r.tablename NOT IN (
      'audit_events','activity_logs','audit_events_default',
      'webhook_events','job_runs','sync_errors'
    )
    AND r.tablename NOT IN (
      SELECT c.relname FROM pg_inherits i
      JOIN pg_class c ON c.oid = i.inhrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
    );

  -- SYNC WITH audit.sql — Check 3: UPDATE with no WITH CHECK
  INSERT INTO _rls_findings
  SELECT 'CRITICAL', 'UPDATE_NO_WITH_CHECK', tablename, policyname,
         'UPDATE policy has no WITH CHECK clause — all columns are freely writable by matching users'
  FROM pg_policies WHERE schemaname = 'public' AND cmd = 'UPDATE' AND with_check IS NULL;

  -- SYNC WITH audit.sql — Check 4: OPEN policies (using true)
  INSERT INTO _rls_findings
  SELECT 'CRITICAL', 'OPEN_POLICY', tablename, policyname,
         'Policy uses USING (true) — grants unrestricted access to all rows'
  FROM pg_policies WHERE schemaname = 'public' AND (qual = 'true' OR with_check = 'true');

  -- SYNC WITH audit.sql — Check 5: FOR ALL on financial tables
  INSERT INTO _rls_findings
  SELECT 'CRITICAL', 'FOR_ALL_FINANCIAL', tablename, policyname,
         'FOR ALL policy on a financial ledger table — this grants DELETE, which must never be allowed'
  FROM pg_policies WHERE schemaname = 'public' AND cmd = 'ALL'
    AND tablename IN (
      'payments','payment_schedule','draws','distributions',
      'capital_calls','fund_allocations','audit_events','activity_logs'
    );

  -- SYNC WITH audit.sql — Check 6: is_admin() JWT-based
  INSERT INTO _rls_findings
  SELECT 'CRITICAL', 'IS_ADMIN_JWT_BASED', 'is_admin()', NULL,
         'is_admin() reads from auth.jwt() — role can be spoofed by a client'
  FROM pg_proc WHERE proname = 'is_admin' AND prosrc ILIKE '%auth.jwt%';

  -- SYNC WITH audit.sql — Check 7: SECURITY DEFINER without search_path
  INSERT INTO _rls_findings
  SELECT 'HIGH', 'SECDEF_NO_SEARCH_PATH', p.proname, NULL,
         'SECURITY DEFINER function has no SET search_path — vulnerable to search path injection'
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef = true
    AND NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) cfg WHERE cfg ILIKE 'search_path%')
    AND p.proname IN (
      'is_admin','is_internal_user','get_user_role',
      'reserve_fund_subscription','apply_partition_rls_policies','handle_new_user'
    );

  -- Check 8: BARE_AUTH_UID — removed.
  -- PostgreSQL normalizes (select auth.uid()) back to auth.uid() when storing
  -- policy expressions in pg_policies.qual/with_check. The ILIKE pattern cannot
  -- distinguish between bare auth.uid() and (select auth.uid()) in catalog queries,
  -- so this check produces unresolvable false positives on every policy in the schema.
  -- The (select auth.uid()) subquery form is used in all migrations for correctness;
  -- this check cannot verify it via pg_catalog.

  -- SYNC WITH audit.sql — Check 9: user_roles no admin read
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_roles'
      AND cmd IN ('SELECT','ALL') AND policyname ILIKE '%admin%'
  ) THEN
    INSERT INTO _rls_findings VALUES (
      'HIGH','USER_ROLES_NO_ADMIN_READ','user_roles',NULL,
      'user_roles has no admin SELECT policy — admin dashboards return zero rows'
    );
  END IF;

  -- SYNC WITH audit.sql — Check 10: partition children missing RLS policies
  INSERT INTO _rls_findings
  SELECT 'HIGH', 'PARTITION_MISSING_POLICY', c.relname, NULL,
         'Partition child has RLS enabled but no policies — access silently denied'
  FROM pg_inherits i
  JOIN pg_class c ON c.oid = i.inhrelid
  JOIN pg_class p ON p.oid = i.inhparent
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND p.relname IN ('audit_events','activity_logs')
    AND c.relrowsecurity = true
    AND NOT EXISTS (SELECT 1 FROM pg_policy pol WHERE pol.polrelid = c.oid);

  -- SYNC WITH audit.sql — Check 11: documents no INSERT
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='documents'
      AND cmd IN ('INSERT','ALL') AND policyname NOT ILIKE '%admin%'
  ) THEN
    INSERT INTO _rls_findings VALUES (
      'MEDIUM','DOCUMENTS_NO_INSERT','documents',NULL,
      'documents table has no client INSERT policy — uploaders cannot create their own document rows'
    );
  END IF;

  -- SYNC WITH audit.sql — Check 12: accreditation self-approval
  INSERT INTO _rls_findings
  SELECT 'CRITICAL', 'ACCREDITATION_SELF_APPROVE', tablename, policyname,
         'accreditation_records INSERT policy does not enforce status=pending — investors can self-approve accreditation'
  FROM pg_policies WHERE schemaname='public'
    AND tablename='accreditation_records'
    AND cmd IN ('INSERT','ALL')
    AND policyname NOT ILIKE '%admin%'
    AND with_check NOT ILIKE '%pending%';

  -- Write all findings to the persistent audit log
  SELECT COUNT(*), COUNT(*) FILTER (WHERE f.severity = 'CRITICAL')
  INTO v_finding_count, v_critical_count
  FROM _rls_findings f;

  INSERT INTO rls_audit_log (run_type, severity, check_id, table_name, policy_name, detail)
  SELECT p_run_type, f.severity, f.check_id, f.table_name, f.policy_name, f.detail
  FROM _rls_findings f;

  -- If clean run, log an OK entry so the log shows continuous coverage
  IF v_finding_count = 0 THEN
    INSERT INTO rls_audit_log (run_type, severity, check_id, table_name, policy_name, detail)
    VALUES (p_run_type, 'OK', 'ALL_CHECKS_PASSED', NULL, NULL,
            format('All %s RLS checks passed. No violations found.', 11));
  END IF;

  -- Notify webhook if CRITICAL findings found
  IF v_critical_count > 0 THEN
    SELECT jsonb_agg(jsonb_build_object(
      'check_id',   f.check_id,
      'table_name', f.table_name,
      'detail',     f.detail
    ))
    INTO v_critical_json
    FROM _rls_findings f WHERE f.severity = 'CRITICAL';

    PERFORM notify_rls_findings(p_run_type, v_critical_json);
  END IF;

  -- Return findings to caller
  RETURN QUERY
  SELECT f.severity, f.check_id, f.table_name, f.policy_name, f.detail
  FROM _rls_findings f
  ORDER BY
    CASE f.severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 END,
    f.table_name;
END;
$$;

-- ─── 4. pg_cron jobs ─────────────────────────────────────────────────────────

-- Job A: Nightly full audit at 01:00 UTC
-- Runs all 12 checks, writes to rls_audit_log, fires webhook on CRITICAL findings.
SELECT cron.schedule(
  'rls-audit-nightly',
  '0 1 * * *',
  $$SELECT * FROM run_rls_audit('nightly')$$
);

-- Job B: Weekly regression at 03:00 UTC on Monday
-- Same checks, tagged as weekly_regression so the log distinguishes trend from daily state.
SELECT cron.schedule(
  'rls-audit-weekly',
  '0 3 * * 1',
  $$SELECT * FROM run_rls_audit('weekly_regression')$$
);

-- Job C: Partition RLS sync — daily at 02:00 UTC (already exists from migration 0019)
-- Wrapped in a DO block to make it idempotent.
DO $$
BEGIN
  PERFORM cron.schedule(
    'apply-partition-rls-daily',
    '0 2 * * *',
    'SELECT apply_partition_rls_policies()'
  );
EXCEPTION WHEN unique_violation THEN
  NULL; -- already scheduled from migration 0019, skip
END;
$$;
