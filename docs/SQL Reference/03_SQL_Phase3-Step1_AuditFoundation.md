# NexusBridge CreditOS — SQL Reference: Phase 3

**Phase:** 3, Step 1 — Foundation
**Related docs:** `docs/15_Data_Security_Audit_Framework.md`
**Migrations:** `0009_extensions`, `0014_audit_operations`

SQL migration DDL and verification/audit queries for Phase 3 Step 1.
Run each statement individually in the Supabase SQL Editor.

> For Phase 1 & 2 schemas and RLS policies, see `01_SQL_Phase1-2_CoreSchema.md`.
> Full migration files are in `apps/portal/src/db/migrations/`.

---

## 1. Step 1 — Foundation

> Migrations: `0009_extensions`, `0014_audit_operations`

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
