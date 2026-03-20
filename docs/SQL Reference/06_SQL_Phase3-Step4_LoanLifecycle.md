# NexusBridge CreditOS — SQL Reference: Phase 3 Step 4 — Loan Lifecycle

**Phase:** 3, Step 4 — Loan Lifecycle
**Related docs:** `docs/06_Loan_State_Machine.md`, `docs/10_Servicing_Ledger_Model.md`
**Migration:** `0012_loans`

SQL migration DDL and verification/audit queries for Phase 3 Step 4.
Run each statement individually in the Supabase SQL Editor.

> For prior steps, see `04_SQL_Phase3-Step3_Underwriting.md`.
> Full migration files are in `apps/portal/src/db/migrations/`.

---

## 4. Step 4 — Loan Lifecycle

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
