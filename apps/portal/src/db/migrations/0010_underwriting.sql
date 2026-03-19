-- ─── Underwriting Engine ──────────────────────────────────────────────────────
-- Migration 0010: underwriting_cases, underwriting_decisions, conditions, risk_flags

-- ── underwriting_cases ────────────────────────────────────────────────────────
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
CREATE INDEX idx_underwriting_cases_assigned_to ON underwriting_cases(assigned_to);
CREATE INDEX idx_underwriting_cases_case_status ON underwriting_cases(case_status);

-- ── underwriting_decisions ─────────────────────────────────────────────────────
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

-- ── conditions ─────────────────────────────────────────────────────────────────
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
CREATE INDEX idx_conditions_status ON conditions(status);

-- ── risk_flags ─────────────────────────────────────────────────────────────────
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

CREATE INDEX idx_risk_flags_case_id ON risk_flags(case_id);
CREATE INDEX idx_risk_flags_severity ON risk_flags(severity);

-- ── updated_at triggers ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

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

-- ── RLS ────────────────────────────────────────────────────────────────────────
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

-- underwriting_cases: internal users read; admin/manager insert; assigned underwriter or admin can update
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

-- risk_flags: internal read; system (service role) or admin insert; admin update
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
