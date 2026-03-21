-- ─────────────────────────────────────────────────────────────────────────────
-- 0018_reg_a_limits.sql
-- Phase 4 Step 4 (continued): Reg A investor limit enforcement
--   - funds.offering_type: distinguishes Reg A from Reg D / Reg CF offerings
--   - investors.annual_income / investors.net_worth: required to compute
--     the 10%-of-income/net-worth limit for non-accredited investors in Reg A
-- ─────────────────────────────────────────────────────────────────────────────

-- ── funds: add offering type ──────────────────────────────────────────────────
-- Controls which compliance regime applies at subscription time.
-- reg_d → 506(c) accredited-only gate (current default)
-- reg_a → Tier 2; non-accredited investors allowed subject to 10% limit
-- reg_cf → Regulation CF crowdfunding (future)
ALTER TABLE funds
  ADD COLUMN IF NOT EXISTS offering_type TEXT NOT NULL DEFAULT 'reg_d'
    CHECK (offering_type IN ('reg_a', 'reg_d', 'reg_cf'));

-- ── investors: financial profile for Reg A limit calculation ─────────────────
-- Collected during onboarding for non-accredited investors.
-- NULL means unknown → system falls back to $2,500 minimum limit.
ALTER TABLE investors
  ADD COLUMN IF NOT EXISTS annual_income NUMERIC(15, 2),
  ADD COLUMN IF NOT EXISTS net_worth     NUMERIC(15, 2);

-- ── indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_funds_offering_type ON funds(offering_type);
