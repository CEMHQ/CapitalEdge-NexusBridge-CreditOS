-- Migration: 0025_fix_user_roles_rls
-- Fixes infinite recursion in user_roles RLS policies.
--
-- Root cause: user_roles_select_admin (added in 0020_rls_audit_fixes) uses an
-- EXISTS subquery that reads from user_roles itself. Because RLS policies are
-- evaluated for every row-level access, this creates infinite recursion whenever
-- ANY user queries user_roles — including a borrower reading their own role row.
--
-- Fix: replace the self-referencing subquery with get_user_role(), which is
-- SECURITY DEFINER and therefore bypasses RLS when it reads user_roles.
-- This breaks the cycle while preserving the same admin-read semantics.

DROP POLICY IF EXISTS "user_roles_select_admin" ON user_roles;

CREATE POLICY "user_roles_select_admin" ON user_roles
  FOR SELECT
  USING (get_user_role() IN ('admin', 'manager'));
