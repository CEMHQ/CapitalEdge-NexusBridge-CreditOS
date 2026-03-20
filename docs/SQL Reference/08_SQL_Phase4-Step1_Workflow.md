# NexusBridge CreditOS — SQL Reference: Phase 4 Step 1 — Workflow Automation

**Phase:** 4, Step 1 — Workflow Automation
**Related docs:** `docs/11_Event_Driven_Workflow_Engine.md`
**Migration:** `0015_workflow_automation`

SQL migration DDL, seed data, and verification/audit queries for Phase 4 Step 1.
Run each statement individually in the Supabase SQL Editor.

> For Phase 1-3 schemas, see files `01_SQL_Phase1-2_CoreSchema.md` through `06_SQL_Phase3-Step5_FundOperations.md`.
> Full migration files are in `apps/portal/src/db/migrations/`.

> Note: `SQL_Migration_0015.md` has been absorbed into this file. The standalone migration file is no longer needed.

---

## 1. Step 1 — Workflow Automation

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
