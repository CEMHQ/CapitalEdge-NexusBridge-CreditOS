-- Migration: 0002_profiles_insert_policy
-- Adds the missing INSERT policy for profiles so borrowers can upsert their own profile row.
-- This was originally applied manually in the Supabase SQL Editor to fix:
--   "new row violates row-level security policy for table profiles"
-- This file documents that fix for migration history completeness.
-- If this policy already exists, the statement is safe to re-run (CREATE POLICY will error —
-- check first with: SELECT policyname FROM pg_policies WHERE tablename = 'profiles')

CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT WITH CHECK (id = auth.uid());
