-- Migration: 0015_workflow_automation
-- Creates workflow_triggers and workflow_executions tables for Phase 4 Step 1.
-- Workflow triggers define event-driven automation rules.
-- Workflow executions provide an immutable audit trail of every automation run.

-- ─── 1. workflow_triggers ─────────────────────────────────────────────────────
-- Stores trigger definitions: event type, conditions, and actions to execute.
-- Admin-managed. Managers can view but cannot create or modify.

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

-- ─── 2. Indexes for workflow_triggers ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_workflow_triggers_event  ON workflow_triggers (event_type);
CREATE INDEX IF NOT EXISTS idx_workflow_triggers_active ON workflow_triggers (is_active);

-- ─── 3. updated_at trigger for workflow_triggers ──────────────────────────────
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

-- ─── 4. RLS for workflow_triggers ────────────────────────────────────────────
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

-- ─── 5. workflow_executions ───────────────────────────────────────────────────
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

-- ─── 6. Indexes for workflow_executions ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_workflow_executions_trigger  ON workflow_executions (trigger_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_status   ON workflow_executions (execution_status);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_executed ON workflow_executions (executed_at DESC);

-- ─── 7. RLS for workflow_executions ──────────────────────────────────────────
ALTER TABLE workflow_executions ENABLE ROW LEVEL SECURITY;

-- Admin and manager can read execution history
CREATE POLICY "workflow_executions_select" ON workflow_executions
  FOR SELECT USING (is_admin());

-- No client INSERT — all writes go through the service role via fireWorkflowTrigger()

-- ─── 8. Seed: five priority workflow triggers ─────────────────────────────────
-- These are inserted as inactive so the admin can review and enable them.

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
        "description": "Application moved to under review — begin underwriting assessment."
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
        "description": "A condition was marked satisfied — verify and update case status."
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
        "description": "A payment was recorded — confirm it has been applied to the schedule."
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
