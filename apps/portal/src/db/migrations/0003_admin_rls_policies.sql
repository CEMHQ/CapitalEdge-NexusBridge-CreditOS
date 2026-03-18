-- Migration: 0003_admin_rls_policies
-- Grants admin and manager roles read access to all borrower/application data
-- Run in Supabase SQL Editor

-- Helper function: check if current user has an admin or manager role
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'manager', 'underwriter', 'servicing')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- profiles: admin can read all
CREATE POLICY "profiles_select_admin" ON profiles
  FOR SELECT USING (is_admin());

-- borrowers: admin can read all
CREATE POLICY "borrowers_select_admin" ON borrowers
  FOR SELECT USING (is_admin());

-- applications: admin can read and update all
CREATE POLICY "applications_select_admin" ON applications
  FOR SELECT USING (is_admin());

CREATE POLICY "applications_update_admin" ON applications
  FOR UPDATE USING (is_admin());

-- properties: admin can read all
CREATE POLICY "properties_select_admin" ON properties
  FOR SELECT USING (is_admin());

-- loan_requests: admin can read all
CREATE POLICY "loan_requests_select_admin" ON loan_requests
  FOR SELECT USING (is_admin());
