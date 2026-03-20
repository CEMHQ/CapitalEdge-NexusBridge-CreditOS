-- Migration: 0016_esignatures
-- Creates signature_requests table for Phase 4 Step 2 (Dropbox Sign integration).
-- Also adds pending_closing to application status and pending_signature to fund_subscriptions.
--
-- Run each block separately in the Supabase SQL Editor.

-- ─── 1. signature_requests ────────────────────────────────────────────────────
-- Tracks every e-signature envelope sent via Dropbox Sign.
-- Links to the entity being signed (application or subscription).

CREATE TABLE IF NOT EXISTS signature_requests (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type           text        NOT NULL,
  -- application | subscription
  entity_id             uuid        NOT NULL,
  provider              text        NOT NULL DEFAULT 'dropbox_sign',
  provider_request_id   text,
  -- External signature request ID from Dropbox Sign
  template_id           text,
  -- Dropbox Sign template ID used
  document_type         text        NOT NULL,
  -- promissory_note | deed_of_trust | loan_agreement | subscription_agreement
  status                text        NOT NULL DEFAULT 'draft',
  -- draft | sent | viewed | signed | declined | expired | voided
  signers               jsonb       NOT NULL DEFAULT '[]',
  -- Array of { name, email, role, order, signed_at }
  sent_at               timestamptz,
  completed_at          timestamptz,
  declined_at           timestamptz,
  decline_reason        text,
  signed_document_id    uuid        REFERENCES documents(id) ON DELETE SET NULL,
  -- Populated after Dropbox Sign webhook delivers the signed PDF
  callback_url          text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid        REFERENCES profiles(id)
);

-- ─── 2. Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_signature_requests_entity  ON signature_requests (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_signature_requests_status  ON signature_requests (status);
CREATE INDEX IF NOT EXISTS idx_signature_requests_provider ON signature_requests (provider_request_id);

-- ─── 3. updated_at trigger ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_signature_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER signature_requests_updated_at
  BEFORE UPDATE ON signature_requests
  FOR EACH ROW EXECUTE FUNCTION update_signature_requests_updated_at();

-- ─── 4. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE signature_requests ENABLE ROW LEVEL SECURITY;

-- Admin and manager can read all signature requests
CREATE POLICY "signature_requests_select_admin" ON signature_requests
  FOR SELECT USING (is_admin());

-- Borrower can see signature requests for their own applications
CREATE POLICY "signature_requests_select_borrower" ON signature_requests
  FOR SELECT USING (
    entity_type = 'application'
    AND EXISTS (
      SELECT 1 FROM applications a
      JOIN borrowers b ON b.id = a.borrower_id
      WHERE a.id = entity_id
        AND b.profile_id = auth.uid()
    )
  );

-- Investor can see signature requests for their own subscriptions
CREATE POLICY "signature_requests_select_investor" ON signature_requests
  FOR SELECT USING (
    entity_type = 'subscription'
    AND EXISTS (
      SELECT 1 FROM fund_subscriptions fs
      JOIN investors i ON i.id = fs.investor_id
      WHERE fs.id = entity_id
        AND i.profile_id = auth.uid()
    )
  );

-- No client INSERT/UPDATE — all writes go through service role

-- ─── 5. Add pending_closing to fund_subscriptions ─────────────────────────────
-- The subscription flow gains a pending_signature state between approved and active.
ALTER TABLE fund_subscriptions
  DROP CONSTRAINT IF EXISTS fund_subscriptions_subscription_status_check;

ALTER TABLE fund_subscriptions
  ADD CONSTRAINT fund_subscriptions_subscription_status_check
  CHECK (subscription_status IN (
    'pending', 'approved', 'rejected', 'pending_signature', 'active', 'redeemed', 'closed'
  ));
