-- ─────────────────────────────────────────────────────────────────────────────
-- 0022_rls_update_with_check.sql
-- Resolves all CRITICAL and HIGH findings from run_rls_audit():
--
--   CRITICAL UPDATE_NO_WITH_CHECK (19 policies):
--     Every admin/servicing/underwriter UPDATE policy was missing WITH CHECK.
--     WITH CHECK mirrors USING so the role gate applies to both the row being
--     read and the row being written — preventing privilege escalation.
--
--   HIGH SECDEF_NO_SEARCH_PATH (4 functions):
--     is_admin(), is_internal_user(), get_user_role(), handle_new_user() are
--     SECURITY DEFINER but had no SET search_path, leaving them open to
--     search_path injection attacks.
--
-- All recreated policies use (select auth.uid()) instead of bare auth.uid()
-- to also eliminate the MEDIUM BARE_AUTH_UID finding on these specific rows.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. SECURITY DEFINER search_path fixes ───────────────────────────────────

ALTER FUNCTION is_admin()         SET search_path = public, extensions;
ALTER FUNCTION is_internal_user() SET search_path = public, extensions;
ALTER FUNCTION get_user_role()    SET search_path = public, extensions;
ALTER FUNCTION handle_new_user()  SET search_path = public, extensions;

-- ─── 2. applications ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS applications_update_admin ON applications;
CREATE POLICY applications_update_admin ON applications
  FOR UPDATE TO authenticated
  USING     (is_admin())
  WITH CHECK (is_admin());

-- ─── 3. borrowers ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS borrowers_update_admin ON borrowers;
CREATE POLICY borrowers_update_admin ON borrowers
  FOR UPDATE TO authenticated
  USING     (is_admin())
  WITH CHECK (is_admin());

-- ─── 4. conditions ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS underwriter_update_conditions ON conditions;
CREATE POLICY underwriter_update_conditions ON conditions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = (select auth.uid())
        AND role IN ('admin', 'manager', 'underwriter')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = (select auth.uid())
        AND role IN ('admin', 'manager', 'underwriter')
    )
  );

-- ─── 5. document_requests ────────────────────────────────────────────────────

DROP POLICY IF EXISTS doc_requests_update_admin ON document_requests;
CREATE POLICY doc_requests_update_admin ON document_requests
  FOR UPDATE TO authenticated
  USING     (is_admin())
  WITH CHECK (is_admin());

-- ─── 6. documents ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS documents_update_admin ON documents;
CREATE POLICY documents_update_admin ON documents
  FOR UPDATE TO authenticated
  USING     (is_admin())
  WITH CHECK (is_admin());

-- ─── 7. draws ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS servicing_update_draws ON draws;
CREATE POLICY servicing_update_draws ON draws
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

-- ─── 8. fund_allocations ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS fund_allocations_update_admin ON fund_allocations;
CREATE POLICY fund_allocations_update_admin ON fund_allocations
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = (select auth.uid())
        AND role IN ('admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = (select auth.uid())
        AND role IN ('admin', 'manager')
    )
  );

-- ─── 9. fund_subscriptions ───────────────────────────────────────────────────

DROP POLICY IF EXISTS fund_subscriptions_update_admin ON fund_subscriptions;
CREATE POLICY fund_subscriptions_update_admin ON fund_subscriptions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = (select auth.uid())
        AND role IN ('admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = (select auth.uid())
        AND role IN ('admin', 'manager')
    )
  );

-- ─── 10. funds ───────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS funds_update_admin ON funds;
CREATE POLICY funds_update_admin ON funds
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = (select auth.uid())
        AND role IN ('admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = (select auth.uid())
        AND role IN ('admin', 'manager')
    )
  );

-- ─── 11. investors ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS investors_update_admin ON investors;
CREATE POLICY investors_update_admin ON investors
  FOR UPDATE TO authenticated
  USING     (is_admin())
  WITH CHECK (is_admin());

-- ─── 12. loan_requests ───────────────────────────────────────────────────────

DROP POLICY IF EXISTS loan_requests_update_admin ON loan_requests;
CREATE POLICY loan_requests_update_admin ON loan_requests
  FOR UPDATE TO authenticated
  USING     (is_admin())
  WITH CHECK (is_admin());

-- ─── 13. loans ───────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS admin_update_loans ON loans;
CREATE POLICY admin_update_loans ON loans
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

-- ─── 14. payment_schedule ────────────────────────────────────────────────────

DROP POLICY IF EXISTS servicing_update_schedule ON payment_schedule;
CREATE POLICY servicing_update_schedule ON payment_schedule
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

-- ─── 15. profiles ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS profiles_update_admin ON profiles;
CREATE POLICY profiles_update_admin ON profiles
  FOR UPDATE TO authenticated
  USING     (is_admin())
  WITH CHECK (is_admin());

-- ─── 16. properties ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS properties_update_admin ON properties;
CREATE POLICY properties_update_admin ON properties
  FOR UPDATE TO authenticated
  USING     (is_admin())
  WITH CHECK (is_admin());

-- ─── 17. risk_flags ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS admin_update_risk_flags ON risk_flags;
CREATE POLICY admin_update_risk_flags ON risk_flags
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = (select auth.uid())
        AND role IN ('admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = (select auth.uid())
        AND role IN ('admin', 'manager')
    )
  );

-- ─── 18. tasks ───────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS tasks_update_admin ON tasks;
CREATE POLICY tasks_update_admin ON tasks
  FOR UPDATE TO authenticated
  USING     (is_admin())
  WITH CHECK (is_admin());

-- ─── 19. underwriting_cases ──────────────────────────────────────────────────

DROP POLICY IF EXISTS admin_update_cases ON underwriting_cases;
CREATE POLICY admin_update_cases ON underwriting_cases
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = (select auth.uid())
        AND role IN ('admin', 'manager', 'underwriter')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = (select auth.uid())
        AND role IN ('admin', 'manager', 'underwriter')
    )
  );

-- ─── 20. workflow_triggers ───────────────────────────────────────────────────

DROP POLICY IF EXISTS workflow_triggers_update ON workflow_triggers;
CREATE POLICY workflow_triggers_update ON workflow_triggers
  FOR UPDATE TO authenticated
  USING     (is_admin())
  WITH CHECK (is_admin());
