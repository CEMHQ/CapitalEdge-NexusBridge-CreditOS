# NexusBridge CreditOS — SQL Reference: Phase 3 Step 3 — Underwriting

**Phase:** 3, Step 3 — Underwriting Engine
**Related docs:** `docs/08_Underwriting_Rules_Engine.md`
**Migration:** `0010_underwriting`

SQL migration DDL and verification/audit queries for Phase 3 Step 3.
Run each statement individually in the Supabase SQL Editor.

> For prior steps, see `03_SQL_Phase3-Step2_Documents.md`.
> Full migration files are in `apps/portal/src/db/migrations/`.

---

## 3. Step 3 — Underwriting Engine

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
