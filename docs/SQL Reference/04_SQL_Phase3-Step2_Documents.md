# NexusBridge CreditOS — SQL Reference: Phase 3 Step 2 — Documents

**Phase:** 3, Step 2 — Document Management
**Related docs:** `docs/13_Document_Management.md`
**Migration:** `0011_documents`

SQL migration DDL and verification/audit queries for Phase 3 Step 2.
Run each statement individually in the Supabase SQL Editor.

> For prior steps, see `02_SQL_Phase3-Step1_AuditFoundation.md`.
> Full migration files are in `apps/portal/src/db/migrations/`.

---

## 2. Step 2 — Documents

> Migration: `0011_documents`

### Create documents

```sql
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

CREATE INDEX IF NOT EXISTS idx_documents_owner         ON documents (owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_documents_review_status ON documents (review_status);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by   ON documents (uploaded_by);

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
```

### Create document_requests

```sql
CREATE TABLE IF NOT EXISTS document_requests (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_owner_type    text        NOT NULL,
  -- application, borrower, investor, loan
  request_owner_id      uuid        NOT NULL,
  document_type         text        NOT NULL,
  request_status        text        NOT NULL DEFAULT 'open',
  -- open, fulfilled, waived, expired
  due_date              date,
  fulfilled_document_id uuid        REFERENCES documents(id),
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid        REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_doc_requests_owner  ON document_requests (request_owner_type, request_owner_id);
CREATE INDEX IF NOT EXISTS idx_doc_requests_status ON document_requests (request_status);

ALTER TABLE document_requests ENABLE ROW LEVEL SECURITY;

-- Borrowers/investors can see requests addressed to them
CREATE POLICY "doc_requests_select_own" ON document_requests
  FOR SELECT USING (request_owner_id = auth.uid());

-- Admin/staff can see all requests
CREATE POLICY "doc_requests_select_admin" ON document_requests
  FOR SELECT USING (is_admin());

-- Admin/staff can create and update requests
CREATE POLICY "doc_requests_insert_admin" ON document_requests
  FOR INSERT WITH CHECK (is_admin());

CREATE POLICY "doc_requests_update_admin" ON document_requests
  FOR UPDATE USING (is_admin());
```

### Create Supabase Storage buckets

> Run in the Supabase Dashboard → Storage, or via the API. These are not SQL — bucket creation is done through the Supabase UI or Management API.

Buckets to create (all private):
- `borrower-documents`
- `investor-documents`
- `application-documents`
- `loan-documents`

### Verification — Step 2

```sql
-- Verify tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('documents', 'document_requests')
ORDER BY table_name;
```

```sql
-- Check documents table columns
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'documents'
  AND table_schema = 'public'
ORDER BY ordinal_position;
```

```sql
-- Check RLS policies on documents
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'documents'
ORDER BY cmd, policyname;
```

```sql
-- Check Supabase Storage buckets
SELECT id, name, public
FROM storage.buckets
WHERE id IN ('borrower-documents', 'investor-documents', 'application-documents', 'loan-documents');
```

### Audit: documents by status

```sql
SELECT
  upload_status,
  review_status,
  COUNT(*) AS count
FROM documents
GROUP BY upload_status, review_status
ORDER BY upload_status, review_status;
```

### Audit: pending review documents

```sql
SELECT
  d.id,
  d.file_name,
  d.document_type,
  d.owner_type,
  d.file_size_bytes,
  d.created_at,
  p.full_name AS uploader_name,
  p.email AS uploader_email
FROM documents d
LEFT JOIN profiles p ON p.id = d.uploaded_by
WHERE d.upload_status = 'uploaded'
  AND d.review_status = 'pending_review'
ORDER BY d.created_at DESC;
```
