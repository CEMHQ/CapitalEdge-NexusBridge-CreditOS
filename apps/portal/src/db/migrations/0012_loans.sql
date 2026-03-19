-- ─── Loan Lifecycle ───────────────────────────────────────────────────────────
-- Migration 0012: loans, payment_schedule, payments, draws

-- ── loans ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loans (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id    UUID NOT NULL REFERENCES applications(id) ON DELETE RESTRICT,
  loan_number       TEXT NOT NULL UNIQUE,
  loan_status       TEXT NOT NULL DEFAULT 'pending_funding'
                      CHECK (loan_status IN (
                        'pending_funding', 'active', 'matured', 'delinquent',
                        'defaulted', 'paid_off', 'charged_off', 'closed'
                      )),
  principal_amount  NUMERIC(15, 2) NOT NULL,
  interest_rate     NUMERIC(8, 6) NOT NULL,  -- e.g. 0.120000 = 12%
  origination_fee   NUMERIC(15, 2) NOT NULL DEFAULT 0,
  term_months       INTEGER NOT NULL,
  payment_type      TEXT NOT NULL CHECK (payment_type IN ('interest_only', 'amortizing', 'balloon')),
  funding_date      DATE,
  maturity_date     DATE,
  payoff_date       DATE,
  outstanding_balance NUMERIC(15, 2) NOT NULL,
  accrued_interest  NUMERIC(15, 2) NOT NULL DEFAULT 0,
  total_paid        NUMERIC(15, 2) NOT NULL DEFAULT 0,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Auto-generate loan_number: LN-YYYYMMDD-XXXX
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

CREATE INDEX idx_loans_application_id ON loans(application_id);
CREATE INDEX idx_loans_loan_status    ON loans(loan_status);
CREATE INDEX idx_loans_funding_date   ON loans(funding_date);

-- ── payment_schedule ──────────────────────────────────────────────────────────
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

-- ── payments ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id               UUID NOT NULL REFERENCES loans(id) ON DELETE RESTRICT,
  payment_schedule_id   UUID REFERENCES payment_schedule(id) ON DELETE SET NULL,
  payment_date          DATE NOT NULL,
  payment_amount        NUMERIC(15, 2) NOT NULL,
  principal_applied     NUMERIC(15, 2) NOT NULL DEFAULT 0,
  interest_applied      NUMERIC(15, 2) NOT NULL DEFAULT 0,
  fees_applied          NUMERIC(15, 2) NOT NULL DEFAULT 0,
  payment_method        TEXT CHECK (payment_method IN ('ach', 'wire', 'check', 'other')),
  external_reference    TEXT,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_payments_loan_id      ON payments(loan_id);
CREATE INDEX idx_payments_payment_date ON payments(payment_date);

-- ── draws ─────────────────────────────────────────────────────────────────────
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

-- ── updated_at triggers ────────────────────────────────────────────────────────
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

-- ── RLS ────────────────────────────────────────────────────────────────────────
ALTER TABLE loans            ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE draws            ENABLE ROW LEVEL SECURITY;

-- loans: borrowers see their own; internal users see all
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

-- payment_schedule: borrowers via loan; internal all
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
