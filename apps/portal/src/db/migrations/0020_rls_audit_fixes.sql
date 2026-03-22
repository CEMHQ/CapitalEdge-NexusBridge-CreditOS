-- Migration: 0020_rls_audit_fixes
-- Addresses 9 RLS security findings from the post-Phase-3 audit.
-- All statements are idempotent — safe to re-run.
--
-- Findings addressed:
--   F-02 (CRITICAL) profiles UPDATE missing WITH CHECK
--   F-03 (CRITICAL) document_requests SELECT policy broken (entity-ownership join)
--   F-04 (CRITICAL) payment_schedule + draws FOR ALL includes DELETE
--   F-05 (CRITICAL) reserve_fund_subscription() no caller ownership check
--   F-06 (CRITICAL) accreditation_records INSERT allows self-approval
--   F-08 (HIGH)     notifications UPDATE missing WITH CHECK
--   F-09 (HIGH)     user_roles has no admin SELECT policy
--   F-12 (MEDIUM)   documents has no INSERT policy
--   F-11 (MEDIUM)   bare auth.uid() in policies 0001–0006 (performance)

-- ─────────────────────────────────────────────────────────────────────────────
-- Block 1 — F-02: profiles UPDATE policy missing WITH CHECK
-- Without WITH CHECK, any authenticated user can freely change status or email.
-- USING controls row visibility; WITH CHECK controls the allowed post-write state.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE
  USING (id = (select auth.uid()))
  WITH CHECK (
    id = (select auth.uid())
    AND status = (SELECT status FROM profiles WHERE id = (select auth.uid()))
    AND email  = (SELECT email  FROM profiles WHERE id = (select auth.uid()))
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Block 2 — F-03: document_requests SELECT policy broken
-- request_owner_id stores entity UUIDs (application, borrower, investor, loan),
-- never user UUIDs. The old policy matched zero rows for every user.
-- Fix: entity-ownership join per request_owner_type.
-- ─────────────────────────────────────────────────────────────────────────────

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

-- ─────────────────────────────────────────────────────────────────────────────
-- Block 3 — F-04: payment_schedule and draws — FOR ALL includes DELETE
-- Financial ledger records are append-only. DELETE is intentionally omitted.
-- ─────────────────────────────────────────────────────────────────────────────

-- F-04a: payment_schedule
DROP POLICY IF EXISTS "servicing_manage_schedule"  ON payment_schedule;
DROP POLICY IF EXISTS "servicing_insert_schedule"  ON payment_schedule;
DROP POLICY IF EXISTS "servicing_update_schedule"  ON payment_schedule;

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
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = (select auth.uid())
        AND role IN ('admin', 'manager', 'servicing')
    )
  );
-- DELETE intentionally omitted. payment_schedule rows are immutable financial records.

-- F-04b: draws
DROP POLICY IF EXISTS "servicing_manage_draws"   ON draws;
DROP POLICY IF EXISTS "servicing_insert_draws"   ON draws;
DROP POLICY IF EXISTS "servicing_update_draws"   ON draws;

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
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = (select auth.uid())
        AND role IN ('admin', 'manager', 'servicing')
    )
  );
-- DELETE intentionally omitted. draw records are immutable financial records.

-- ─────────────────────────────────────────────────────────────────────────────
-- Block 4 — F-05: reserve_fund_subscription() no caller ownership check
-- The function is SECURITY DEFINER and accepted any investor UUID without
-- verifying it belonged to auth.uid(). Any investor could claim another's slot.
-- Fix: ownership check is now the very first statement in the function body.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION reserve_fund_subscription(
  p_investor_id       UUID,
  p_fund_id           UUID,
  p_commitment_amount NUMERIC
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
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

-- ─────────────────────────────────────────────────────────────────────────────
-- Block 5 — F-06: accreditation_records INSERT allows self-approval
-- Without WITH CHECK, investors could insert status='verified' and bypass
-- the 506(c) accreditation review workflow — a direct regulatory violation.
-- ─────────────────────────────────────────────────────────────────────────────

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

-- ─────────────────────────────────────────────────────────────────────────────
-- Block 6 — F-08: notifications UPDATE policy missing WITH CHECK
-- Only read_at is a legitimate user-writable field.
-- delivery_status, sent_at, subject, message must remain immutable.
-- ─────────────────────────────────────────────────────────────────────────────

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

-- ─────────────────────────────────────────────────────────────────────────────
-- Block 7 — F-09: user_roles has no admin SELECT policy
-- is_admin() bypasses RLS (SECURITY DEFINER) but direct admin dashboard queries
-- that read user_roles return zero rows without this policy.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "user_roles_select_admin" ON user_roles;
CREATE POLICY "user_roles_select_admin" ON user_roles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur2
      WHERE ur2.user_id = (select auth.uid())
        AND ur2.role IN ('admin', 'manager')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Block 8 — F-12: documents has no INSERT policy
-- Borrowers/investors cannot insert their own document rows.
-- The signed-URL upload flow (migration 0011) requires clients to create
-- a documents row after upload, but no INSERT policy existed.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "documents_insert_own" ON documents;
CREATE POLICY "documents_insert_own" ON documents
  FOR INSERT
  WITH CHECK (
    uploaded_by = (select auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Block 9 — F-11: Performance — wrap auth.uid() in (select auth.uid())
-- Bare auth.uid() is evaluated once per row. The subquery form is evaluated
-- once per query and cached. Material difference on high-traffic tables.
-- Recreate all affected policies from migrations 0001–0006.
-- ─────────────────────────────────────────────────────────────────────────────

-- profiles
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT USING (id = (select auth.uid()));

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT WITH CHECK (id = (select auth.uid()));

-- borrowers
DROP POLICY IF EXISTS "borrowers_select_own" ON borrowers;
CREATE POLICY "borrowers_select_own" ON borrowers
  FOR SELECT USING (profile_id = (select auth.uid()));

DROP POLICY IF EXISTS "borrowers_insert_own" ON borrowers;
CREATE POLICY "borrowers_insert_own" ON borrowers
  FOR INSERT WITH CHECK (profile_id = (select auth.uid()));

-- applications (also preserves draft-only UPDATE restriction from migration 0006)
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

-- investors
DROP POLICY IF EXISTS "investors_select_own" ON investors;
CREATE POLICY "investors_select_own" ON investors
  FOR SELECT USING (profile_id = (select auth.uid()));

DROP POLICY IF EXISTS "investors_insert_own" ON investors;
CREATE POLICY "investors_insert_own" ON investors
  FOR INSERT WITH CHECK (profile_id = (select auth.uid()));

-- notifications (select only — update was rebuilt in Block 6)
DROP POLICY IF EXISTS "notifications_select_own" ON notifications;
CREATE POLICY "notifications_select_own" ON notifications
  FOR SELECT USING (recipient_profile_id = (select auth.uid()));

-- user_roles self-read (admin read was added in Block 7)
DROP POLICY IF EXISTS "user_roles_select_own" ON user_roles;
CREATE POLICY "user_roles_select_own" ON user_roles
  FOR SELECT USING (user_id = (select auth.uid()));
