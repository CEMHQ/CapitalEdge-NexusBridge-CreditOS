-- ─────────────────────────────────────────────────────────────────────────────
-- 0023_document_intelligence.sql
-- Phase 4 Step 3: OCR / Document Intelligence
--   - document_extractions: stores OCR extraction results per document
--   - extraction_field_mappings: per-field review and override records
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. document_extractions ─────────────────────────────────────────────────
-- Stores the result of an OCR extraction run against a document.
-- One document can have multiple extraction attempts (e.g. retry after failure).
-- Records are immutable after creation; corrections go in extraction_field_mappings.

CREATE TABLE IF NOT EXISTS document_extractions (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id       uuid        NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  provider_name     text        NOT NULL,
  -- 'ocrolus' | 'argyle' | 'manual'
  extraction_status text        NOT NULL DEFAULT 'pending',
  -- 'pending' | 'processing' | 'completed' | 'failed' | 'reviewed' | 'accepted' | 'rejected'
  extracted_json    jsonb,
  -- structured output from the OCR provider; may be NULL until completed
  raw_text          text,
  -- full extracted text (Restricted PII — access logged; nulled after review)
  confidence_score  numeric(5,2),
  -- overall document confidence 0.00–100.00
  provider_job_id   text,
  -- external job/request ID from the provider (for webhook correlation)
  failure_reason    text,
  -- set when extraction_status = 'failed'
  reviewed_by       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  CONSTRAINT chk_extraction_status CHECK (extraction_status IN (
    'pending', 'processing', 'completed', 'failed', 'reviewed', 'accepted', 'rejected'
  )),
  CONSTRAINT chk_provider_name CHECK (provider_name IN ('ocrolus', 'argyle', 'manual')),
  CONSTRAINT chk_confidence_range CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 100))
);

CREATE INDEX IF NOT EXISTS idx_extractions_document_id ON document_extractions (document_id);
CREATE INDEX IF NOT EXISTS idx_extractions_status      ON document_extractions (extraction_status);
CREATE INDEX IF NOT EXISTS idx_extractions_provider_job ON document_extractions (provider_job_id) WHERE provider_job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_extractions_created_at  ON document_extractions (created_at DESC);

ALTER TABLE document_extractions ENABLE ROW LEVEL SECURITY;

-- Admin and manager: full access
CREATE POLICY "extractions_select_admin" ON document_extractions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = (select auth.uid())
        AND role IN ('admin', 'manager', 'underwriter')
    )
  );

CREATE POLICY "extractions_insert_admin" ON document_extractions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = (select auth.uid())
        AND role IN ('admin', 'manager', 'underwriter')
    )
  );

CREATE POLICY "extractions_update_admin" ON document_extractions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = (select auth.uid())
        AND role IN ('admin', 'manager', 'underwriter')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = (select auth.uid())
        AND role IN ('admin', 'manager', 'underwriter')
    )
  );

-- ─── 2. extraction_field_mappings ────────────────────────────────────────────
-- One row per extracted field per extraction run.
-- The reviewer accepts, rejects, or overrides each field before it can be
-- applied to the application. Records are immutable; corrections use override_value.

CREATE TABLE IF NOT EXISTS extraction_field_mappings (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  extraction_id    uuid        NOT NULL REFERENCES document_extractions(id) ON DELETE CASCADE,
  source_field     text        NOT NULL,
  -- field name from the OCR provider JSON (e.g. 'average_daily_balance')
  target_entity    text        NOT NULL,
  -- 'application' | 'borrower' | 'property'
  target_field     text        NOT NULL,
  -- corresponding field in the target entity (e.g. 'bank_balance_avg_3mo')
  extracted_value  text,
  -- raw value from provider (stored as text, parsed on apply)
  confidence       numeric(5,2),
  -- per-field confidence 0.00–100.00
  status           text        NOT NULL DEFAULT 'pending',
  -- 'pending' | 'accepted' | 'rejected' | 'overridden'
  override_value   text,
  -- human-entered correction; used instead of extracted_value when status='overridden'
  reviewed_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_mapping_status CHECK (status IN ('pending', 'accepted', 'rejected', 'overridden')),
  CONSTRAINT chk_target_entity  CHECK (target_entity IN ('application', 'borrower', 'property')),
  CONSTRAINT chk_field_confidence CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 100)),
  CONSTRAINT chk_override_requires_value CHECK (
    status != 'overridden' OR override_value IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_field_mappings_extraction_id ON extraction_field_mappings (extraction_id);
CREATE INDEX IF NOT EXISTS idx_field_mappings_status        ON extraction_field_mappings (status);
CREATE INDEX IF NOT EXISTS idx_field_mappings_target        ON extraction_field_mappings (target_entity, target_field);

ALTER TABLE extraction_field_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "field_mappings_select_admin" ON extraction_field_mappings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = (select auth.uid())
        AND role IN ('admin', 'manager', 'underwriter')
    )
  );

CREATE POLICY "field_mappings_insert_admin" ON extraction_field_mappings
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = (select auth.uid())
        AND role IN ('admin', 'manager', 'underwriter')
    )
  );

CREATE POLICY "field_mappings_update_admin" ON extraction_field_mappings
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = (select auth.uid())
        AND role IN ('admin', 'manager', 'underwriter')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = (select auth.uid())
        AND role IN ('admin', 'manager', 'underwriter')
    )
  );
