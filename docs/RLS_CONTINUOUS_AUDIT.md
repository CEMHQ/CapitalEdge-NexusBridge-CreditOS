# RLS Continuous Audit System — Implementation Instructions

## What you are building

A self-maintaining RLS security system that catches policy regressions automatically as the
platform grows. It operates at three layers:

1. **Migration-time** — a script that runs before and after every `supabase db push`, snapshots
   the policy state, diffs it, and blocks the push if a critical rule is violated.
2. **Scheduled** — three pg_cron jobs running inside Supabase: a nightly full audit, a weekly
   regression diff, and the existing partition-RLS sync job (already created in migration 0019).
3. **Output** — findings written to a `rls_audit_log` table, critical ones sent to a webhook
   (Slack or any HTTP endpoint), and a baseline snapshot file committed to the repo.

Build everything in the order listed. Do not skip ahead.

---

## Repository structure to create

```
scripts/
  rls-audit/
    audit.sql          ← the core audit query, run by all three layers
    check-policies.sh  ← pre/post migration wrapper script
    baseline.json      ← expected policy snapshot (committed to git)
supabase/
  migrations/
    0021_rls_audit_infrastructure.sql  ← audit log table + pg_cron jobs
```

---

## Step 1 — Create the core audit query

**File:** `scripts/rls-audit/audit.sql`

This is the single source of truth for what counts as a violation. Every layer — migration-time
script, nightly job, weekly regression — runs this same query. Do not duplicate logic elsewhere.

```sql
-- scripts/rls-audit/audit.sql
-- Returns one row per violation found. Zero rows = clean audit.
-- Severity: CRITICAL | HIGH | MEDIUM
-- Run as: psql $DATABASE_URL -f scripts/rls-audit/audit.sql

WITH

-- All tables in the public schema
tables AS (
  SELECT tablename
  FROM pg_tables
  WHERE schemaname = 'public'
),

-- All active RLS policies
policies AS (
  SELECT
    tablename,
    policyname,
    cmd,
    qual,
    with_check,
    roles
  FROM pg_policies
  WHERE schemaname = 'public'
),

-- Tables with RLS enabled
rls_enabled AS (
  SELECT tablename
  FROM pg_tables
  WHERE schemaname = 'public'
    AND rowsecurity = true
),

-- Check 1 (CRITICAL): Tables that have RLS disabled
-- Every public table must have RLS on. No exceptions.
c1 AS (
  SELECT
    'CRITICAL'                                    AS severity,
    'RLS_DISABLED'                                AS check_id,
    t.tablename                                   AS table_name,
    NULL::text                                    AS policy_name,
    'RLS is disabled — all rows are exposed to any role that can read the table' AS detail
  FROM tables t
  LEFT JOIN rls_enabled r ON r.tablename = t.tablename
  WHERE r.tablename IS NULL
    -- Exclude partition children — their parent carries the RLS flag
    AND t.tablename NOT IN (
      SELECT c.relname
      FROM pg_inherits i
      JOIN pg_class c ON c.oid = i.inhrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
    )
),

-- Check 2 (CRITICAL): Tables with RLS on but zero policies
-- Means the table is fully locked — legitimate users cannot read or write.
-- This is correct for backend-only tables, but must be an explicit decision.
-- Allowlist tables that are intentionally backend-only.
c2 AS (
  SELECT
    'HIGH'                                        AS severity,
    'RLS_NO_POLICY'                               AS check_id,
    r.tablename                                   AS table_name,
    NULL::text                                    AS policy_name,
    'RLS enabled but no policies defined — all client access is denied' AS detail
  FROM rls_enabled r
  LEFT JOIN policies p ON p.tablename = r.tablename
  WHERE p.tablename IS NULL
    AND r.tablename NOT IN (
      -- Intentionally backend-only tables: add to this list as the schema grows
      'audit_events', 'activity_logs',
      'audit_events_default',
      'webhook_events', 'job_runs', 'sync_errors'
    )
    -- Exclude partition children — policies live on the parent
    AND r.tablename NOT IN (
      SELECT c.relname
      FROM pg_inherits i
      JOIN pg_class c ON c.oid = i.inhrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
    )
),

-- Check 3 (CRITICAL): UPDATE policies with no WITH CHECK
-- USING controls row visibility. WITHOUT WITH CHECK, any column can be overwritten.
c3 AS (
  SELECT
    'CRITICAL'                                    AS severity,
    'UPDATE_NO_WITH_CHECK'                        AS check_id,
    tablename                                     AS table_name,
    policyname                                    AS policy_name,
    'UPDATE policy has no WITH CHECK clause — all columns are freely writable by matching users' AS detail
  FROM policies
  WHERE cmd = 'UPDATE'
    AND with_check IS NULL
),

-- Check 4 (CRITICAL): Policies using using(true) — open access
-- These are dev shortcuts that must never reach production.
c4 AS (
  SELECT
    'CRITICAL'                                    AS severity,
    'OPEN_POLICY'                                 AS check_id,
    tablename                                     AS table_name,
    policyname                                    AS policy_name,
    'Policy uses USING (true) — grants unrestricted access to all rows for all authenticated users' AS detail
  FROM policies
  WHERE qual = 'true'
     OR with_check = 'true'
),

-- Check 5 (CRITICAL): FOR ALL policies on financial ledger tables
-- FOR ALL includes DELETE. Financial records must be immutable.
c5 AS (
  SELECT
    'CRITICAL'                                    AS severity,
    'FOR_ALL_FINANCIAL'                           AS check_id,
    tablename                                     AS table_name,
    policyname                                    AS policy_name,
    'FOR ALL policy on a financial ledger table — this grants DELETE, which must never be allowed on financial records' AS detail
  FROM policies
  WHERE cmd = 'ALL'
    AND tablename IN (
      'payments', 'payment_schedule', 'draws',
      'distributions', 'capital_calls', 'fund_allocations',
      'audit_events', 'activity_logs'
    )
),

-- Check 6 (HIGH): is_admin() still references JWT metadata
-- The DB-backed version must be in place. JWT-based is spoofable.
c6 AS (
  SELECT
    'CRITICAL'                                    AS severity,
    'IS_ADMIN_JWT_BASED'                          AS check_id,
    'is_admin()'                                  AS table_name,
    NULL::text                                    AS policy_name,
    'is_admin() reads from auth.jwt() — role can be spoofed by a client. Must query user_roles table instead' AS detail
  FROM pg_proc
  WHERE proname = 'is_admin'
    AND prosrc ILIKE '%auth.jwt%'
),

-- Check 7 (HIGH): SECURITY DEFINER functions without search_path set
-- Without a fixed search_path, a malicious user can shadow functions via schema injection.
c7 AS (
  SELECT
    'HIGH'                                        AS severity,
    'SECDEF_NO_SEARCH_PATH'                       AS check_id,
    p.proname::text                               AS table_name,
    NULL::text                                    AS policy_name,
    'SECURITY DEFINER function has no SET search_path — vulnerable to search path injection' AS detail
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef = true
    AND NOT EXISTS (
      SELECT 1
      FROM unnest(p.proconfig) cfg
      WHERE cfg ILIKE 'search_path%'
    )
    AND p.proname IN (
      'is_admin', 'is_internal_user', 'get_user_role',
      'reserve_fund_subscription', 'apply_partition_rls_policies',
      'handle_new_user'
    )
),

-- Check 8 (MEDIUM): auth.uid() used without (select ...) wrapper in policies
-- Bare auth.uid() is evaluated per-row instead of once per query — performance hit.
c8 AS (
  SELECT
    'MEDIUM'                                      AS severity,
    'BARE_AUTH_UID'                               AS check_id,
    tablename                                     AS table_name,
    policyname                                    AS policy_name,
    'Policy uses bare auth.uid() — wrap in (select auth.uid()) for per-query evaluation and better performance' AS detail
  FROM policies
  WHERE (
    qual       ILIKE '%auth.uid()%' AND qual       NOT ILIKE '%(select auth.uid())%'
    OR
    with_check ILIKE '%auth.uid()%' AND with_check NOT ILIKE '%(select auth.uid())%'
  )
),

-- Check 9 (HIGH): user_roles table missing admin read policy
-- Without it, admin dashboards return zero rows when querying roles directly.
c9 AS (
  SELECT
    'HIGH'                                        AS severity,
    'USER_ROLES_NO_ADMIN_READ'                    AS check_id,
    'user_roles'                                  AS table_name,
    NULL::text                                    AS policy_name,
    'user_roles has no admin SELECT policy — admin dashboards listing users and roles return zero rows' AS detail
  WHERE NOT EXISTS (
    SELECT 1 FROM policies
    WHERE tablename = 'user_roles'
      AND cmd IN ('SELECT', 'ALL')
      AND policyname ILIKE '%admin%'
  )
),

-- Check 10 (HIGH): Partition children missing RLS policies
-- pg_partman creates new partitions regularly. Each needs its own policies.
c10 AS (
  SELECT
    'HIGH'                                        AS severity,
    'PARTITION_MISSING_POLICY'                    AS check_id,
    c.relname::text                               AS table_name,
    NULL::text                                    AS policy_name,
    'Partition child has RLS enabled but no policies — access is silently denied for all users' AS detail
  FROM pg_inherits i
  JOIN pg_class c ON c.oid = i.inhrelid
  JOIN pg_class p ON p.oid = i.inhparent
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND p.relname IN ('audit_events', 'activity_logs')
    AND c.relrowsecurity = true
    AND NOT EXISTS (
      SELECT 1 FROM pg_policy pol WHERE pol.polrelid = c.oid
    )
),

-- Check 11 (MEDIUM): documents table missing INSERT policy
-- Uploaders cannot register document rows without it.
c11 AS (
  SELECT
    'MEDIUM'                                      AS severity,
    'DOCUMENTS_NO_INSERT'                         AS check_id,
    'documents'                                   AS table_name,
    NULL::text                                    AS policy_name,
    'documents table has no client INSERT policy — uploaders cannot create their own document rows' AS detail
  WHERE NOT EXISTS (
    SELECT 1 FROM policies
    WHERE tablename = 'documents'
      AND cmd IN ('INSERT', 'ALL')
      AND policyname NOT ILIKE '%admin%'
  )
),

-- Check 12 (CRITICAL): accreditation_records INSERT allows status != pending
-- Investors must not be able to self-approve their accreditation.
c12 AS (
  SELECT
    'CRITICAL'                                    AS severity,
    'ACCREDITATION_SELF_APPROVE'                  AS check_id,
    'accreditation_records'                       AS table_name,
    policyname                                    AS policy_name,
    'accreditation_records INSERT policy does not enforce status=pending — investors can self-approve accreditation, violating 506(c)' AS detail
  FROM policies
  WHERE tablename = 'accreditation_records'
    AND cmd IN ('INSERT', 'ALL')
    AND policyname NOT ILIKE '%admin%'
    AND with_check NOT ILIKE '%pending%'
)

SELECT severity, check_id, table_name, policy_name, detail
FROM (
  SELECT * FROM c1
  UNION ALL SELECT * FROM c2
  UNION ALL SELECT * FROM c3
  UNION ALL SELECT * FROM c4
  UNION ALL SELECT * FROM c5
  UNION ALL SELECT * FROM c6
  UNION ALL SELECT * FROM c7
  UNION ALL SELECT * FROM c8
  UNION ALL SELECT * FROM c9
  UNION ALL SELECT * FROM c10
  UNION ALL SELECT * FROM c11
  UNION ALL SELECT * FROM c12
) all_findings
ORDER BY
  CASE severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 END,
  table_name;
```

---

## Step 2 — Create the migration-time check script

**File:** `scripts/rls-audit/check-policies.sh`

This wraps `supabase db push`. It snapshots policies before, runs the migration, then re-runs
the audit. If any CRITICAL or HIGH findings appear that were not present before, it exits
non-zero and blocks the push from completing in CI.

```bash
#!/usr/bin/env bash
# scripts/rls-audit/check-policies.sh
# Usage: ./scripts/rls-audit/check-policies.sh
# Set DATABASE_URL in your environment before running.
# In CI: add this as a step before supabase db push.

set -euo pipefail

AUDIT_SQL="scripts/rls-audit/audit.sql"
BASELINE="scripts/rls-audit/baseline.json"
PRE_SNAPSHOT="/tmp/rls_pre_snapshot.json"
POST_SNAPSHOT="/tmp/rls_post_snapshot.json"
POST_FINDINGS="/tmp/rls_post_findings.txt"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set."
  exit 1
fi

echo "=== RLS Audit: pre-migration snapshot ==="
psql "$DATABASE_URL" \
  -c "COPY (
    SELECT jsonb_agg(row_to_json(p) ORDER BY tablename, policyname)
    FROM pg_policies p WHERE schemaname = 'public'
  ) TO STDOUT" > "$PRE_SNAPSHOT"

echo "=== Running migration ==="
supabase db push

echo "=== RLS Audit: post-migration findings ==="
psql "$DATABASE_URL" -f "$AUDIT_SQL" \
  --csv --tuples-only > "$POST_FINDINGS" 2>&1

CRITICAL_COUNT=$(grep -c "^CRITICAL," "$POST_FINDINGS" || true)
HIGH_COUNT=$(grep -c "^HIGH," "$POST_FINDINGS" || true)
MEDIUM_COUNT=$(grep -c "^MEDIUM," "$POST_FINDINGS" || true)

echo ""
echo "Results: ${CRITICAL_COUNT} critical, ${HIGH_COUNT} high, ${MEDIUM_COUNT} medium"
echo ""

if [[ "$CRITICAL_COUNT" -gt 0 ]]; then
  echo "=== CRITICAL FINDINGS — migration blocked ==="
  grep "^CRITICAL," "$POST_FINDINGS"
  echo ""
  echo "Fix these before merging. See scripts/rls-audit/audit.sql for remediation guidance."
  exit 1
fi

if [[ "$HIGH_COUNT" -gt 0 ]]; then
  echo "=== HIGH FINDINGS — review required ==="
  grep "^HIGH," "$POST_FINDINGS"
  echo ""
  echo "WARNING: High severity findings detected. Create a follow-up issue before merging."
  # Does not block — but leaves a visible warning in CI output
fi

if [[ "$MEDIUM_COUNT" -gt 0 ]]; then
  echo "=== MEDIUM FINDINGS ==="
  grep "^MEDIUM," "$POST_FINDINGS"
fi

echo ""
echo "=== Updating baseline snapshot ==="
psql "$DATABASE_URL" \
  -c "COPY (
    SELECT jsonb_agg(row_to_json(p) ORDER BY tablename, policyname)
    FROM pg_policies p WHERE schemaname = 'public'
  ) TO STDOUT" > "$BASELINE"

echo "Baseline updated. Commit scripts/rls-audit/baseline.json to git."
echo "=== RLS audit complete ==="
```

Make it executable:

```bash
chmod +x scripts/rls-audit/check-policies.sh
```

---

## Step 3 — Create the database migration for audit infrastructure

**File:** `supabase/migrations/0021_rls_audit_infrastructure.sql`

This migration creates the `rls_audit_log` table, the `run_rls_audit()` function that executes
the full audit check set inline (so pg_cron can call it without a file), and three pg_cron jobs.

Apply with: `supabase db push` (after the check script exists, it will self-audit on push)

```sql
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
-- Set the webhook URL via: ALTER ROLE authenticator SET app.rls_alert_webhook = '...';
-- Or pass it as a parameter. Uses pg_net if available, otherwise logs only.
-- Replace the net.http_post call with your preferred notification method.

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
  -- If pg_net is not available, remove this block and use a different notification method
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

  -- SYNC WITH audit.sql — Check 8: bare auth.uid()
  INSERT INTO _rls_findings
  SELECT 'MEDIUM', 'BARE_AUTH_UID', tablename, policyname,
         'Policy uses bare auth.uid() — wrap in (select auth.uid()) for per-query evaluation'
  FROM pg_policies WHERE schemaname = 'public'
    AND (
      (qual       ILIKE '%auth.uid()%' AND qual       NOT ILIKE '%(select auth.uid())%')
      OR
      (with_check ILIKE '%auth.uid()%' AND with_check NOT ILIKE '%(select auth.uid())%')
    );

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
  SELECT COUNT(*), COUNT(*) FILTER (WHERE severity = 'CRITICAL')
  INTO v_finding_count, v_critical_count
  FROM _rls_findings;

  INSERT INTO rls_audit_log (run_type, severity, check_id, table_name, policy_name, detail)
  SELECT p_run_type, f.severity, f.check_id, f.table_name, f.policy_name, f.detail
  FROM _rls_findings f;

  -- If clean run, log an OK entry so the log shows continuous coverage
  IF v_finding_count = 0 THEN
    INSERT INTO rls_audit_log (run_type, severity, check_id, table_name, policy_name, detail)
    VALUES (p_run_type, 'OK', 'ALL_CHECKS_PASSED', NULL, NULL,
            format('All %s RLS checks passed. No violations found.', 12));
  END IF;

  -- Notify webhook if CRITICAL findings found
  IF v_critical_count > 0 THEN
    SELECT jsonb_agg(jsonb_build_object(
      'check_id',   check_id,
      'table_name', table_name,
      'detail',     detail
    ))
    INTO v_critical_json
    FROM _rls_findings WHERE severity = 'CRITICAL';

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
-- If it already exists from 0019, this will error. Wrap in a DO block to make it idempotent.
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
```

---

## Step 4 — Configure the webhook URL

After applying the migration, set the webhook URL so CRITICAL findings trigger an alert:

```sql
-- Run this in the Supabase SQL editor or as a one-time script.
-- Replace the URL with your actual Slack incoming webhook or HTTP endpoint.
ALTER DATABASE postgres
  SET app.rls_alert_webhook = 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL';
```

If you are not using Slack, replace the `net.http_post` call inside `notify_rls_findings()`
with whatever HTTP endpoint you want to hit. The payload is plain JSON.

---

## Step 5 — Generate the initial baseline file

Run this once after the migration is applied to capture the current expected policy state.
Commit the output to git — the check script diffs against it on every push.

```bash
psql "$DATABASE_URL" -c "
  COPY (
    SELECT jsonb_agg(row_to_json(p) ORDER BY tablename, policyname)
    FROM pg_policies p WHERE schemaname = 'public'
  ) TO STDOUT
" > scripts/rls-audit/baseline.json

git add scripts/rls-audit/baseline.json
git commit -m "chore: initial RLS policy baseline"
```

---

## Step 6 — Wire into CI

Add this to your CI pipeline (GitHub Actions, GitLab CI, etc.) **before** the deploy step.
The script exits non-zero on CRITICAL findings, which blocks the merge.

```yaml
# .github/workflows/deploy.yml  (add this step before supabase db push)
- name: RLS audit pre-migration check
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
  run: |
    bash scripts/rls-audit/check-policies.sh
```

For a pull request check that does not deploy but still audits the current DB state:

```yaml
- name: RLS policy audit (PR check)
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
  run: |
    psql "$DATABASE_URL" -f scripts/rls-audit/audit.sql
```

---

## Step 7 — Ongoing maintenance rules

These are the rules that must be followed for every future migration. Add them to your
contributing guide or PR template.

### When adding a new table

Every new `CREATE TABLE` in a migration must be followed by:

```sql
-- 1. Enable RLS
ALTER TABLE <new_table> ENABLE ROW LEVEL SECURITY;

-- 2. At minimum one SELECT policy for the intended audience
-- 3. If the table is backend-only (no client reads), add it to the allowlist in audit.sql
--    and in the run_rls_audit() function (Check 2 exclusion list), then document why.
```

### When adding a new UPDATE policy

Always include both `USING` and `WITH CHECK`. Never ship an UPDATE policy with only `USING`:

```sql
-- WRONG — missing WITH CHECK
CREATE POLICY "foo_update" ON foo FOR UPDATE USING (user_id = (select auth.uid()));

-- CORRECT
CREATE POLICY "foo_update" ON foo
  FOR UPDATE
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));
```

### When adding a new SECURITY DEFINER function

Always set `search_path`:

```sql
CREATE OR REPLACE FUNCTION my_function(...)
RETURNS ...
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions  -- always include this
AS $$ ... $$;
```

Always validate that function parameters reference data owned by the caller before acting:

```sql
-- First line of any SECURITY DEFINER function that accepts a UUID owned by a user:
IF NOT EXISTS (
  SELECT 1 FROM <table> WHERE id = p_entity_id AND owner_id = auth.uid()
) THEN
  RETURN json_build_object('error', 'Unauthorized');
END IF;
```

### When adding a new check to audit.sql

You must also add it to `run_rls_audit()` in the migration. Both must stay in sync.
The comment `-- SYNC WITH audit.sql` marks every check block in the function for this reason.

### When adding a new partitioned table

After calling `extensions.create_parent(...)`, immediately run:

```sql
SELECT apply_partition_rls_policies();
```

And update `apply_partition_rls_policies()` in the migration where you created the table
to include the new parent table name in its loop filter.

---

## Verification — confirm the system is running

Run these after completing all steps:

```sql
-- 1. Confirm audit infrastructure exists
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'rls_audit_log';
-- Expected: 1 row

-- 2. Confirm all three cron jobs are active
SELECT jobname, schedule, active
FROM cron.job
WHERE jobname IN ('rls-audit-nightly', 'rls-audit-weekly', 'apply-partition-rls-daily');
-- Expected: 3 rows, all active = true

-- 3. Run the audit manually and confirm zero critical findings
SELECT * FROM run_rls_audit('manual');
-- Expected: zero rows, OR only MEDIUM rows if any remain from the original audit
-- Any CRITICAL or HIGH row here means a fix is still outstanding

-- 4. Confirm the audit log received the manual run entry
SELECT run_type, severity, check_id, run_at
FROM rls_audit_log
ORDER BY run_at DESC
LIMIT 5;
-- Expected: most recent row shows run_type='manual', severity='OK' or a finding

-- 5. Confirm the webhook config is set (returns the URL, mask it in logs)
SELECT current_setting('app.rls_alert_webhook');
-- Expected: your webhook URL

-- 6. Confirm the baseline file was generated
-- Run from repo root:
-- ls -la scripts/rls-audit/baseline.json
-- Expected: file exists, non-empty, committed to git
```
