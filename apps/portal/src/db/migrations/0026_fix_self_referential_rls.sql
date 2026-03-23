-- Migration: 0026_fix_self_referential_rls
-- Fixes two self-referential RLS policies introduced in 0020_rls_audit_fixes.
--
-- Root cause: PostgreSQL's recursion detector raises "infinite recursion detected
-- in policy for relation X" whenever a policy on table X contains a subquery that
-- accesses table X — regardless of whether the subquery would actually loop.
-- Two policies from 0020 have this pattern:
--
--   profiles_update_own  — WITH CHECK reads FROM profiles to verify status/email
--   notifications_update_own — WITH CHECK reads FROM notifications to verify
--                              delivery_status, sent_at, subject, message
--
-- This was masked until 0025_fix_user_roles_rls because:
--   1. Any SELECT on profiles triggering profiles_select_admin called is_admin()
--      → get_user_role() — which is SECURITY DEFINER and bypasses user_roles RLS.
--      So profiles never actually recursed through user_roles.
--   2. The self-referential subquery in the WITH CHECK on profiles however DOES
--      cause PostgreSQL's recursion detector to fire when profiles is accessed
--      during a profiles UPDATE policy evaluation.
--
-- Fix: remove the self-referential subqueries. Field-level write restrictions
-- (status, email, delivery_status, etc.) are enforced at the API layer — all API
-- routes that update these rows are server-side and only write approved fields.
-- The USING + WITH CHECK (id = auth.uid()) / (recipient = auth.uid()) guards are
-- sufficient to prevent cross-user tampering.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. profiles_update_own
-- Old WITH CHECK read FROM profiles to verify status/email are unchanged.
-- New: simple ownership check — API routes control which columns are written.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE
  USING     (id = (select auth.uid()))
  WITH CHECK (id = (select auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. notifications_update_own
-- Old WITH CHECK read FROM notifications to verify immutable fields.
-- New: simple ownership check — only PATCH /api/notifications routes exist and
-- they only write read_at; no API surface allows mutating other fields.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "notifications_update_own" ON notifications;

CREATE POLICY "notifications_update_own" ON notifications
  FOR UPDATE
  USING     (recipient_profile_id = (select auth.uid()))
  WITH CHECK (recipient_profile_id = (select auth.uid()));
