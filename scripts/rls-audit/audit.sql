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

-- Check 2 (HIGH): Tables with RLS on but zero policies
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

-- Check 6 (CRITICAL): is_admin() still references JWT metadata
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
