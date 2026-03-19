-- Migration: 0014_audit_operations
-- Creates audit_events, activity_logs, notifications, and tasks tables.
-- audit_events and activity_logs are partitioned by created_at via pg_partman.
-- These tables underpin SOC2 compliance, audit trails, and internal workflows.
--
-- Run each statement separately in the Supabase SQL Editor.

-- ─── 1. audit_events (partitioned by month) ───────────────────────────────────
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

-- ─── 2. Seed first partition for audit_events ─────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_events_default
  PARTITION OF audit_events DEFAULT;

-- ─── 3. Register audit_events with pg_partman ────────────────────────────────
SELECT partman.create_parent(
  p_parent_table   => 'public.audit_events',
  p_control        => 'created_at',
  p_type           => 'range',
  p_interval       => 'monthly',
  p_premake        => 3
);

-- ─── 4. Indexes for audit_events ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_audit_events_actor     ON audit_events (actor_profile_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_entity    ON audit_events (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_type      ON audit_events (event_type);
CREATE INDEX IF NOT EXISTS idx_audit_events_created   ON audit_events (created_at DESC);

-- ─── 5. RLS for audit_events ─────────────────────────────────────────────────
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

-- Only admin/manager can read audit events
CREATE POLICY "audit_events_select_admin" ON audit_events
  FOR SELECT USING (is_admin());

-- No client INSERT — all writes go through the service role via emitAuditEvent()

-- ─── 6. activity_logs (partitioned by week) ───────────────────────────────────
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

-- ─── 7. Seed first partition for activity_logs ────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_logs_default
  PARTITION OF activity_logs DEFAULT;

-- ─── 8. Register activity_logs with pg_partman ───────────────────────────────
SELECT partman.create_parent(
  p_parent_table   => 'public.activity_logs',
  p_control        => 'created_at',
  p_type           => 'range',
  p_interval       => 'weekly',
  p_premake        => 4
);

-- ─── 9. Indexes for activity_logs ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_activity_logs_actor   ON activity_logs (actor_profile_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity  ON activity_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs (created_at DESC);

-- ─── 10. RLS for activity_logs ───────────────────────────────────────────────
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_logs_select_admin" ON activity_logs
  FOR SELECT USING (is_admin());

-- ─── 11. notifications ────────────────────────────────────────────────────────
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

-- ─── 12. Indexes for notifications ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications (recipient_profile_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status    ON notifications (delivery_status);

-- ─── 13. RLS for notifications ───────────────────────────────────────────────
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

-- ─── 14. tasks ────────────────────────────────────────────────────────────────
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

-- ─── 15. Indexes for tasks ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tasks_owner    ON tasks (task_owner_type, task_owner_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks (assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_status   ON tasks (task_status);

-- ─── 16. RLS for tasks ───────────────────────────────────────────────────────
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
