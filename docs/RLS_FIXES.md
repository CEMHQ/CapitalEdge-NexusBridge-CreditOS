# RLS Security Audit — Implementation Instructions

## Context

A full audit of migrations `0001–0019` identified 15 security findings across the NexusBridge schema. This file tells you exactly what to do to address all of them. Execute every task in the order listed. Do not skip verification steps — each one confirms the previous fix landed correctly before moving on.

The output of this work is a single new migration file: `supabase/migrations/0020_rls_audit_fixes.sql`. Create that file, populate it with the SQL blocks below in sequence, then apply it.

---

## Prerequisites — check these before writing any SQL

Run these queries against the live database and confirm the expected results. If any check fails, stop and flag the discrepancy before proceeding.

```sql
-- PRE-1: Confirm is_admin() is DB-backed, not JWT-based
SELECT prosrc FROM pg_proc WHERE proname = 'is_admin';
-- Expected: body references `user_roles` table, NOT `auth.jwt()`
-- If it still reads from auth.jwt(), the 0005 migration did not fully apply.
-- In that case, run the CREATE OR REPLACE from 0005 first, then continue here.

-- PRE-2: Confirm user_roles exists and has rows
SELECT COUNT(*) FROM user_roles;
-- Expected: >= 1 row. If 0, the backfill in 0005 did not run.

-- PRE-3: Confirm no existing using(true) policies
SELECT tablename, policyname FROM pg_policies WHERE qual = 'true';
-- Expected: 0 rows in production

-- PRE-4: Confirm partition cron job exists from migration 0019
SELECT jobname, active FROM cron.job WHERE jobname = 'apply-partition-rls-daily';
-- Expected: 1 row, active = true
-- If missing, re-run the SELECT cron.schedule(...) block from 0019.
```

---

## Migration file to create

**Path:** `supabase/migrations/0020_rls_audit_fixes.sql`

Populate it with the blocks below in order. Each block is labelled with the finding ID it addresses. All statements are idempotent — safe to re-run.

---

### Block 1 — F-02: `profiles` UPDATE policy missing `WITH CHECK`

**Why:** Without `WITH CHECK`, any authenticated user can UPDATE their own profile row and freely change `status` or `email`, bypassing all application-layer controls. `USING` only controls row visibility; `WITH CHECK` controls what the row is allowed to look like after the write.

```sql
-- F-02: profiles_update_own — add WITH CHECK
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE
  USING (id = (select auth.uid()))
  WITH CHECK (
    id = (select auth.uid())
    AND status = (SELECT status FROM profiles WHERE id = (select auth.uid()))
    AND email  = (SELECT email  FROM profiles WHERE id = (select auth.uid()))
  );
```

---

### Block 2 — F-03: `document_requests` SELECT policy broken

**Why:** The original policy `request_owner_id = auth.uid()` is semantically wrong. `request_owner_id` stores entity UUIDs (application IDs, borrower IDs, investor IDs, loan IDs) — never user UUIDs. The policy matched zero rows for every user, silently blocking all legitimate borrower and investor access to their own document requests.

```sql
-- F-03: doc_requests_select_own — fix broken entity ownership join
DROP POLICY IF EXISTS "doc_requests_select_own" ON document_requests;

CREATE POLICY "doc_requests_select_own" ON document_requests
  FOR SELECT USING (
    (request_owner_type = 'application' AND EXISTS (
      SELECT 1 FROM applications a
      JOIN borrowers b ON b.id = a.borrower_id
      WHERE a.id = document_requests.request_owner_id
        AND b.profile_id = (select auth.uid())
    ))
    OR
    (request_owner_type = 'borrower' AND EXISTS (
      SELECT 1 FROM borrowers b
      WHERE b.id = document_requests.request_owner_id
        AND b.profile_id = (select auth.uid())
    ))
    OR
    (request_owner_type = 'investor' AND EXISTS (
      SELECT 1 FROM investors i
      WHERE i.id = document_requests.request_owner_id
        AND i.profile_id = (select auth.uid())
    ))
    OR
    (request_owner_type = 'loan' AND EXISTS (
      SELECT 1 FROM loans l
      JOIN applications a ON a.id = l.application_id
      JOIN borrowers b    ON b.id = a.borrower_id
      WHERE l.id = document_requests.request_owner_id
        AND b.profile_id = (select auth.uid())
    ))
  );
```

---

### Block 3 — F-04: `payment_schedule` and `draws` — `FOR ALL` includes DELETE

**Why:** `FOR ALL` grants SELECT, INSERT, UPDATE, AND DELETE. Payment schedule entries and draw records are financial ledger data and must be append-only. Servicing staff must never be able to delete them. The replacement splits into explicit INSERT + UPDATE policies with DELETE intentionally omitted.

```sql
-- F-04a: payment_schedule — replace FOR ALL with explicit INSERT + UPDATE
DROP POLICY IF EXISTS "servicing_manage_schedule" ON payment_schedule;

CREATE POLICY "servicing_insert_schedule" ON payment_schedule
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = (select auth.uid())
        AND role IN ('admin', 'manager', 'servicing')
    )
  );

CREATE POLICY "servicing_update_schedule" ON payment_schedule
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = (select auth.uid())
        AND role IN ('admin', 'manager', 'servicing')
    )
  );
-- DELETE intentionally omitted. payment_schedule rows are immutable financial records.

-- F-04b: draws — replace FOR ALL with explicit INSERT + UPDATE
DROP POLICY IF EXISTS "servicing_manage_draws" ON draws;

CREATE POLICY "servicing_insert_draws" ON draws
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = (select auth.uid())
        AND role IN ('admin', 'manager', 'servicing')
    )
  );

CREATE POLICY "servicing_update_draws" ON draws
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = (select auth.uid())
        AND role IN ('admin', 'manager', 'servicing')
    )
  );
-- DELETE intentionally omitted. draw records are immutable financial records.
```

---

### Block 4 — F-05: `reserve_fund_subscription()` does not validate caller identity

**Why:** The function is `SECURITY DEFINER` and accepts `p_investor_id` without checking it belongs to `auth.uid()`. Any authenticated investor can pass another investor's UUID and claim a fund subscription slot on their behalf. Fix: add an ownership check as the very first statement in the function body.

```sql
-- F-05: reserve_fund_subscription — add caller ownership validation
CREATE OR REPLACE FUNCTION reserve_fund_subscription(
  p_investor_id       UUID,
  p_fund_id           UUID,
  p_commitment_amount NUMERIC
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_fund              funds%ROWTYPE;
  v_total_committed   NUMERIC;
  v_fcfs_position     INTEGER;
  v_subscription_id   UUID;
  v_expires_at        TIMESTAMPTZ;
BEGIN
  -- SECURITY: caller must own the investor record before any other action
  IF NOT EXISTS (
    SELECT 1 FROM investors
    WHERE id = p_investor_id
      AND profile_id = auth.uid()
  ) THEN
    RETURN json_build_object(
      'error', 'Unauthorized: investor record does not belong to the authenticated user'
    );
  END IF;

  -- Lock the fund row to serialize concurrent subscription attempts
  SELECT * INTO v_fund
  FROM funds
  WHERE id = p_fund_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Fund not found');
  END IF;

  IF v_fund.fund_status != 'open' THEN
    RETURN json_build_object('error', 'Fund is not accepting subscriptions');
  END IF;

  -- Sum all live commitments (reserved + confirmed + active)
  SELECT COALESCE(SUM(commitment_amount), 0) INTO v_total_committed
  FROM fund_subscriptions
  WHERE fund_id = p_fund_id
    AND subscription_status IN ('pending', 'approved', 'active')
    AND reservation_status IN ('reserved', 'confirmed');

  IF v_total_committed + p_commitment_amount > v_fund.max_capacity THEN
    RETURN json_build_object('error', 'Fund is at or near capacity');
  END IF;

  -- Assign next FCFS position
  SELECT COALESCE(MAX(fcfs_position), 0) + 1 INTO v_fcfs_position
  FROM fund_subscriptions
  WHERE fund_id = p_fund_id;

  v_expires_at := NOW() + INTERVAL '30 minutes';

  INSERT INTO fund_subscriptions (
    fund_id, investor_id, commitment_amount,
    subscription_status, reservation_status,
    reservation_expires_at, fcfs_position, reserved_at, created_by
  ) VALUES (
    p_fund_id, p_investor_id, p_commitment_amount,
    'pending', 'reserved',
    v_expires_at, v_fcfs_position, NOW(), p_investor_id
  )
  RETURNING id INTO v_subscription_id;

  RETURN json_build_object(
    'subscription_id',        v_subscription_id,
    'fcfs_position',          v_fcfs_position,
    'reservation_expires_at', v_expires_at
  );
END;
$$;
```

---

### Block 5 — F-06: `accreditation_records` INSERT allows self-approval

**Why:** The original `INSERT` policy had no `WITH CHECK` constraints on review fields. An investor could insert a row with `status = 'verified'`, `verified_at = now()`, and `expires_at` set far in the future, completely bypassing the 506(c) accreditation review workflow. This is a direct regulatory compliance violation.

```sql
-- F-06: accreditation_records_insert_own — enforce pending-only on insert
DROP POLICY IF EXISTS "accreditation_records_insert_own" ON accreditation_records;

CREATE POLICY "accreditation_records_insert_own" ON accreditation_records
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM investors i
      WHERE i.id = accreditation_records.investor_id
        AND i.profile_id = (select auth.uid())
    )
    AND status      = 'pending'  -- investors cannot self-approve
    AND reviewed_by IS NULL      -- all review fields must be null on insert
    AND reviewed_at IS NULL
    AND verified_at IS NULL
  );
```

---

### Block 6 — F-08: `notifications` UPDATE policy missing `WITH CHECK`

**Why:** Users could update any column on their own notifications — including `delivery_status`, `sent_at`, `subject`, and `message`. Only `read_at` is a legitimate user-writable field.

```sql
-- F-08: notifications_update_own — restrict writable columns to read_at only
DROP POLICY IF EXISTS "notifications_update_own" ON notifications;

CREATE POLICY "notifications_update_own" ON notifications
  FOR UPDATE
  USING (recipient_profile_id = (select auth.uid()))
  WITH CHECK (
    recipient_profile_id = (select auth.uid())
    AND delivery_status = (SELECT n2.delivery_status FROM notifications n2 WHERE n2.id = notifications.id)
    AND sent_at         = (SELECT n2.sent_at         FROM notifications n2 WHERE n2.id = notifications.id)
    AND subject         = (SELECT n2.subject         FROM notifications n2 WHERE n2.id = notifications.id)
    AND message         = (SELECT n2.message         FROM notifications n2 WHERE n2.id = notifications.id)
  );
```

---

### Block 7 — F-09: `user_roles` has no admin SELECT policy

**Why:** `is_admin()` and `is_internal_user()` work because they are `SECURITY DEFINER` and bypass RLS. But any admin dashboard query that directly reads `user_roles` to list users and their roles returns zero rows, because no admin-facing SELECT policy exists.

```sql
-- F-09: user_roles — add admin/manager read policy
CREATE POLICY "user_roles_select_admin" ON user_roles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur2
      WHERE ur2.user_id = (select auth.uid())
        AND ur2.role IN ('admin', 'manager')
    )
  );
```

---

### Block 8 — F-12: `documents` has no INSERT policy

**Why:** Borrowers and investors cannot insert their own document rows. The signed-URL upload flow (migration 0011) depends on clients creating a `documents` row after upload, but no INSERT policy exists. This silently blocks all document registration.

```sql
-- F-12: documents — add INSERT policy for uploading users
CREATE POLICY "documents_insert_own" ON documents
  FOR INSERT
  WITH CHECK (
    uploaded_by = (select auth.uid())
  );
```

---

### Block 9 — F-11: Performance — wrap `auth.uid()` in `(select auth.uid())`

**Why:** A bare `auth.uid()` call in a policy expression is evaluated once per row scanned. The subquery form `(select auth.uid())` is evaluated once per query and the result is cached. On high-traffic tables this is a material performance difference. All policies in migrations 0001–0006 used the bare form.

Recreate every affected policy. These are drop-and-replace — no data is affected.

```sql
-- F-11: profiles
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT USING (id = (select auth.uid()));

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT WITH CHECK (id = (select auth.uid()));

-- F-11: borrowers
DROP POLICY IF EXISTS "borrowers_select_own" ON borrowers;
CREATE POLICY "borrowers_select_own" ON borrowers
  FOR SELECT USING (profile_id = (select auth.uid()));

DROP POLICY IF EXISTS "borrowers_insert_own" ON borrowers;
CREATE POLICY "borrowers_insert_own" ON borrowers
  FOR INSERT WITH CHECK (profile_id = (select auth.uid()));

-- F-11: applications — all three policies, also preserves the draft-only
--        UPDATE restriction introduced in migration 0006
DROP POLICY IF EXISTS "applications_select_own" ON applications;
CREATE POLICY "applications_select_own" ON applications
  FOR SELECT USING (
    borrower_id IN (
      SELECT id FROM borrowers WHERE profile_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "applications_insert_own" ON applications;
CREATE POLICY "applications_insert_own" ON applications
  FOR INSERT WITH CHECK (
    borrower_id IN (
      SELECT id FROM borrowers WHERE profile_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "applications_update_own" ON applications;
CREATE POLICY "applications_update_own" ON applications
  FOR UPDATE
  USING (
    borrower_id IN (
      SELECT id FROM borrowers WHERE profile_id = (select auth.uid())
    )
    AND application_status = 'draft'
  )
  WITH CHECK (
    borrower_id IN (
      SELECT id FROM borrowers WHERE profile_id = (select auth.uid())
    )
    AND application_status = 'draft'
  );

-- F-11: investors
DROP POLICY IF EXISTS "investors_select_own" ON investors;
CREATE POLICY "investors_select_own" ON investors
  FOR SELECT USING (profile_id = (select auth.uid()));

DROP POLICY IF EXISTS "investors_insert_own" ON investors;
CREATE POLICY "investors_insert_own" ON investors
  FOR INSERT WITH CHECK (profile_id = (select auth.uid()));

-- F-11: notifications (select only — update was rebuilt in Block 6)
DROP POLICY IF EXISTS "notifications_select_own" ON notifications;
CREATE POLICY "notifications_select_own" ON notifications
  FOR SELECT USING (recipient_profile_id = (select auth.uid()));

-- F-11: user_roles self-read (select admin was added in Block 7)
DROP POLICY IF EXISTS "user_roles_select_own" ON user_roles;
CREATE POLICY "user_roles_select_own" ON user_roles
  FOR SELECT USING (user_id = (select auth.uid()));
```

---

## Apply the migration

Once the file is fully written, apply it:

```bash
supabase db push
```

Or, if running against a remote project directly:

```bash
supabase migration up --db-url "$DATABASE_URL"
```

If applying manually via the Supabase SQL editor, run each block separately in the order listed above.

---

## Post-apply verification

Run every query below after the migration succeeds. Each has an expected result. If any query returns an unexpected result, stop and investigate before considering the task complete.

```sql
-- V-01: Confirm is_admin() is DB-backed
SELECT prosrc FROM pg_proc WHERE proname = 'is_admin';
-- Expected: body contains 'user_roles', does NOT contain 'auth.jwt()'

-- V-02: Confirm no open using(true) policies exist
SELECT tablename, policyname FROM pg_policies WHERE qual = 'true';
-- Expected: 0 rows

-- V-03: Confirm all UPDATE policies on sensitive tables have WITH CHECK
SELECT tablename, policyname, cmd, with_check
FROM pg_policies
WHERE cmd = 'UPDATE'
  AND with_check IS NULL
  AND tablename IN (
    'profiles', 'applications', 'notifications', 'accreditation_records'
  );
-- Expected: 0 rows

-- V-04: Confirm FOR ALL is gone from payment_schedule and draws
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN ('payment_schedule', 'draws')
  AND cmd = 'ALL';
-- Expected: 0 rows

-- V-05: Confirm new policies exist on document_requests
SELECT policyname FROM pg_policies WHERE tablename = 'document_requests';
-- Expected: includes 'doc_requests_select_own', 'doc_requests_select_admin',
--           'doc_requests_insert_admin', 'doc_requests_update_admin'

-- V-06: Confirm documents INSERT policy exists
SELECT policyname FROM pg_policies WHERE tablename = 'documents';
-- Expected: includes 'documents_insert_own'

-- V-07: Confirm accreditation_records insert policy enforces pending status
SELECT policyname, with_check FROM pg_policies
WHERE tablename = 'accreditation_records' AND cmd = 'INSERT';
-- Expected: with_check contains 'pending' and 'IS NULL' constraints

-- V-08: Confirm user_roles admin read policy exists
SELECT policyname FROM pg_policies WHERE tablename = 'user_roles';
-- Expected: includes both 'user_roles_select_own' and 'user_roles_select_admin'

-- V-09: Confirm partition RLS cron job is active
SELECT jobname, schedule, active, last_run_time
FROM cron.job WHERE jobname = 'apply-partition-rls-daily';
-- Expected: 1 row, active = true

-- V-10: Confirm all auth users have a user_roles row (no orphans)
SELECT COUNT(*) FROM auth.users u
LEFT JOIN user_roles ur ON ur.user_id = u.id
WHERE ur.user_id IS NULL;
-- Expected: 0
```

---

## Do not touch

The following are out of scope for this migration. Do not modify them.

- `is_admin()` and `is_internal_user()` function bodies — already correct per migration 0005/0010
- `apply_partition_rls_policies()` — already correct per migration 0019
- `handle_new_user()` trigger — already correct per migration 0005
- All `FOR ALL` policies on `workflow_triggers` — intentional; workflow management is admin-only and does not touch financial data
- `audit_events` and `activity_logs` parent table policies — partition policies are handled by the cron job from 0019

---

## Findings reference

| ID | Severity | Table(s) | Fixed in block |
|---|---|---|---|
| F-02 | CRITICAL | `profiles` | Block 1 |
| F-03 | CRITICAL | `document_requests` | Block 2 |
| F-04 | CRITICAL | `payment_schedule`, `draws` | Block 3 |
| F-05 | CRITICAL | `fund_subscriptions` (function) | Block 4 |
| F-06 | CRITICAL | `accreditation_records` | Block 5 |
| F-08 | HIGH | `notifications` | Block 6 |
| F-09 | HIGH | `user_roles` | Block 7 |
| F-12 | MEDIUM | `documents` | Block 8 |
| F-11 | MEDIUM | All 0001–0006 tables | Block 9 |
| F-01 | CRITICAL | `is_admin()` function | Pre-check only — verify 0005 applied |
| F-07 | HIGH | `investors` (function timing) | Pre-check only — verify 0010 applied |
| F-10 | HIGH | `borrowers` | No schema change needed — no client update path exists |
| F-13 | MEDIUM | `nav_snapshots` | No change — broad investor NAV access is accepted product behavior |
| F-14 | MEDIUM | `payments` | Intentional — add payments UPDATE policy separately if correction workflow is needed |
| F-15 | MEDIUM | Partition cron job | Pre-check only — verify cron job from 0019 is active |
