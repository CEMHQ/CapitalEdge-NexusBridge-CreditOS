# NexusBridge CreditOS — SQL Reference: Phase 4 Step 2 — E-Signatures

**Phase:** 4, Step 2 — E-Signatures (BoldSign)
**Related docs:** `docs/implementation plan/Phase4_Implementation_Plan.md`
**Migration:** `0016_esignatures`

SQL migration DDL and verification/audit queries for Phase 4 Step 2.
Run each statement individually in the Supabase SQL Editor.

> For Phase 4 Step 1, see `07_SQL_Phase4-Step1_Workflow.md`.
> Full migration files are in `apps/portal/src/db/migrations/`.

---

## 2. Step 2 — E-Signatures (Dropbox Sign)

> Migration: `0016_esignatures`

### Create signature_requests

```sql
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
```

### Indexes for signature_requests

```sql
CREATE INDEX IF NOT EXISTS idx_signature_requests_entity   ON signature_requests (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_signature_requests_status   ON signature_requests (status);
CREATE INDEX IF NOT EXISTS idx_signature_requests_provider ON signature_requests (provider_request_id);
```

### updated_at trigger for signature_requests

```sql
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
```

### RLS for signature_requests

```sql
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
```

### Add pending_signature to fund_subscriptions

> This extends the existing CHECK constraint. Drop and re-add to modify it safely.

```sql
ALTER TABLE fund_subscriptions
  DROP CONSTRAINT IF EXISTS fund_subscriptions_subscription_status_check;
```

```sql
ALTER TABLE fund_subscriptions
  ADD CONSTRAINT fund_subscriptions_subscription_status_check
  CHECK (subscription_status IN (
    'pending', 'approved', 'rejected', 'pending_signature', 'active', 'redeemed', 'closed'
  ));
```

### Verification — Step 2

```sql
-- Verify signature_requests table exists
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'signature_requests';
```

```sql
-- Verify indexes
SELECT indexname, tablename
FROM pg_indexes
WHERE tablename = 'signature_requests'
  AND indexname LIKE 'idx_%'
ORDER BY indexname;
-- Expected: 3 indexes
```

```sql
-- Verify fund_subscriptions CHECK constraint includes pending_signature
SELECT conname, pg_get_constraintdef(oid) AS constraint_def
FROM pg_constraint
WHERE conname = 'fund_subscriptions_subscription_status_check';
-- pending_signature should appear in the IN list
```

```sql
-- Check RLS on signature_requests
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'signature_requests'
ORDER BY cmd, policyname;
-- Expected: 3 SELECT policies (admin, borrower, investor)
```

### Audit: signature request summary by status

```sql
SELECT
  status,
  document_type,
  entity_type,
  COUNT(*) AS count
FROM signature_requests
GROUP BY status, document_type, entity_type
ORDER BY status, document_type;
```

### Audit: pending signatures (sent but not yet signed)

```sql
SELECT
  sr.id,
  sr.entity_type,
  sr.entity_id,
  sr.document_type,
  sr.status,
  sr.sent_at,
  sr.signers
FROM signature_requests sr
WHERE sr.status IN ('sent', 'viewed')
ORDER BY sr.sent_at ASC;
```

### Audit: completed signatures

```sql
SELECT
  sr.id,
  sr.entity_type,
  sr.document_type,
  sr.completed_at,
  sr.signers
FROM signature_requests sr
WHERE sr.status = 'signed'
ORDER BY sr.completed_at DESC;
```

### Audit: declined or expired requests

```sql
SELECT
  sr.id,
  sr.entity_type,
  sr.document_type,
  sr.status,
  sr.decline_reason,
  sr.declined_at,
  sr.sent_at
FROM signature_requests sr
WHERE sr.status IN ('declined', 'expired', 'voided')
ORDER BY sr.created_at DESC;
```

---

## 3. Step 3 — OCR / Document Intelligence

> Migration: `0017_document_intelligence` (planned)

This step adds OCR extraction results from Ocrolus and Argyle income verification.
Tables to be added: `document_extractions`.

> Not yet implemented. This section will be filled in when Step 3 is built.

---

## 4. Step 4 — Compliance Hardening

> Migration: `0018_compliance_hardening` (planned)

This step adds KYC (Persona), AML (OFAC SDN), Reg A investor limits, and accreditation tracking.
Tables to be added: `kyc_checks`, `aml_checks`, `accreditation_records`, `reg_a_limits`.

> Not yet implemented. This section will be filled in when Step 4 is built.

---

## 5. Cross-Phase Verification Queries

### All Phase 4 tables

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'workflow_triggers', 'workflow_executions',
    'signature_requests'
  )
ORDER BY table_name;
```

### All Phase 4 RLS policies

```sql
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN (
  'workflow_triggers', 'workflow_executions',
  'signature_requests'
)
ORDER BY tablename, cmd, policyname;
```

### All Phase 4 indexes

```sql
SELECT indexname, tablename
FROM pg_indexes
WHERE tablename IN (
  'workflow_triggers', 'workflow_executions',
  'signature_requests'
)
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
```

### Full pipeline: application → signature → status

```sql
SELECT
  a.application_number,
  a.application_status,
  sr.document_type,
  sr.status AS sig_status,
  sr.sent_at,
  sr.completed_at,
  p.full_name AS borrower_name
FROM applications a
JOIN borrowers b ON b.id = a.borrower_id
JOIN profiles p ON p.id = b.profile_id
LEFT JOIN signature_requests sr
  ON sr.entity_type = 'application' AND sr.entity_id = a.id
WHERE a.application_status IN ('approved', 'pending_closing', 'funded')
ORDER BY a.submitted_at DESC;
```

### Workflow activity for a specific event type

```sql
-- Replace 'application_status_changed' with the event type you want
SELECT
  wt.name,
  COUNT(we.id) AS execution_count,
  MAX(we.executed_at) AS last_executed
FROM workflow_triggers wt
LEFT JOIN workflow_executions we ON we.trigger_id = wt.id
WHERE wt.event_type = 'application_status_changed'
GROUP BY wt.id, wt.name
ORDER BY last_executed DESC NULLS LAST;
```
