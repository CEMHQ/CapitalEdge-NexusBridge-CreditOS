# NexusBridge CreditOS — SQL Reference: Phase 3

**Phase:** 3 — Loan Lifecycle + Fund Operations
**Migrations:** `0009_extensions`, `0010_underwriting`, `0011_documents`, `0012_loans`, `0013_fund_operations`, `0014_audit_operations`

SQL migration DDL and verification/audit queries for all Phase 3 steps.
Run each statement individually in the Supabase SQL Editor.

> Core schema DDL is in `01_SQL_CoreSchema.md`. Auth and RLS policies are in `02_SQL_Phase2_AuthRoles.md`.
> Full migration files are in `apps/portal/src/db/migrations/`.

---

## Table of Contents

1. [Step 1 — Foundation (Audit, Notifications, Tasks)](#step-1--foundation)
2. [Step 2 — Documents](#step-2--documents)
3. [Step 3 — Underwriting Engine](#step-3--underwriting-engine)
4. [Step 4 — Loan Lifecycle](#step-4--loan-lifecycle)
5. [Step 5 — Fund Operations](#step-5--fund-operations)
6. [Cross-Phase Verification Queries](#cross-phase-verification-queries)

---

## Step 1 — Foundation

> **Related docs:** `docs/15_Data_Security_Audit_Framework.md`
> Migration: `0009_extensions`, `0014_audit_operations`

### Enable extensions

```sql
-- Enable pg_partman (Supabase installs it in the 'extensions' schema, NOT 'partman')
CREATE EXTENSION IF NOT EXISTS pg_partman SCHEMA partman;

-- Enable pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;
```

### Schedule pg_partman maintenance (hourly)

```sql
-- Runs hourly — creates future partitions and drops expired ones
SELECT cron.schedule(
  'partman-maintenance',
  '0 * * * *',
  $$SELECT extensions.run_maintenance_proc()$$
);
```

### Create audit_events (partitioned monthly)

```sql
-- Immutable record of every sensitive action in the system.
-- Append-only — no UPDATE or DELETE policies.
CREATE TABLE IF NOT EXISTS audit_events (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  actor_profile_id uuid        REFERENCES profiles(id),
  event_type       text        NOT NULL,
  -- loan_status_change, underwriting_decision, document_action, payment_recorded,
  -- distribution_issued, capital_call_issued, override, permission_change
  entity_type      text,
  -- loan, application, document, subscription, fund
  entity_id        uuid,
  old_value        jsonb,
  new_value        jsonb,
  ip_address       inet,
  user_agent       text,
  event_payload    jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);
```

### Register audit_events with pg_partman

```sql
-- pg_partman creates its own default partition — do NOT manually create one first.
-- Supabase uses 'extensions' schema, not 'partman'
SELECT extensions.create_parent(
  p_parent_table   => 'public.audit_events',
  p_control        => 'created_at',
  p_type           => 'range',
  p_interval       => '1 month',
  p_premake        => 3
);
```

### Indexes and RLS for audit_events

```sql
CREATE INDEX IF NOT EXISTS idx_audit_events_actor     ON audit_events (actor_profile_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_entity    ON audit_events (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_type      ON audit_events (event_type);
CREATE INDEX IF NOT EXISTS idx_audit_events_created   ON audit_events (created_at DESC);

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

-- Only admin/manager can read audit events
CREATE POLICY "audit_events_select_admin" ON audit_events
  FOR SELECT USING (is_admin());

-- No client INSERT — all writes go through the service role via emitAuditEvent()
```

### Create activity_logs (partitioned weekly)

> **Troubleshooting note:** If `activity_logs_default` already exists (e.g. from a prior failed run),
> detach and drop it before calling `create_parent`, otherwise you'll get a conflict error.
>
> ```sql
> -- Only if activity_logs_default exists:
> ALTER TABLE activity_logs DETACH PARTITION activity_logs_default;
> DROP TABLE activity_logs_default;
> -- Then re-run the CREATE TABLE and create_parent below
> ```
>
> Diagnostic query to check:
> ```sql
> SELECT tablename, schemaname FROM pg_tables WHERE tablename LIKE 'activity_logs%';
> ```

```sql
-- High-frequency user-facing event log (page views, form submissions, etc.)
CREATE TABLE IF NOT EXISTS activity_logs (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  actor_profile_id uuid        REFERENCES profiles(id),
  entity_type      text        NOT NULL,
  entity_id        uuid        NOT NULL,
  action           text        NOT NULL,
  -- created, updated, viewed, uploaded, approved, rejected, funded
  metadata         jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);
```

### Register activity_logs with pg_partman

```sql
SELECT extensions.create_parent(
  p_parent_table   => 'public.activity_logs',
  p_control        => 'created_at',
  p_type           => 'range',
  p_interval       => '7 days',
  p_premake        => 4
);
```

### Indexes and RLS for activity_logs

```sql
CREATE INDEX IF NOT EXISTS idx_activity_logs_actor   ON activity_logs (actor_profile_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity  ON activity_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs (created_at DESC);

ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_logs_select_admin" ON activity_logs
  FOR SELECT USING (is_admin());
```

### Create notifications

```sql
CREATE TABLE IF NOT EXISTS notifications (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_profile_id uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  notification_type    text        NOT NULL DEFAULT 'in_app',
  -- in_app, email, sms
  subject              text,
  message              text        NOT NULL,
  link_url             text,
  delivery_status      text        NOT NULL DEFAULT 'pending',
  -- pending, sent, failed, read
  created_at           timestamptz NOT NULL DEFAULT now(),
  sent_at              timestamptz,
  read_at              timestamptz
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications (recipient_profile_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status    ON notifications (delivery_status);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can read their own notifications
CREATE POLICY "notifications_select_own" ON notifications
  FOR SELECT USING (recipient_profile_id = auth.uid());

-- Users can mark their own notifications as read
CREATE POLICY "notifications_update_own" ON notifications
  FOR UPDATE USING (recipient_profile_id = auth.uid());

-- Admin can read all notifications
CREATE POLICY "notifications_select_admin" ON notifications
  FOR SELECT USING (is_admin());
```

### Create tasks

```sql
CREATE TABLE IF NOT EXISTS tasks (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_owner_type text        NOT NULL,
  -- application, loan, underwriting_case, investor
  task_owner_id   uuid        NOT NULL,
  assigned_to     uuid        REFERENCES profiles(id),
  title           text        NOT NULL,
  description     text,
  task_status     text        NOT NULL DEFAULT 'open',
  -- open, in_progress, completed, cancelled
  priority        text        NOT NULL DEFAULT 'medium',
  -- low, medium, high, urgent
  due_date        date,
  created_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  created_by      uuid        REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_tasks_owner    ON tasks (task_owner_type, task_owner_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks (assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_status   ON tasks (task_status);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Assigned user can see their tasks
CREATE POLICY "tasks_select_assigned" ON tasks
  FOR SELECT USING (assigned_to = auth.uid());

-- Admin/staff can read all tasks
CREATE POLICY "tasks_select_admin" ON tasks
  FOR SELECT USING (is_admin());

-- Admin/staff can insert tasks
CREATE POLICY "tasks_insert_admin" ON tasks
  FOR INSERT WITH CHECK (is_admin());

-- Admin/staff can update tasks
CREATE POLICY "tasks_update_admin" ON tasks
  FOR UPDATE USING (is_admin());
```

### Verification — Step 1

```sql
-- Verify extensions are enabled
SELECT extname, nspname AS schema
FROM pg_extension
JOIN pg_namespace ON pg_extension.extnamespace = pg_namespace.oid
WHERE extname IN ('pg_partman', 'pg_cron')
ORDER BY extname;
```

```sql
-- Verify pg_cron maintenance job
SELECT jobid, schedule, command FROM cron.job;
-- Expected: 1 row with hourly maintenance schedule
```

```sql
-- Verify partitioned tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('audit_events', 'activity_logs', 'notifications', 'tasks')
ORDER BY table_name;
```

```sql
-- Verify pg_partman is managing the partitions
SELECT parent_table, partition_interval, partition_type
FROM extensions.part_config
WHERE parent_table IN ('public.audit_events', 'public.activity_logs');
-- Expected: audit_events = '1 month', activity_logs = '7 days'
```

```sql
-- Check triggers on foundation tables
SELECT tgname, tgrelid::regclass AS table_name
FROM pg_trigger
WHERE tgrelid::regclass::text IN ('audit_events', 'activity_logs', 'notifications', 'tasks')
ORDER BY tgrelid::regclass;
```

```sql
-- Check RLS on foundation tables
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename IN ('audit_events', 'activity_logs', 'notifications', 'tasks')
  AND schemaname = 'public';
-- rowsecurity should be true for all
```

---

## Step 2 — Documents

> **Related docs:** `docs/13_Document_Management.md`
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

---

## Step 3 — Underwriting Engine

> **Related docs:** `docs/08_Underwriting_Rules_Engine.md`
> Migration: `0010_underwriting`

### Create underwriting_cases

```sql
CREATE TABLE IF NOT EXISTS underwriting_cases (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id    UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  assigned_to       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  case_status       TEXT NOT NULL DEFAULT 'open'
                      CHECK (case_status IN ('open', 'in_review', 'decision_made', 'closed')),
  priority          TEXT NOT NULL DEFAULT 'normal'
                      CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  opened_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at         TIMESTAMPTZ,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_underwriting_cases_application_id ON underwriting_cases(application_id);
CREATE INDEX idx_underwriting_cases_assigned_to    ON underwriting_cases(assigned_to);
CREATE INDEX idx_underwriting_cases_case_status    ON underwriting_cases(case_status);
```

### Create underwriting_decisions

```sql
CREATE TABLE IF NOT EXISTS underwriting_decisions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id               UUID NOT NULL REFERENCES underwriting_cases(id) ON DELETE CASCADE,
  decision_type         TEXT NOT NULL
                          CHECK (decision_type IN ('conditional_approval', 'approval', 'decline', 'hold', 'override')),
  approved_amount       NUMERIC(15, 2),
  approved_rate         NUMERIC(8, 6),   -- e.g. 0.120000 = 12%
  approved_term_months  INTEGER,
  approved_ltv          NUMERIC(6, 4),
  approved_ltc          NUMERIC(6, 4),
  conditions_summary    TEXT,
  decision_notes        TEXT,
  decided_by            UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  decided_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_underwriting_decisions_case_id ON underwriting_decisions(case_id);
```

### Create conditions

```sql
CREATE TABLE IF NOT EXISTS conditions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id          UUID NOT NULL REFERENCES underwriting_cases(id) ON DELETE CASCADE,
  condition_type   TEXT NOT NULL
                     CHECK (condition_type IN ('appraisal', 'insurance', 'title', 'document', 'financial', 'compliance')),
  description      TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open', 'satisfied', 'waived')),
  satisfied_at     TIMESTAMPTZ,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_conditions_case_id ON conditions(case_id);
CREATE INDEX idx_conditions_status  ON conditions(status);
```

### Create risk_flags

```sql
CREATE TABLE IF NOT EXISTS risk_flags (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id      UUID NOT NULL REFERENCES underwriting_cases(id) ON DELETE CASCADE,
  flag_type    TEXT NOT NULL,
  severity     TEXT NOT NULL DEFAULT 'medium'
                 CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  description  TEXT NOT NULL,
  source       TEXT NOT NULL DEFAULT 'system'
                 CHECK (source IN ('system', 'manual')),
  resolved     BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_risk_flags_case_id  ON risk_flags(case_id);
CREATE INDEX idx_risk_flags_severity ON risk_flags(severity);
```

### Create set_updated_at() function and triggers

```sql
-- Shared trigger function (reused across all tables with updated_at)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Create triggers with existence checks (safe to re-run)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_underwriting_cases_updated_at') THEN
    CREATE TRIGGER set_underwriting_cases_updated_at
      BEFORE UPDATE ON underwriting_cases
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_underwriting_decisions_updated_at') THEN
    CREATE TRIGGER set_underwriting_decisions_updated_at
      BEFORE UPDATE ON underwriting_decisions
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_conditions_updated_at') THEN
    CREATE TRIGGER set_conditions_updated_at
      BEFORE UPDATE ON conditions
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_risk_flags_updated_at') THEN
    CREATE TRIGGER set_risk_flags_updated_at
      BEFORE UPDATE ON risk_flags
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;
```

### RLS for underwriting tables

```sql
ALTER TABLE underwriting_cases     ENABLE ROW LEVEL SECURITY;
ALTER TABLE underwriting_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE conditions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_flags             ENABLE ROW LEVEL SECURITY;

-- Helper: check if caller has an internal role
CREATE OR REPLACE FUNCTION is_internal_user()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'manager', 'underwriter', 'servicing')
  );
$$;

-- underwriting_cases: internal users read; admin/manager insert; admin/manager/underwriter update
CREATE POLICY "internal_read_cases" ON underwriting_cases
  FOR SELECT TO authenticated USING (is_internal_user());

CREATE POLICY "admin_insert_cases" ON underwriting_cases
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'manager'))
  );

CREATE POLICY "admin_update_cases" ON underwriting_cases
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'manager', 'underwriter'))
  );

-- underwriting_decisions: internal read; underwriter/admin insert
CREATE POLICY "internal_read_decisions" ON underwriting_decisions
  FOR SELECT TO authenticated USING (is_internal_user());

CREATE POLICY "underwriter_insert_decisions" ON underwriting_decisions
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'manager', 'underwriter'))
  );

-- conditions: internal read; underwriter/admin insert/update
CREATE POLICY "internal_read_conditions" ON conditions
  FOR SELECT TO authenticated USING (is_internal_user());

CREATE POLICY "underwriter_insert_conditions" ON conditions
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'manager', 'underwriter'))
  );

CREATE POLICY "underwriter_update_conditions" ON conditions
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'manager', 'underwriter'))
  );

-- risk_flags: internal read; underwriter/admin insert; admin update
CREATE POLICY "internal_read_risk_flags" ON risk_flags
  FOR SELECT TO authenticated USING (is_internal_user());

CREATE POLICY "underwriter_insert_risk_flags" ON risk_flags
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'manager', 'underwriter'))
  );

CREATE POLICY "admin_update_risk_flags" ON risk_flags
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'manager'))
  );
```

### Verification — Step 3

```sql
-- Verify tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('underwriting_cases', 'underwriting_decisions', 'conditions', 'risk_flags')
ORDER BY table_name;
```

```sql
-- Verify indexes
SELECT indexname, tablename
FROM pg_indexes
WHERE tablename IN ('underwriting_cases', 'underwriting_decisions', 'conditions', 'risk_flags')
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
```

```sql
-- Verify triggers
SELECT tgname, tgrelid::regclass AS table_name
FROM pg_trigger
WHERE tgname IN (
  'set_underwriting_cases_updated_at',
  'set_underwriting_decisions_updated_at',
  'set_conditions_updated_at',
  'set_risk_flags_updated_at'
);
```

```sql
-- Verify is_internal_user() function exists
SELECT proname, prosecdef
FROM pg_proc
WHERE proname = 'is_internal_user';
```

```sql
-- Check RLS policies on underwriting tables
SELECT policyname, tablename, cmd
FROM pg_policies
WHERE tablename IN ('underwriting_cases', 'underwriting_decisions', 'conditions', 'risk_flags')
ORDER BY tablename, cmd;
```

### Audit: underwriting case status summary

```sql
SELECT
  uw.case_status,
  COUNT(*) AS case_count,
  COUNT(uw.assigned_to) AS assigned_count
FROM underwriting_cases uw
GROUP BY uw.case_status
ORDER BY uw.case_status;
```

### Audit: open cases with application details

```sql
SELECT
  uw.id AS case_id,
  uw.case_status,
  uw.priority,
  uw.opened_at,
  a.application_number,
  a.application_status,
  a.requested_amount,
  p.full_name AS borrower_name,
  p.email AS borrower_email
FROM underwriting_cases uw
JOIN applications a ON a.id = uw.application_id
JOIN borrowers b ON b.id = a.borrower_id
JOIN profiles p ON p.id = b.profile_id
WHERE uw.case_status NOT IN ('closed')
ORDER BY uw.opened_at DESC;
```

### Audit: decisions recorded

```sql
SELECT
  ud.decision_type,
  COUNT(*) AS count,
  AVG(ud.approved_amount) AS avg_approved_amount,
  AVG(ud.approved_rate * 100) AS avg_rate_pct
FROM underwriting_decisions ud
GROUP BY ud.decision_type
ORDER BY count DESC;
```

### Audit: open conditions by type

```sql
SELECT
  condition_type,
  COUNT(*) AS open_count
FROM conditions
WHERE status = 'open'
GROUP BY condition_type
ORDER BY open_count DESC;
```

---

## Step 4 — Loan Lifecycle

> **Related docs:** `docs/06_Loan_State_Machine.md`, `docs/10_Servicing_Ledger_Model.md`
> Migration: `0012_loans`

### Create loans

```sql
CREATE TABLE IF NOT EXISTS loans (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id      UUID NOT NULL REFERENCES applications(id) ON DELETE RESTRICT,
  loan_number         TEXT NOT NULL UNIQUE,
  loan_status         TEXT NOT NULL DEFAULT 'pending_funding'
                        CHECK (loan_status IN (
                          'pending_funding', 'active', 'matured', 'delinquent',
                          'defaulted', 'paid_off', 'charged_off', 'closed'
                        )),
  principal_amount    NUMERIC(15, 2) NOT NULL,
  interest_rate       NUMERIC(8, 6) NOT NULL,  -- e.g. 0.120000 = 12%
  origination_fee     NUMERIC(15, 2) NOT NULL DEFAULT 0,
  term_months         INTEGER NOT NULL,
  payment_type        TEXT NOT NULL CHECK (payment_type IN ('interest_only', 'amortizing', 'balloon')),
  funding_date        DATE,
  maturity_date       DATE,
  payoff_date         DATE,
  outstanding_balance NUMERIC(15, 2) NOT NULL,
  accrued_interest    NUMERIC(15, 2) NOT NULL DEFAULT 0,
  total_paid          NUMERIC(15, 2) NOT NULL DEFAULT 0,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
```

### Auto-generate loan_number (LN-YYYYMMDD-XXXX)

```sql
CREATE SEQUENCE IF NOT EXISTS loan_number_seq START 1000;

CREATE OR REPLACE FUNCTION generate_loan_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.loan_number := 'LN-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(nextval('loan_number_seq')::text, 4, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_loan_number
  BEFORE INSERT ON loans
  FOR EACH ROW
  WHEN (NEW.loan_number IS NULL OR NEW.loan_number = '')
  EXECUTE FUNCTION generate_loan_number();
```

### Indexes for loans

```sql
CREATE INDEX idx_loans_application_id ON loans(application_id);
CREATE INDEX idx_loans_loan_status    ON loans(loan_status);
CREATE INDEX idx_loans_funding_date   ON loans(funding_date);
```

### Create payment_schedule

```sql
CREATE TABLE IF NOT EXISTS payment_schedule (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id             UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  period_number       INTEGER NOT NULL,
  due_date            DATE NOT NULL,
  scheduled_principal NUMERIC(15, 2) NOT NULL DEFAULT 0,
  scheduled_interest  NUMERIC(15, 2) NOT NULL DEFAULT 0,
  scheduled_total     NUMERIC(15, 2) NOT NULL,
  schedule_status     TEXT NOT NULL DEFAULT 'scheduled'
                        CHECK (schedule_status IN ('scheduled', 'paid', 'partial', 'missed')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (loan_id, period_number)
);

CREATE INDEX idx_payment_schedule_loan_id  ON payment_schedule(loan_id);
CREATE INDEX idx_payment_schedule_due_date ON payment_schedule(due_date);
```

### Create payments

```sql
-- Append-only — payments are never deleted or updated in place.
-- Loan balance is updated on the loans table separately after each insert.
CREATE TABLE IF NOT EXISTS payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id             UUID NOT NULL REFERENCES loans(id) ON DELETE RESTRICT,
  payment_schedule_id UUID REFERENCES payment_schedule(id) ON DELETE SET NULL,
  payment_date        DATE NOT NULL,
  payment_amount      NUMERIC(15, 2) NOT NULL,
  principal_applied   NUMERIC(15, 2) NOT NULL DEFAULT 0,
  interest_applied    NUMERIC(15, 2) NOT NULL DEFAULT 0,
  fees_applied        NUMERIC(15, 2) NOT NULL DEFAULT 0,
  payment_method      TEXT CHECK (payment_method IN ('ach', 'wire', 'check', 'other')),
  external_reference  TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_payments_loan_id      ON payments(loan_id);
CREATE INDEX idx_payments_payment_date ON payments(payment_date);
```

### Create draws

```sql
CREATE TABLE IF NOT EXISTS draws (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id      UUID NOT NULL REFERENCES loans(id) ON DELETE RESTRICT,
  draw_amount  NUMERIC(15, 2) NOT NULL,
  draw_status  TEXT NOT NULL DEFAULT 'pending'
                 CHECK (draw_status IN ('pending', 'approved', 'funded', 'cancelled')),
  description  TEXT,
  approved_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at  TIMESTAMPTZ,
  funded_at    TIMESTAMPTZ,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_draws_loan_id     ON draws(loan_id);
CREATE INDEX idx_draws_draw_status ON draws(draw_status);
```

### updated_at triggers for loan tables

```sql
-- Uses set_updated_at() function created in Step 3 (0010_underwriting)
-- Existence checks make this safe to re-run
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_loans_updated_at') THEN
    CREATE TRIGGER set_loans_updated_at
      BEFORE UPDATE ON loans FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_payment_schedule_updated_at') THEN
    CREATE TRIGGER set_payment_schedule_updated_at
      BEFORE UPDATE ON payment_schedule FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_payments_updated_at') THEN
    CREATE TRIGGER set_payments_updated_at
      BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_draws_updated_at') THEN
    CREATE TRIGGER set_draws_updated_at
      BEFORE UPDATE ON draws FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;
```

### RLS for loan tables

```sql
ALTER TABLE loans            ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE draws            ENABLE ROW LEVEL SECURITY;

-- loans: borrowers see their own via application→borrower→profile chain; internal users see all
CREATE POLICY "borrower_read_own_loans" ON loans
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM applications a
      JOIN borrowers b ON b.id = a.borrower_id
      JOIN profiles p  ON p.id = b.profile_id
      WHERE a.id = loans.application_id
        AND p.id = auth.uid()
    )
    OR is_internal_user()
  );

CREATE POLICY "admin_insert_loans" ON loans
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'manager'))
  );

CREATE POLICY "admin_update_loans" ON loans
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'manager', 'servicing'))
  );

-- payment_schedule: borrowers via loan chain; internal all
CREATE POLICY "read_payment_schedule" ON payment_schedule
  FOR SELECT TO authenticated USING (
    is_internal_user()
    OR EXISTS (
      SELECT 1 FROM loans l
      JOIN applications a ON a.id = l.application_id
      JOIN borrowers b    ON b.id = a.borrower_id
      JOIN profiles p     ON p.id = b.profile_id
      WHERE l.id = payment_schedule.loan_id AND p.id = auth.uid()
    )
  );

CREATE POLICY "servicing_manage_schedule" ON payment_schedule
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'manager', 'servicing'))
  );

-- payments: same pattern
CREATE POLICY "read_payments" ON payments
  FOR SELECT TO authenticated USING (
    is_internal_user()
    OR EXISTS (
      SELECT 1 FROM loans l
      JOIN applications a ON a.id = l.application_id
      JOIN borrowers b    ON b.id = a.borrower_id
      JOIN profiles p     ON p.id = b.profile_id
      WHERE l.id = payments.loan_id AND p.id = auth.uid()
    )
  );

CREATE POLICY "servicing_insert_payments" ON payments
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'manager', 'servicing'))
  );

-- draws: borrowers read own; servicing/admin manage
CREATE POLICY "read_draws" ON draws
  FOR SELECT TO authenticated USING (
    is_internal_user()
    OR EXISTS (
      SELECT 1 FROM loans l
      JOIN applications a ON a.id = l.application_id
      JOIN borrowers b    ON b.id = a.borrower_id
      JOIN profiles p     ON p.id = b.profile_id
      WHERE l.id = draws.loan_id AND p.id = auth.uid()
    )
  );

CREATE POLICY "servicing_manage_draws" ON draws
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'manager', 'servicing'))
  );
```

### Verification — Step 4

```sql
-- Verify tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('loans', 'payment_schedule', 'payments', 'draws')
ORDER BY table_name;
```

```sql
-- Verify indexes
SELECT indexname, tablename
FROM pg_indexes
WHERE tablename IN ('loans', 'payment_schedule', 'payments', 'draws')
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
-- Expected: 9 indexes total
```

```sql
-- Verify triggers
SELECT tgname, tgrelid::regclass AS table_name
FROM pg_trigger
WHERE tgname IN (
  'set_loan_number',
  'set_loans_updated_at',
  'set_payment_schedule_updated_at',
  'set_payments_updated_at',
  'set_draws_updated_at'
);
-- Expected: 5 triggers
```

```sql
-- Verify loan_number sequence
SELECT sequence_name, last_value
FROM information_schema.sequences
WHERE sequence_name = 'loan_number_seq';
```

### Audit: loan portfolio summary

```sql
SELECT
  loan_status,
  COUNT(*) AS loan_count,
  SUM(principal_amount) AS total_principal,
  SUM(outstanding_balance) AS total_outstanding,
  SUM(total_paid) AS total_collected,
  AVG(interest_rate * 100) AS avg_rate_pct
FROM loans
GROUP BY loan_status
ORDER BY loan_status;
```

### Audit: active loans with borrower details

```sql
SELECT
  l.loan_number,
  l.loan_status,
  l.principal_amount,
  l.outstanding_balance,
  l.interest_rate * 100 AS rate_pct,
  l.maturity_date,
  a.application_number,
  p.full_name AS borrower_name,
  p.email AS borrower_email
FROM loans l
JOIN applications a ON a.id = l.application_id
JOIN borrowers b ON b.id = a.borrower_id
JOIN profiles p ON p.id = b.profile_id
WHERE l.loan_status = 'active'
ORDER BY l.maturity_date ASC;
```

### Audit: payment history for a specific loan

```sql
-- Replace 'LOAN-ID-HERE' with the actual loan UUID
SELECT
  py.payment_date,
  py.payment_amount,
  py.principal_applied,
  py.interest_applied,
  py.fees_applied,
  py.payment_method,
  py.external_reference,
  py.created_at
FROM payments py
WHERE py.loan_id = 'LOAN-ID-HERE'
ORDER BY py.payment_date DESC;
```

### Audit: payment schedule status

```sql
SELECT
  ps.schedule_status,
  COUNT(*) AS period_count,
  SUM(ps.scheduled_total) AS total_scheduled
FROM payment_schedule ps
GROUP BY ps.schedule_status
ORDER BY ps.schedule_status;
```

### Audit: overdue scheduled payments

```sql
SELECT
  l.loan_number,
  ps.period_number,
  ps.due_date,
  ps.scheduled_total,
  ps.schedule_status
FROM payment_schedule ps
JOIN loans l ON l.id = ps.loan_id
WHERE ps.due_date < CURRENT_DATE
  AND ps.schedule_status IN ('scheduled', 'partial')
ORDER BY ps.due_date ASC;
```

### Audit: pending draws

```sql
SELECT
  d.id AS draw_id,
  l.loan_number,
  d.draw_amount,
  d.draw_status,
  d.description,
  d.created_at
FROM draws d
JOIN loans l ON l.id = d.loan_id
WHERE d.draw_status = 'pending'
ORDER BY d.created_at ASC;
```

---

## Step 5 — Fund Operations

> **Related docs:** `docs/09_Fund_Accounting_NAV_Engine.md`
> Migration: `0013_fund_operations`

### Create funds

```sql
CREATE TABLE IF NOT EXISTS funds (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_name        TEXT NOT NULL DEFAULT 'NexusBridge Capital LP',
  fund_status      TEXT NOT NULL DEFAULT 'open'
                     CHECK (fund_status IN ('open', 'closed', 'fundraising')),
  target_size      NUMERIC(15, 2) NOT NULL DEFAULT 50000000,
  max_capacity     NUMERIC(15, 2) NOT NULL DEFAULT 50000000,
  inception_date   DATE,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Seed NexusBridge Capital LP (idempotent)
INSERT INTO funds (fund_name, fund_status, target_size, max_capacity, inception_date)
VALUES ('NexusBridge Capital LP', 'open', 50000000, 50000000, CURRENT_DATE)
ON CONFLICT DO NOTHING;

ALTER TABLE funds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "funds_select_admin" ON funds
  FOR SELECT TO authenticated USING (is_admin());

CREATE POLICY "funds_update_admin" ON funds
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'manager'))
  );

-- Investors need to read fund details for the subscription flow
CREATE POLICY "funds_select_investor" ON funds
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'investor')
  );
```

### Create fund_subscriptions

```sql
-- FCFS fields prevent oversubscription — all inserts go through reserve_fund_subscription() SECURITY DEFINER
CREATE TABLE IF NOT EXISTS fund_subscriptions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id                 UUID NOT NULL REFERENCES funds(id) ON DELETE RESTRICT,
  investor_id             UUID NOT NULL REFERENCES investors(id) ON DELETE RESTRICT,
  commitment_amount       NUMERIC(15, 2) NOT NULL,
  funded_amount           NUMERIC(15, 2) NOT NULL DEFAULT 0,
  subscription_status     TEXT NOT NULL DEFAULT 'pending'
                            CHECK (subscription_status IN (
                              'pending', 'approved', 'rejected', 'active', 'redeemed', 'closed'
                            )),
  reservation_status      TEXT NOT NULL DEFAULT 'pending'
                            CHECK (reservation_status IN (
                              'pending', 'reserved', 'confirmed', 'expired', 'cancelled'
                            )),
  reservation_expires_at  TIMESTAMPTZ,
  fcfs_position           INTEGER,
  reserved_at             TIMESTAMPTZ,
  confirmed_at            TIMESTAMPTZ,
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by              UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_fund_subscriptions_fund_id     ON fund_subscriptions(fund_id);
CREATE INDEX idx_fund_subscriptions_investor_id ON fund_subscriptions(investor_id);
CREATE INDEX idx_fund_subscriptions_status      ON fund_subscriptions(subscription_status);

ALTER TABLE fund_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fund_subscriptions_select_own" ON fund_subscriptions
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM investors i
      WHERE i.id = fund_subscriptions.investor_id AND i.profile_id = auth.uid()
    )
  );

CREATE POLICY "fund_subscriptions_select_admin" ON fund_subscriptions
  FOR SELECT TO authenticated USING (is_admin());

CREATE POLICY "fund_subscriptions_update_admin" ON fund_subscriptions
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'manager'))
  );
```

### FCFS reservation function

```sql
-- Uses SELECT FOR UPDATE to lock the fund row, serializing concurrent subscription attempts.
-- Called via supabase.rpc('reserve_fund_subscription', {...}) — never direct INSERT.
CREATE OR REPLACE FUNCTION reserve_fund_subscription(
  p_investor_id       UUID,
  p_fund_id           UUID,
  p_commitment_amount NUMERIC
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_fund              funds%ROWTYPE;
  v_total_committed   NUMERIC;
  v_fcfs_position     INTEGER;
  v_subscription_id   UUID;
  v_expires_at        TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_fund FROM funds WHERE id = p_fund_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Fund not found');
  END IF;

  IF v_fund.fund_status != 'open' THEN
    RETURN json_build_object('error', 'Fund is not accepting subscriptions');
  END IF;

  SELECT COALESCE(SUM(commitment_amount), 0) INTO v_total_committed
  FROM fund_subscriptions
  WHERE fund_id = p_fund_id
    AND subscription_status IN ('pending', 'approved', 'active')
    AND reservation_status IN ('reserved', 'confirmed');

  IF v_total_committed + p_commitment_amount > v_fund.max_capacity THEN
    RETURN json_build_object('error', 'Fund is at or near capacity');
  END IF;

  SELECT COALESCE(MAX(fcfs_position), 0) + 1 INTO v_fcfs_position
  FROM fund_subscriptions WHERE fund_id = p_fund_id;

  v_expires_at := NOW() + INTERVAL '30 minutes';

  INSERT INTO fund_subscriptions (
    fund_id, investor_id, commitment_amount,
    subscription_status, reservation_status,
    reservation_expires_at, fcfs_position, reserved_at, created_by
  ) VALUES (
    p_fund_id, p_investor_id, p_commitment_amount,
    'pending', 'reserved', v_expires_at, v_fcfs_position, NOW(), p_investor_id
  )
  RETURNING id INTO v_subscription_id;

  RETURN json_build_object(
    'subscription_id',        v_subscription_id,
    'fcfs_position',          v_fcfs_position,
    'reservation_expires_at', v_expires_at
  );
END;
$$;
```

### Create fund_allocations

```sql
CREATE TABLE IF NOT EXISTS fund_allocations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id    UUID NOT NULL REFERENCES fund_subscriptions(id) ON DELETE RESTRICT,
  loan_id            UUID NOT NULL REFERENCES loans(id) ON DELETE RESTRICT,
  allocation_amount  NUMERIC(15, 2) NOT NULL,
  allocation_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  allocation_status  TEXT NOT NULL DEFAULT 'active'
                       CHECK (allocation_status IN ('active', 'exited', 'reduced')),
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_fund_allocations_subscription_id ON fund_allocations(subscription_id);
CREATE INDEX idx_fund_allocations_loan_id         ON fund_allocations(loan_id);
CREATE INDEX idx_fund_allocations_status          ON fund_allocations(allocation_status);

ALTER TABLE fund_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fund_allocations_select_own" ON fund_allocations
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM fund_subscriptions fs
      JOIN investors i ON i.id = fs.investor_id
      WHERE fs.id = fund_allocations.subscription_id AND i.profile_id = auth.uid()
    )
  );

CREATE POLICY "fund_allocations_select_admin" ON fund_allocations
  FOR SELECT TO authenticated USING (is_admin());

CREATE POLICY "fund_allocations_insert_admin" ON fund_allocations
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'manager'))
  );

CREATE POLICY "fund_allocations_update_admin" ON fund_allocations
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'manager'))
  );
```

### Create nav_snapshots

```sql
CREATE TABLE IF NOT EXISTS nav_snapshots (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id            UUID NOT NULL REFERENCES funds(id) ON DELETE RESTRICT,
  snapshot_date      DATE NOT NULL,
  total_nav          NUMERIC(15, 2) NOT NULL,
  total_committed    NUMERIC(15, 2) NOT NULL DEFAULT 0,
  total_deployed     NUMERIC(15, 2) NOT NULL DEFAULT 0,
  total_distributed  NUMERIC(15, 2) NOT NULL DEFAULT 0,
  nav_per_unit       NUMERIC(15, 6) NOT NULL DEFAULT 1.000000,
  loan_count         INTEGER NOT NULL DEFAULT 0,
  investor_count     INTEGER NOT NULL DEFAULT 0,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (fund_id, snapshot_date)
);

CREATE INDEX idx_nav_snapshots_fund_id       ON nav_snapshots(fund_id);
CREATE INDEX idx_nav_snapshots_snapshot_date ON nav_snapshots(snapshot_date DESC);

ALTER TABLE nav_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nav_snapshots_select_admin" ON nav_snapshots
  FOR SELECT TO authenticated USING (is_admin());

-- Investors can read NAV (needed for portfolio view)
CREATE POLICY "nav_snapshots_select_investor" ON nav_snapshots
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('investor', 'admin', 'manager'))
  );

CREATE POLICY "nav_snapshots_insert_admin" ON nav_snapshots
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'manager'))
  );
```

### updated_at triggers for fund tables

```sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_funds_updated_at') THEN
    CREATE TRIGGER set_funds_updated_at
      BEFORE UPDATE ON funds FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_fund_subscriptions_updated_at') THEN
    CREATE TRIGGER set_fund_subscriptions_updated_at
      BEFORE UPDATE ON fund_subscriptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_fund_allocations_updated_at') THEN
    CREATE TRIGGER set_fund_allocations_updated_at
      BEFORE UPDATE ON fund_allocations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_nav_snapshots_updated_at') THEN
    CREATE TRIGGER set_nav_snapshots_updated_at
      BEFORE UPDATE ON nav_snapshots FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;
```

### Verification — Step 5

```sql
-- Verify tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('funds', 'fund_subscriptions', 'fund_allocations', 'nav_snapshots')
ORDER BY table_name;
```

```sql
-- Verify fund seed row
SELECT id, fund_name, fund_status, max_capacity FROM funds;
```

```sql
-- Verify reserve_fund_subscription() function exists
SELECT proname, prosecdef FROM pg_proc WHERE proname = 'reserve_fund_subscription';
```

```sql
-- Verify indexes
SELECT indexname, tablename
FROM pg_indexes
WHERE tablename IN ('fund_subscriptions', 'fund_allocations', 'nav_snapshots')
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
```

```sql
-- Verify triggers
SELECT tgname, tgrelid::regclass AS table_name
FROM pg_trigger
WHERE tgname IN (
  'set_funds_updated_at',
  'set_fund_subscriptions_updated_at',
  'set_fund_allocations_updated_at',
  'set_nav_snapshots_updated_at'
);
```

```sql
-- Check RLS on fund tables
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename IN ('funds', 'fund_subscriptions', 'fund_allocations', 'nav_snapshots')
  AND schemaname = 'public';
-- rowsecurity should be true for all
```

### Audit: fund subscription summary

```sql
SELECT
  subscription_status,
  reservation_status,
  COUNT(*) AS count,
  SUM(commitment_amount) AS total_committed,
  SUM(funded_amount) AS total_funded
FROM fund_subscriptions
GROUP BY subscription_status, reservation_status
ORDER BY subscription_status, reservation_status;
```

### Audit: FCFS queue

```sql
SELECT
  fs.fcfs_position,
  fs.subscription_status,
  fs.reservation_status,
  fs.commitment_amount,
  fs.reservation_expires_at,
  p.full_name AS investor_name,
  p.email
FROM fund_subscriptions fs
JOIN investors i ON i.id = fs.investor_id
JOIN profiles p ON p.id = i.profile_id
WHERE fs.subscription_status IN ('pending', 'approved', 'active')
ORDER BY fs.fcfs_position ASC;
```

### Audit: allocation breakdown by loan

```sql
SELECT
  l.loan_number,
  l.loan_status,
  l.principal_amount,
  SUM(fa.allocation_amount) AS total_allocated,
  COUNT(fa.id) AS investor_count,
  ROUND(SUM(fa.allocation_amount) / l.principal_amount * 100, 1) AS pct_covered
FROM fund_allocations fa
JOIN loans l ON l.id = fa.loan_id
WHERE fa.allocation_status = 'active'
GROUP BY l.loan_number, l.loan_status, l.principal_amount
ORDER BY l.loan_number;
```

### Audit: latest NAV snapshot

```sql
SELECT
  snapshot_date, total_nav, nav_per_unit,
  total_committed, total_deployed, total_distributed,
  loan_count, investor_count
FROM nav_snapshots
ORDER BY snapshot_date DESC
LIMIT 1;
```

---

## Cross-Phase Verification Queries

### Full table inventory

```sql
SELECT table_name, pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) AS size
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

### All RLS-enabled tables

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
-- rowsecurity should be true for all tables
```

### All triggers across Phase 3 tables

```sql
SELECT tgname AS trigger_name, tgrelid::regclass AS table_name
FROM pg_trigger
WHERE tgrelid::regclass::text IN (
  'underwriting_cases', 'underwriting_decisions', 'conditions', 'risk_flags',
  'loans', 'payment_schedule', 'payments', 'draws'
)
ORDER BY table_name, trigger_name;
```

### All indexes across Phase 3 tables

```sql
SELECT indexname, tablename
FROM pg_indexes
WHERE tablename IN (
  'underwriting_cases', 'underwriting_decisions', 'conditions', 'risk_flags',
  'loans', 'payment_schedule', 'payments', 'draws'
)
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
```

### Loan pipeline: application → underwriting → loan

```sql
SELECT
  a.application_number,
  a.application_status,
  a.requested_amount,
  uw.case_status AS underwriting_status,
  uw.priority,
  l.loan_number,
  l.loan_status,
  l.outstanding_balance,
  p.full_name AS borrower_name
FROM applications a
JOIN borrowers b ON b.id = a.borrower_id
JOIN profiles p ON p.id = b.profile_id
LEFT JOIN underwriting_cases uw ON uw.application_id = a.id
LEFT JOIN loans l ON l.application_id = a.id
ORDER BY a.created_at DESC;
```

### Audit events — recent sensitive actions

```sql
SELECT
  event_type,
  entity_type,
  entity_id,
  actor_profile_id,
  created_at,
  event_payload
FROM audit_events
ORDER BY created_at DESC
LIMIT 50;
```
