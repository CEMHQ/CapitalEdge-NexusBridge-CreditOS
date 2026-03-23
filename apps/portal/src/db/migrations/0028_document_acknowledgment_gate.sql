-- Migration 0028: Document acknowledgment gate — Reg A + Reg D compliance
--
-- Reg A Tier 2: investor must acknowledge the offering circular before subscribing.
-- Reg D 506(c): investor must self-certify accredited status (AIQ) before subscribing.
--
-- These fields enforce the correct regulatory sequence:
--   Reg A:  offering circular acknowledged → suitability confirmed → subscribe
--   Reg D:  accreditation verified + AIQ self-certified → subscribe
--
-- Note: PPM pre-delivery ordering (admin sends PPM before subscription) is tracked via
-- ppm_acknowledged_at (set by BoldSign webhook). The approval gate already blocks
-- final activation without it. A future migration may enforce pre-subscription PPM
-- delivery using a dedicated investor_ppm_deliveries junction table.

-- ── fund_subscriptions: add offering_circular_acknowledged_at ─────────────────
ALTER TABLE fund_subscriptions
  ADD COLUMN IF NOT EXISTS offering_circular_acknowledged_at TIMESTAMPTZ;

COMMENT ON COLUMN fund_subscriptions.offering_circular_acknowledged_at IS
  'Timestamp when investor acknowledged reading the offering circular before subscribing (Reg A Tier 2).
   Set by POST /api/fund/subscribe when offering_circular_acknowledged=true is passed.
   Required for Reg A subscriptions; null is allowed for Reg D.';

-- ── investors: add AIQ self-certification fields (Reg D 506(c)) ───────────────
ALTER TABLE investors
  ADD COLUMN IF NOT EXISTS aiq_self_certified_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS aiq_accreditation_basis  TEXT
    CHECK (aiq_accreditation_basis IN (
      'income',          -- $200k individual / $300k joint income for 2 prior years
      'net_worth',       -- net worth > $1M excluding primary residence
      'professional',    -- Series 7/65/82 license holder
      'entity',          -- entity with assets > $5M or all equity owners are accredited
      'other'            -- other qualifying basis
    ));

COMMENT ON COLUMN investors.aiq_self_certified_at IS
  'Timestamp when investor completed the Accredited Investor Questionnaire self-certification.
   Required for Reg D 506(c) subscriptions in addition to admin-verified accreditation_status.
   Set by POST /api/investor/aiq.';

COMMENT ON COLUMN investors.aiq_accreditation_basis IS
  'The accreditation basis the investor self-certified under the AIQ.
   Must match the documentation provided during accreditation verification.';

-- ── Index for fast lookup of Reg A subscriptions missing acknowledgment ────────
CREATE INDEX IF NOT EXISTS idx_fund_subs_circular_ack
  ON fund_subscriptions(offering_circular_acknowledged_at)
  WHERE offering_circular_acknowledged_at IS NULL;
