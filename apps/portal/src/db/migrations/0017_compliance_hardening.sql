-- ─────────────────────────────────────────────────────────────────────────────
-- 0017_compliance_hardening.sql
-- Phase 4 Step 4: 506(c) Compliance — accreditation records, KYC/AML tables,
--                 PPM acknowledgment gate, subscription pending_signature status
-- ─────────────────────────────────────────────────────────────────────────────

-- ── accreditation_records ─────────────────────────────────────────────────────
-- One record per verification attempt. Investors can have multiple records over
-- time as accreditation expires and is renewed. The current accreditation status
-- on investors.accreditation_status is the denormalized "latest" value.
CREATE TABLE IF NOT EXISTS accreditation_records (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id            UUID NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
  verification_method    TEXT NOT NULL
                           CHECK (verification_method IN (
                             'income', 'net_worth', 'professional_certification',
                             'entity_assets', 'third_party_letter', 'manual'
                           )),
  provider               TEXT NOT NULL DEFAULT 'manual'
                           CHECK (provider IN (
                             'verify_investor', 'parallel_markets', 'manual'
                           )),
  provider_reference_id  TEXT,
  status                 TEXT NOT NULL DEFAULT 'pending'
                           CHECK (status IN (
                             'pending', 'under_review', 'verified', 'rejected', 'expired'
                           )),
  verified_at            TIMESTAMPTZ,
  expires_at             TIMESTAMPTZ,          -- 90 days from verification per SEC guidance
  evidence_document_id   UUID REFERENCES documents(id) ON DELETE SET NULL,
  reviewer_notes         TEXT,
  reviewed_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at            TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by             UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_accreditation_records_investor_id ON accreditation_records(investor_id);
CREATE INDEX idx_accreditation_records_status      ON accreditation_records(status);
CREATE INDEX idx_accreditation_records_expires_at  ON accreditation_records(expires_at) WHERE expires_at IS NOT NULL;

ALTER TABLE accreditation_records ENABLE ROW LEVEL SECURITY;

-- Investors can read their own records
CREATE POLICY "accreditation_records_select_own" ON accreditation_records
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM investors i WHERE i.id = accreditation_records.investor_id
        AND i.profile_id = auth.uid()
    )
  );

-- Investors can insert their own records (to submit for review)
CREATE POLICY "accreditation_records_insert_own" ON accreditation_records
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM investors i WHERE i.id = accreditation_records.investor_id
        AND i.profile_id = auth.uid()
    )
  );

-- Admin/manager can read and modify all records
CREATE POLICY "accreditation_records_admin" ON accreditation_records
  FOR ALL TO authenticated USING (is_admin())
  WITH CHECK (is_admin());

-- ── kyc_verifications ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kyc_verifications (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type            TEXT NOT NULL CHECK (entity_type IN ('borrower', 'investor')),
  entity_id              UUID NOT NULL,
  provider               TEXT NOT NULL DEFAULT 'manual'
                           CHECK (provider IN ('persona', 'jumio', 'plaid_identity', 'manual')),
  provider_reference_id  TEXT,
  verification_type      TEXT NOT NULL DEFAULT 'identity'
                           CHECK (verification_type IN ('identity', 'address', 'document')),
  status                 TEXT NOT NULL DEFAULT 'pending'
                           CHECK (status IN (
                             'pending', 'in_progress', 'verified', 'failed', 'expired'
                           )),
  result_json            JSONB,
  failure_reason         TEXT,
  verified_at            TIMESTAMPTZ,
  expires_at             TIMESTAMPTZ,
  retry_count            INTEGER NOT NULL DEFAULT 0,
  max_retries            INTEGER NOT NULL DEFAULT 3,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by             UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_kyc_verifications_entity   ON kyc_verifications(entity_type, entity_id);
CREATE INDEX idx_kyc_verifications_status   ON kyc_verifications(status);

ALTER TABLE kyc_verifications ENABLE ROW LEVEL SECURITY;

-- Admin/manager only — KYC data is sensitive
CREATE POLICY "kyc_verifications_admin" ON kyc_verifications
  FOR ALL TO authenticated USING (is_admin())
  WITH CHECK (is_admin());

-- Investors can read their own KYC record
CREATE POLICY "kyc_verifications_select_own_investor" ON kyc_verifications
  FOR SELECT TO authenticated USING (
    entity_type = 'investor' AND EXISTS (
      SELECT 1 FROM investors i WHERE i.id = kyc_verifications.entity_id
        AND i.profile_id = auth.uid()
    )
  );

-- ── aml_screenings ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS aml_screenings (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type            TEXT NOT NULL CHECK (entity_type IN ('borrower', 'investor')),
  entity_id              UUID NOT NULL,
  provider               TEXT NOT NULL DEFAULT 'manual'
                           CHECK (provider IN ('ofac_sdn', 'dow_jones', 'lexisnexis', 'comply_advantage', 'manual')),
  provider_reference_id  TEXT,
  screening_type         TEXT NOT NULL DEFAULT 'ofac'
                           CHECK (screening_type IN ('ofac', 'pep', 'sanctions', 'adverse_media', 'full')),
  status                 TEXT NOT NULL DEFAULT 'pending'
                           CHECK (status IN (
                             'pending', 'clear', 'match', 'false_positive', 'confirmed_match'
                           )),
  result_json            JSONB,
  match_details          TEXT,
  reviewed_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at            TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_aml_screenings_entity ON aml_screenings(entity_type, entity_id);
CREATE INDEX idx_aml_screenings_status ON aml_screenings(status);

ALTER TABLE aml_screenings ENABLE ROW LEVEL SECURITY;

-- Admin/manager only — AML data must not be visible to subjects
CREATE POLICY "aml_screenings_admin" ON aml_screenings
  FOR ALL TO authenticated USING (is_admin())
  WITH CHECK (is_admin());

-- ── fund_subscriptions: add ppm_acknowledged_at + pending_signature status ────
ALTER TABLE fund_subscriptions
  ADD COLUMN IF NOT EXISTS ppm_acknowledged_at TIMESTAMPTZ;

-- Drop old CHECK constraint and recreate with pending_signature added
ALTER TABLE fund_subscriptions
  DROP CONSTRAINT IF EXISTS fund_subscriptions_subscription_status_check;

ALTER TABLE fund_subscriptions
  ADD CONSTRAINT fund_subscriptions_subscription_status_check
  CHECK (subscription_status IN (
    'pending', 'approved', 'rejected', 'active',
    'pending_signature', 'redeemed', 'closed'
  ));

-- ── updated_at triggers ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER accreditation_records_updated_at
  BEFORE UPDATE ON accreditation_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER kyc_verifications_updated_at
  BEFORE UPDATE ON kyc_verifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER aml_screenings_updated_at
  BEFORE UPDATE ON aml_screenings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
