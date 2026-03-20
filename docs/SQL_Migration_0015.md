# SQL Migration 0015 — Workflow Automation

Run each block separately in the Supabase SQL Editor. Wait for "Success" before running the next.

---

## Block 1 — Create workflow_triggers table

```sql
CREATE TABLE IF NOT EXISTS workflow_triggers (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  description text,
  event_type  text        NOT NULL,
  conditions  jsonb       NOT NULL DEFAULT '{}',
  actions     jsonb       NOT NULL DEFAULT '[]',
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid        REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_workflow_triggers_event  ON workflow_triggers (event_type);
CREATE INDEX IF NOT EXISTS idx_workflow_triggers_active ON workflow_triggers (is_active);
```

---

## Block 2 — updated_at trigger

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

---

## Block 3 — RLS for workflow_triggers

```sql
ALTER TABLE workflow_triggers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workflow_triggers_select" ON workflow_triggers
  FOR SELECT USING (is_admin());

CREATE POLICY "workflow_triggers_insert" ON workflow_triggers
  FOR INSERT WITH CHECK (is_admin());

CREATE POLICY "workflow_triggers_update" ON workflow_triggers
  FOR UPDATE USING (is_admin());

CREATE POLICY "workflow_triggers_delete" ON workflow_triggers
  FOR DELETE USING (is_admin());
```

---

## Block 4 — Create workflow_executions table

```sql
CREATE TABLE IF NOT EXISTS workflow_executions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id       uuid        NOT NULL REFERENCES workflow_triggers(id) ON DELETE CASCADE,
  event_payload    jsonb       NOT NULL DEFAULT '{}',
  execution_status text        NOT NULL DEFAULT 'success',
  actions_executed jsonb       NOT NULL DEFAULT '[]',
  duration_ms      integer,
  executed_at      timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_executions_trigger  ON workflow_executions (trigger_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_status   ON workflow_executions (execution_status);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_executed ON workflow_executions (executed_at DESC);
```

---

## Block 5 — RLS for workflow_executions

```sql
ALTER TABLE workflow_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workflow_executions_select" ON workflow_executions
  FOR SELECT USING (is_admin());
```

---

## Block 6 — Seed the 5 triggers

```sql
INSERT INTO workflow_triggers (name, description, event_type, conditions, actions, is_active) VALUES
  (
    'Auto-assign underwriting on review',
    'When an application moves to under_review, creates an underwriting task.',
    'application_status_changed',
    '{"new_status": "under_review"}',
    '[{"type":"create_task","title":"Begin underwriting review","task_owner_type_from":"entity_type","task_owner_id_from":"entity_id","priority":"high","due_days":3,"description":"Application moved to under review. Begin underwriting assessment."}]',
    false
  ),
  (
    'Notify team on document upload',
    'When a borrower uploads a document, creates a review task.',
    'document_uploaded',
    '{}',
    '[{"type":"create_task","title":"Review uploaded document","task_owner_type":"application","task_owner_id_from":"entity_id","priority":"medium","due_days":2,"description":"A new document was uploaded and requires review."}]',
    false
  ),
  (
    'Alert on condition satisfaction',
    'When a condition is satisfied, creates a follow-up task for the underwriter.',
    'condition_updated',
    '{"new_status": "satisfied"}',
    '[{"type":"create_task","title":"Verify satisfied condition","task_owner_type":"underwriting_case","task_owner_id_from":"entity_id","priority":"medium","due_days":1,"description":"A condition was marked satisfied. Verify and update case status."}]',
    false
  ),
  (
    'Payment received alert',
    'When a loan payment is recorded, creates a servicing confirmation task.',
    'payment_received',
    '{}',
    '[{"type":"create_task","title":"Confirm payment applied","task_owner_type":"loan","task_owner_id_from":"entity_id","priority":"low","due_days":1,"description":"A payment was recorded. Confirm it has been applied to the schedule."}]',
    false
  ),
  (
    'Delinquency detection alert',
    'When a loan transitions to delinquent status, creates an urgent servicing task.',
    'loan_status_changed',
    '{"new_status": "delinquent"}',
    '[{"type":"create_task","title":"Delinquency: borrower outreach required","task_owner_type":"loan","task_owner_id_from":"entity_id","priority":"urgent","due_days":1,"description":"Loan has been marked delinquent. Contact borrower immediately."}]',
    false
  );
```
