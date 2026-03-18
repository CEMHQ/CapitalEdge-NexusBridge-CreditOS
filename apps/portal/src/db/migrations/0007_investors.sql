-- Migration: 0007_investors
-- Creates the investors table for accredited investor onboarding.
-- Mirrors the borrowers table pattern — one row per profile_id.
-- Full fund accounting (capital accounts, distributions, NAV) is Phase 3.
--
-- Run each statement separately in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS investors (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id            uuid        NOT NULL UNIQUE REFERENCES profiles(id),
  investor_type         text        NOT NULL DEFAULT 'individual',
  accreditation_status  text        NOT NULL DEFAULT 'pending',
  kyc_status            text        NOT NULL DEFAULT 'not_started',
  aml_status            text        NOT NULL DEFAULT 'not_started',
  onboarding_status     text        NOT NULL DEFAULT 'pending',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_investors_profile_id ON investors(profile_id);

ALTER TABLE investors ENABLE ROW LEVEL SECURITY;

-- Investors can read their own record
CREATE POLICY "investors_select_own" ON investors
  FOR SELECT USING (profile_id = auth.uid());

-- Investors can insert their own record (for self-onboarding)
CREATE POLICY "investors_insert_own" ON investors
  FOR INSERT WITH CHECK (profile_id = auth.uid());

-- Admin/staff can read all investor records
CREATE POLICY "investors_select_admin" ON investors
  FOR SELECT USING (is_admin());

-- Admin/staff can update investor records (e.g. accreditation_status, kyc_status)
CREATE POLICY "investors_update_admin" ON investors
  FOR UPDATE USING (is_admin());
