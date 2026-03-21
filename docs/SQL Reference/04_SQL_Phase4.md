# NexusBridge CreditOS — SQL Reference: Phase 4

**Phase:** 4 — Workflow Automation + E-Signatures
**Migrations:** `0015_workflow_automation`, `0016_esignatures`

SQL migration DDL and verification/audit queries for all Phase 4 steps.
Run each statement individually in the Supabase SQL Editor.

> Full migration files are in `apps/portal/src/db/migrations/`.

---

## Table of Contents

1. [Step 1 — Workflow Automation](#step-1--workflow-automation)
2. [Step 2 — E-Signatures (BoldSign / Dropbox Sign)](#step-2--e-signatures-boldsign--dropbox-sign)
3. [Step 3 — OCR / Document Intelligence (Planned)](#step-3--ocr--document-intelligence-planned)
4. [Step 4 — Compliance Hardening (Planned)](#step-4--compliance-hardening-planned)
5. [Cross-Phase Verification Queries](#cross-phase-verification-queries)

---

## Step 1 — Workflow Automation

> **Related docs:** `docs/11_Event_Driven_Workflow_Engine.md`
> Migration: `0015_workflow_automation`

### Create workflow_triggers

```sql
CREATE TABLE IF NOT EXISTS workflow_triggers (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  description text,
  event_type  text        NOT NULL,
  -- application_status_changed | document_uploaded | document_reviewed |
  -- payment_received | loan_status_changed | subscription_status_changed
  conditions  jsonb       NOT NULL DEFAULT '{}',
  -- Key-value pairs matched against the event payload, e.g. {"new_status": "under_review"}
  actions     jsonb       NOT NULL DEFAULT '[]',
  -- Array of action objects: { type, ...params }
  -- Supported types: create_task | send_notification | assign_case
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid        REFERENCES profiles(id)
);
```

### Indexes for workflow_triggers

```sql
CREATE INDEX IF NOT EXISTS idx_workflow_triggers_event  ON workflow_triggers (event_type);
CREATE INDEX IF NOT EXISTS idx_workflow_triggers_active ON workflow_triggers (is_active);
```

### updated_at trigger for workflow_triggers

```sql
CREATE OR REPLACE FUNCTION update_workflow_triggers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER workflow_triggers_updated_at
  BEFORE UPDATE ON workflow_triggers
  FOR EACH ROW EXECUTE FUNCTION update_workflow_triggers_updated_at();
```

### RLS for workflow_triggers

```sql
ALTER TABLE workflow_triggers ENABLE ROW LEVEL SECURITY;

-- Admin and manager can read all triggers
CREATE POLICY "workflow_triggers_select" ON workflow_triggers
  FOR SELECT USING (is_admin());

-- Only admin can insert/update/delete triggers
CREATE POLICY "workflow_triggers_insert" ON workflow_triggers
  FOR INSERT WITH CHECK (is_admin());

CREATE POLICY "workflow_triggers_update" ON workflow_triggers
  FOR UPDATE USING (is_admin());

CREATE POLICY "workflow_triggers_delete" ON workflow_triggers
  FOR DELETE USING (is_admin());
```

### Create workflow_executions

```sql
-- Immutable audit log of every workflow execution.
-- Append-only — no UPDATE or DELETE policies.
CREATE TABLE IF NOT EXISTS workflow_executions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id       uuid        NOT NULL REFERENCES workflow_triggers(id) ON DELETE CASCADE,
  event_payload    jsonb       NOT NULL DEFAULT '{}',
  execution_status text        NOT NULL DEFAULT 'success',
  -- success | partial_failure | failed
  actions_executed jsonb       NOT NULL DEFAULT '[]',
  -- Array of { type, status, result, error } per action
  duration_ms      integer,
  executed_at      timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now()
);
```

### Indexes for workflow_executions

```sql
CREATE INDEX IF NOT EXISTS idx_workflow_executions_trigger  ON workflow_executions (trigger_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_status   ON workflow_executions (execution_status);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_executed ON workflow_executions (executed_at DESC);
```

### RLS for workflow_executions

```sql
ALTER TABLE workflow_executions ENABLE ROW LEVEL SECURITY;

-- Admin and manager can read execution history
CREATE POLICY "workflow_executions_select" ON workflow_executions
  FOR SELECT USING (is_admin());

-- No client INSERT — all writes go through the service role via fireWorkflowTrigger()
```

### Seed: five priority workflow triggers (all inactive)

```sql
INSERT INTO workflow_triggers (name, description, event_type, conditions, actions, is_active) VALUES

  (
    'Auto-assign underwriting on review',
    'When an application moves to under_review, creates an underwriting task.',
    'application_status_changed',
    '{"new_status": "under_review"}',
    '[
      {
        "type": "create_task",
        "title": "Begin underwriting review",
        "task_owner_type_from": "entity_type",
        "task_owner_id_from": "entity_id",
        "priority": "high",
        "due_days": 3,
        "description": "Application moved to under review. Begin underwriting assessment."
      }
    ]',
    false
  ),

  (
    'Notify team on document upload',
    'When a borrower uploads a document, creates a review task.',
    'document_uploaded',
    '{}',
    '[
      {
        "type": "create_task",
        "title": "Review uploaded document",
        "task_owner_type": "application",
        "task_owner_id_from": "entity_id",
        "priority": "medium",
        "due_days": 2,
        "description": "A new document was uploaded and requires review."
      }
    ]',
    false
  ),

  (
    'Alert on condition satisfaction',
    'When a condition is satisfied, creates a follow-up task for the underwriter.',
    'condition_updated',
    '{"new_status": "satisfied"}',
    '[
      {
        "type": "create_task",
        "title": "Verify satisfied condition",
        "task_owner_type": "underwriting_case",
        "task_owner_id_from": "entity_id",
        "priority": "medium",
        "due_days": 1,
        "description": "A condition was marked satisfied. Verify and update case status."
      }
    ]',
    false
  ),

  (
    'Payment received alert',
    'When a loan payment is recorded, creates a servicing confirmation task.',
    'payment_received',
    '{}',
    '[
      {
        "type": "create_task",
        "title": "Confirm payment applied",
        "task_owner_type": "loan",
        "task_owner_id_from": "entity_id",
        "priority": "low",
        "due_days": 1,
        "description": "A payment was recorded. Confirm it has been applied to the schedule."
      }
    ]',
    false
  ),

  (
    'Delinquency detection alert',
    'When a loan transitions to delinquent status, creates an urgent servicing task.',
    'loan_status_changed',
    '{"new_status": "delinquent"}',
    '[
      {
        "type": "create_task",
        "title": "Delinquency: borrower outreach required",
        "task_owner_type": "loan",
        "task_owner_id_from": "entity_id",
        "priority": "urgent",
        "due_days": 1,
        "description": "Loan has been marked delinquent. Contact borrower immediately."
      }
    ]',
    false
  )

ON CONFLICT DO NOTHING;
```

### Verification — Step 1

```sql
-- Verify tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('workflow_triggers', 'workflow_executions')
ORDER BY table_name;
```

```sql
-- Verify indexes
SELECT indexname, tablename
FROM pg_indexes
WHERE tablename IN ('workflow_triggers', 'workflow_executions')
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
-- Expected: 5 indexes total
```

```sql
-- Verify trigger function exists
SELECT proname FROM pg_proc WHERE proname = 'update_workflow_triggers_updated_at';
```

```sql
-- Verify seeded triggers
SELECT id, name, event_type, is_active FROM workflow_triggers ORDER BY created_at;
-- Expected: 5 rows, all is_active = false
```

```sql
-- Check RLS on workflow tables
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename IN ('workflow_triggers', 'workflow_executions')
  AND schemaname = 'public';
-- rowsecurity should be true for both
```

### Audit: workflow execution summary

```sql
SELECT
  wt.name AS trigger_name,
  wt.event_type,
  wt.is_active,
  COUNT(we.id) AS total_executions,
  SUM(CASE WHEN we.execution_status = 'success' THEN 1 ELSE 0 END) AS successes,
  SUM(CASE WHEN we.execution_status != 'success' THEN 1 ELSE 0 END) AS failures
FROM workflow_triggers wt
LEFT JOIN workflow_executions we ON we.trigger_id = wt.id
GROUP BY wt.id, wt.name, wt.event_type, wt.is_active
ORDER BY wt.created_at;
```

### Audit: recent workflow executions

```sql
SELECT
  we.executed_at,
  we.execution_status,
  we.duration_ms,
  wt.name AS trigger_name,
  wt.event_type,
  we.event_payload
FROM workflow_executions we
JOIN workflow_triggers wt ON wt.id = we.trigger_id
ORDER BY we.executed_at DESC
LIMIT 50;
```

### Audit: failed executions

```sql
SELECT
  we.id,
  we.executed_at,
  wt.name AS trigger_name,
  we.execution_status,
  we.actions_executed
FROM workflow_executions we
JOIN workflow_triggers wt ON wt.id = we.trigger_id
WHERE we.execution_status IN ('partial_failure', 'failed')
ORDER BY we.executed_at DESC;
```

---

## Step 2 — E-Signatures (BoldSign / Dropbox Sign)

> **Related docs:** `docs/implementation plan/Phase4_Implementation_Plan.md`
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

## Step 3 — OCR / Document Intelligence (Planned)

> Migration: `0019_document_intelligence` (planned)

This step adds OCR extraction results from Ocrolus and Argyle income verification.
Tables to be added: `document_extractions`.

> Not yet implemented. This section will be filled in when Step 3 is built.

---

## Step 4 — Compliance Hardening

> Migration: `0017_compliance_hardening`

This step adds KYC (Plaid Identity), AML screening, and 506(c) accreditation tracking.
Tables added: `kyc_verifications`, `aml_screenings`, `accreditation_records`.
Also alters `fund_subscriptions` to add `ppm_acknowledged_at` and `pending_signature` status.

### Tables created

#### accreditation_records

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | gen_random_uuid() |
| investor_id | UUID NOT NULL | FK investors(id) ON DELETE CASCADE |
| verification_method | TEXT NOT NULL | income, net_worth, professional_certification, entity_assets, third_party_letter, manual |
| provider | TEXT NOT NULL DEFAULT 'manual' | verify_investor, parallel_markets, manual |
| provider_reference_id | TEXT | |
| status | TEXT NOT NULL DEFAULT 'pending' | pending, under_review, verified, rejected, expired |
| verified_at | TIMESTAMPTZ | |
| expires_at | TIMESTAMPTZ | 90 days from verification per SEC guidance |
| evidence_document_id | UUID | FK documents(id) ON DELETE SET NULL |
| reviewer_notes | TEXT | |
| reviewed_by | UUID | FK auth.users(id) ON DELETE SET NULL |
| reviewed_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |
| created_by | UUID | FK auth.users(id) ON DELETE SET NULL |

#### kyc_verifications

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | gen_random_uuid() |
| entity_type | TEXT NOT NULL | borrower, investor |
| entity_id | UUID NOT NULL | |
| provider | TEXT NOT NULL DEFAULT 'manual' | persona, jumio, plaid_identity, manual |
| provider_reference_id | TEXT | |
| verification_type | TEXT NOT NULL DEFAULT 'identity' | identity, address, document |
| status | TEXT NOT NULL DEFAULT 'pending' | pending, in_progress, verified, failed, expired |
| result_json | JSONB | |
| failure_reason | TEXT | |
| verified_at | TIMESTAMPTZ | |
| expires_at | TIMESTAMPTZ | |
| retry_count | INTEGER NOT NULL DEFAULT 0 | |
| max_retries | INTEGER NOT NULL DEFAULT 3 | |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |
| created_by | UUID | FK auth.users(id) ON DELETE SET NULL |

#### aml_screenings

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | gen_random_uuid() |
| entity_type | TEXT NOT NULL | borrower, investor |
| entity_id | UUID NOT NULL | |
| provider | TEXT NOT NULL DEFAULT 'manual' | ofac_sdn, dow_jones, lexisnexis, comply_advantage, manual |
| provider_reference_id | TEXT | |
| screening_type | TEXT NOT NULL DEFAULT 'ofac' | ofac, pep, sanctions, adverse_media, full |
| status | TEXT NOT NULL DEFAULT 'pending' | pending, clear, match, false_positive, confirmed_match |
| result_json | JSONB | |
| match_details | TEXT | |
| reviewed_by | UUID | FK auth.users(id) ON DELETE SET NULL |
| reviewed_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |

### fund_subscriptions alteration

`ppm_acknowledged_at TIMESTAMPTZ` column added.
`subscription_status` CHECK constraint updated to include `pending_signature`.

### RLS Policies

| Table | Policy | Role |
|---|---|---|
| accreditation_records | accreditation_records_select_own | investor reads own |
| accreditation_records | accreditation_records_insert_own | investor inserts own |
| accreditation_records | accreditation_records_admin | admin/manager full access |
| kyc_verifications | kyc_verifications_admin | admin/manager full access |
| kyc_verifications | kyc_verifications_select_own_investor | investor reads own |
| aml_screenings | aml_screenings_admin | admin/manager full access |

> Note: `aml_screenings` has no `created_by` column — admin-only table, service-role writes only.

---

## Step 4b — Reg A Investor Limit Enforcement

> Migration: `0018_reg_a_limits`

This migration extends existing tables to support SEC Reg A Tier 2 investment limit enforcement. Non-accredited investors in Reg A offerings are limited to the greater of 10% of annual income or 10% of net worth (minimum $2,500) in any rolling 12-month period. Accredited investors are exempt.

### Alterations

#### funds — offering_type column

```sql
ALTER TABLE funds
  ADD COLUMN IF NOT EXISTS offering_type TEXT NOT NULL DEFAULT 'reg_d'
    CHECK (offering_type IN ('reg_a', 'reg_d', 'reg_cf'));
```

| Value | Regime |
|---|---|
| `reg_d` | 506(c) — accredited investors only (default) |
| `reg_a` | Tier 2 — non-accredited allowed subject to 10% limit |
| `reg_cf` | Regulation CF crowdfunding (future) |

#### investors — financial profile columns

```sql
ALTER TABLE investors
  ADD COLUMN IF NOT EXISTS annual_income NUMERIC(15, 2),
  ADD COLUMN IF NOT EXISTS net_worth     NUMERIC(15, 2);
```

| Column | Type | Notes |
|---|---|---|
| annual_income | NUMERIC(15,2) | NULL = unknown; system falls back to $2,500 minimum limit |
| net_worth | NUMERIC(15,2) | NULL = unknown; system falls back to $2,500 minimum limit |

Collected during onboarding for non-accredited investors in Reg A offerings. Not required for accredited investors or Reg D funds.

### Indexes

| Index | Table | Column |
|---|---|---|
| `idx_funds_offering_type` | `funds` | `offering_type` |

### Reg A limit calculation (application logic)

Limit = `max(annual_income * 0.10, net_worth * 0.10, 2500.00)`. Rolling 12-month commitments are computed at subscription time by querying `fund_subscriptions` joined to `funds` where `offering_type = 'reg_a'` and `created_at >= NOW() - INTERVAL '12 months'`.

---

## Cross-Phase Verification Queries

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
