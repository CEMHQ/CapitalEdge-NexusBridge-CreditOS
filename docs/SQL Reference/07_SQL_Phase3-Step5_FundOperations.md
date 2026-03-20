# NexusBridge CreditOS — SQL Reference: Phase 3 Step 5 — Fund Operations

**Phase:** 3, Step 5 — Fund Operations
**Related docs:** `docs/09_Fund_Accounting_NAV_Engine.md`
**Migration:** `0013_fund_operations`

SQL migration DDL and verification/audit queries for Phase 3 Step 5.
Run each statement individually in the Supabase SQL Editor.

> For prior steps, see `05_SQL_Phase3-Step4_LoanLifecycle.md`.
> Full migration files are in `apps/portal/src/db/migrations/`.

---

## 5. Step 5 — Fund Operations

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

## 6. Cross-Phase Verification Queries

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
  actor_role,
  created_at,
  payload
FROM audit_events
ORDER BY created_at DESC
LIMIT 50;
```
