-- ─────────────────────────────────────────────────────────────────────────────
-- 0024_reg_a_offerings.sql
-- Phase 4 Step 5: Reg A Tier 2 Investor UX — schema foundation
--   - investors.jurisdiction: US state/territory code for jurisdiction screening
--   - offerings: Reg A / Reg D offering campaigns (Form 1-A, qualification dates,
--     min/max investment, SEC file number, jurisdiction restrictions)
--   - offering_documents: Form 1-A, 1-K, 1-SA, 1-U, offering circular, supplements
-- ─────────────────────────────────────────────────────────────────────────────

-- ── investors: jurisdiction for state-level screening ─────────────────────────
-- Two-character US state/territory code (ISO 3166-2 subdivision suffix).
-- NULL means not yet provided — jurisdiction gate is skipped until populated.
ALTER TABLE investors
  ADD COLUMN IF NOT EXISTS jurisdiction TEXT
    CHECK (jurisdiction IS NULL OR (length(jurisdiction) = 2 AND jurisdiction = upper(jurisdiction)));

CREATE INDEX IF NOT EXISTS idx_investors_jurisdiction ON investors(jurisdiction) WHERE jurisdiction IS NOT NULL;

-- ── offerings ─────────────────────────────────────────────────────────────────
-- Tracks a Reg A Tier 2 (or Reg D / Reg CF) offering campaign.
-- Each fund may have multiple offerings over time (successive raises).
CREATE TABLE IF NOT EXISTS offerings (
  id                        UUID        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id                   UUID        NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  offering_type             TEXT        NOT NULL CHECK (offering_type IN ('reg_a', 'reg_d', 'reg_cf')),
  offering_status           TEXT        NOT NULL DEFAULT 'draft'
                              CHECK (offering_status IN ('draft', 'qualified', 'active', 'suspended', 'closed', 'terminated')),
  title                     TEXT        NOT NULL,
  description               TEXT,
  -- Financial terms
  max_offering_amount       NUMERIC(15,2) NOT NULL,
  min_investment            NUMERIC(15,2) NOT NULL DEFAULT 2500,
  max_investment            NUMERIC(15,2),                       -- NULL = no per-investor maximum
  per_share_price           NUMERIC(15,4),                       -- NULL for debt/LP units
  shares_offered            NUMERIC(18,0),                       -- NULL for open-ended offerings
  -- SEC filing
  sec_file_number           TEXT,                                -- e.g. "024-12345"
  qualification_date        DATE,                                -- date SEC qualifies the Form 1-A
  -- Timeline
  offering_open_date        DATE,
  offering_close_date       DATE,
  -- Jurisdiction restrictions: ["CA","TX"] = these states are restricted.
  -- Empty array [] = no state restrictions. NULL treated same as [].
  jurisdiction_restrictions JSONB       NOT NULL DEFAULT '[]'::jsonb,
  -- Standard audit columns
  created_by                UUID        NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── offering_documents ────────────────────────────────────────────────────────
-- SEC filings and investor-facing documents attached to an offering.
-- form_1a          → Form 1-A offering statement (Reg A qualification)
-- form_1a_amendment→ Form 1-A/A (amendment)
-- form_1k          → Form 1-K annual report
-- form_1sa         → Form 1-SA semi-annual report
-- form_1u          → Form 1-U current event report
-- offering_circular→ Final offering circular served to investors
-- supplement       → Offering circular supplement
-- other            → Miscellaneous
CREATE TABLE IF NOT EXISTS offering_documents (
  id            UUID        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id   UUID        NOT NULL REFERENCES offerings(id) ON DELETE CASCADE,
  document_type TEXT        NOT NULL CHECK (document_type IN (
                              'form_1a', 'form_1a_amendment', 'form_1k', 'form_1sa',
                              'form_1u', 'offering_circular', 'supplement', 'other'
                            )),
  label         TEXT        NOT NULL,           -- display name, e.g. "NexusBridge Capital LP Offering Circular"
  file_path     TEXT        NOT NULL,           -- Supabase Storage path (generate signed URL at read time)
  filed_at      DATE,                           -- date filed with SEC (nullable for internal drafts)
  effective_date DATE,                          -- SEC-declared effective date
  created_by    UUID        NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_offerings_fund_id        ON offerings(fund_id);
CREATE INDEX IF NOT EXISTS idx_offerings_status         ON offerings(offering_status);
CREATE INDEX IF NOT EXISTS idx_offerings_type           ON offerings(offering_type);
CREATE INDEX IF NOT EXISTS idx_offerings_close_date     ON offerings(offering_close_date) WHERE offering_close_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_offering_documents_offer ON offering_documents(offering_id);
CREATE INDEX IF NOT EXISTS idx_offering_documents_type  ON offering_documents(offering_id, document_type);

-- ── updated_at triggers (reuse shared function from 0017_compliance_hardening) ─
CREATE TRIGGER offerings_updated_at
  BEFORE UPDATE ON offerings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER offering_documents_updated_at
  BEFORE UPDATE ON offering_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE offerings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE offering_documents ENABLE ROW LEVEL SECURITY;

-- Investors and borrowers: read only active offerings
CREATE POLICY "offerings_select_active" ON offerings
  FOR SELECT TO authenticated
  USING (offering_status = 'active');

-- Admin and managers: full access to all offerings regardless of status
CREATE POLICY "offerings_staff_all" ON offerings
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = (SELECT auth.uid())
        AND role IN ('admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = (SELECT auth.uid())
        AND role IN ('admin', 'manager')
    )
  );

-- Investors and borrowers: read documents for active offerings only
CREATE POLICY "offering_documents_select_active" ON offering_documents
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM offerings o
      WHERE o.id = offering_id
        AND o.offering_status = 'active'
    )
  );

-- Admin and managers: full access to offering documents
CREATE POLICY "offering_documents_staff_all" ON offering_documents
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = (SELECT auth.uid())
        AND role IN ('admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = (SELECT auth.uid())
        AND role IN ('admin', 'manager')
    )
  );
