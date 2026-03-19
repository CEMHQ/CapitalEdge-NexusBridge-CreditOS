-- Migration: 0011_documents
-- Creates documents and document_requests tables.
-- Documents are uploaded directly to Supabase Storage via signed URLs —
-- files never pass through the API server.
--
-- Run each statement separately in the Supabase SQL Editor.

-- ─── 1. documents ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type       text        NOT NULL,
  -- borrower, investor, application, loan
  owner_id         uuid        NOT NULL,
  document_type    text        NOT NULL,
  -- id, tax_return, bank_statement, appraisal, agreement, promissory_note,
  -- deed_of_trust, insurance, title_report, draw_request, k1, statement,
  -- subscription_agreement, closing_disclosure, payoff_letter
  file_name        text        NOT NULL,
  storage_path     text        NOT NULL,
  mime_type        text        NOT NULL,
  file_size_bytes  bigint      NOT NULL,
  upload_status    text        NOT NULL DEFAULT 'pending',
  -- pending, uploaded, failed
  review_status    text        NOT NULL DEFAULT 'pending_review',
  -- pending_review, under_review, verified, rejected, expired
  rejection_reason text,
  reviewed_by      uuid        REFERENCES profiles(id),
  reviewed_at      timestamptz,
  expires_at       timestamptz,
  uploaded_by      uuid        NOT NULL REFERENCES profiles(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ─── 2. Indexes for documents ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_documents_owner         ON documents (owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_documents_review_status ON documents (review_status);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by   ON documents (uploaded_by);

-- ─── 3. RLS for documents ─────────────────────────────────────────────────────
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Uploading user can see their own documents
CREATE POLICY "documents_select_own" ON documents
  FOR SELECT USING (uploaded_by = auth.uid());

-- Admin/staff can see all documents
CREATE POLICY "documents_select_admin" ON documents
  FOR SELECT USING (is_admin());

-- Admin/staff can update documents (review_status, rejection_reason)
CREATE POLICY "documents_update_admin" ON documents
  FOR UPDATE USING (is_admin());

-- ─── 4. document_requests ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_requests (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_owner_type   text        NOT NULL,
  -- application, borrower, investor, loan
  request_owner_id     uuid        NOT NULL,
  document_type        text        NOT NULL,
  request_status       text        NOT NULL DEFAULT 'open',
  -- open, fulfilled, waived, expired
  due_date             date,
  fulfilled_document_id uuid       REFERENCES documents(id),
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid        REFERENCES profiles(id)
);

-- ─── 5. Indexes for document_requests ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_doc_requests_owner  ON document_requests (request_owner_type, request_owner_id);
CREATE INDEX IF NOT EXISTS idx_doc_requests_status ON document_requests (request_status);

-- ─── 6. RLS for document_requests ────────────────────────────────────────────
ALTER TABLE document_requests ENABLE ROW LEVEL SECURITY;

-- Borrowers/investors can see requests addressed to them
CREATE POLICY "doc_requests_select_own" ON document_requests
  FOR SELECT USING (
    request_owner_id = auth.uid()
  );

-- Admin/staff can see all requests
CREATE POLICY "doc_requests_select_admin" ON document_requests
  FOR SELECT USING (is_admin());

-- Admin/staff can create and update requests
CREATE POLICY "doc_requests_insert_admin" ON document_requests
  FOR INSERT WITH CHECK (is_admin());

CREATE POLICY "doc_requests_update_admin" ON document_requests
  FOR UPDATE USING (is_admin());
