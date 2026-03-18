-- Migration: 0004_rls_admin_update_policies
-- Adds missing UPDATE policies for admin/staff roles.
--
-- Root cause: Migration 0003 added SELECT and one UPDATE (applications) but omitted
-- UPDATE policies for loan_requests, profiles, borrowers, and properties.
--
-- Active bug fixed here:
--   loan_requests_update_admin — the underwriter metrics form (LTV/LTC/DSCR) was
--   silently discarded at the DB layer even when the API route authorized the request.
--
-- Run each statement separately in the Supabase SQL Editor.

-- loan_requests: admin/underwriter can update underwriting metrics (LTV, LTC, DSCR)
CREATE POLICY "loan_requests_update_admin" ON loan_requests
  FOR UPDATE USING (is_admin());

-- profiles: admin/manager can update profiles (e.g. suspend a user, update status)
CREATE POLICY "profiles_update_admin" ON profiles
  FOR UPDATE USING (is_admin());

-- borrowers: admin/underwriter can update borrower records (e.g. kyc_status, aml_status)
CREATE POLICY "borrowers_update_admin" ON borrowers
  FOR UPDATE USING (is_admin());

-- properties: admin can correct property data submitted by borrowers
CREATE POLICY "properties_update_admin" ON properties
  FOR UPDATE USING (is_admin());
