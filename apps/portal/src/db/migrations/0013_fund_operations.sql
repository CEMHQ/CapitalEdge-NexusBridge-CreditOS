-- ─── Fund Operations ──────────────────────────────────────────────────────────
-- Migration 0013: funds, fund_subscriptions, fund_allocations, nav_snapshots
-- Implements FCFS locking via SELECT FOR UPDATE in reserve_fund_subscription().
--
-- Run each statement separately in the Supabase SQL Editor.

-- ── funds ──────────────────────────────────────────────────────────────────────
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

-- Seed NexusBridge Capital LP (idempotent — skip if already exists)
INSERT INTO funds (fund_name, fund_status, target_size, max_capacity, inception_date)
VALUES ('NexusBridge Capital LP', 'open', 50000000, 50000000, CURRENT_DATE)
ON CONFLICT DO NOTHING;

ALTER TABLE funds ENABLE ROW LEVEL SECURITY;

-- Admin/manager can read and update fund details
CREATE POLICY "funds_select_admin" ON funds
  FOR SELECT TO authenticated USING (is_admin());

CREATE POLICY "funds_update_admin" ON funds
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'manager'))
  );

-- Investors can read fund details (for subscription flow)
CREATE POLICY "funds_select_investor" ON funds
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'investor')
  );

-- ── fund_subscriptions ────────────────────────────────────────────────────────
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
  -- FCFS reservation fields — prevents fund oversubscription via SELECT FOR UPDATE
  reservation_status      TEXT NOT NULL DEFAULT 'pending'
                            CHECK (reservation_status IN (
                              'pending', 'reserved', 'confirmed', 'expired', 'cancelled'
                            )),
  reservation_expires_at  TIMESTAMPTZ,         -- slot hold window (30 min)
  fcfs_position           INTEGER,             -- queue position at time of reservation
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

-- Investors can read their own subscriptions
CREATE POLICY "fund_subscriptions_select_own" ON fund_subscriptions
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM investors i
      WHERE i.id = fund_subscriptions.investor_id
        AND i.profile_id = auth.uid()
    )
  );

-- Admin/manager can read all subscriptions
CREATE POLICY "fund_subscriptions_select_admin" ON fund_subscriptions
  FOR SELECT TO authenticated USING (is_admin());

-- Admin/manager can update (approve/reject) subscriptions
CREATE POLICY "fund_subscriptions_update_admin" ON fund_subscriptions
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'manager'))
  );

-- No direct INSERT from clients — all inserts go through reserve_fund_subscription() (SECURITY DEFINER)

-- ── FCFS reservation function ─────────────────────────────────────────────────
-- Called via supabase.rpc('reserve_fund_subscription', {...}) from the API route.
-- Uses SELECT FOR UPDATE to lock the fund row, preventing concurrent oversubscription.
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
  -- Lock the fund row — serializes concurrent subscription attempts
  SELECT * INTO v_fund
  FROM funds
  WHERE id = p_fund_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Fund not found');
  END IF;

  IF v_fund.fund_status != 'open' THEN
    RETURN json_build_object('error', 'Fund is not accepting subscriptions');
  END IF;

  -- Sum all live commitments (reserved + confirmed + active)
  SELECT COALESCE(SUM(commitment_amount), 0) INTO v_total_committed
  FROM fund_subscriptions
  WHERE fund_id = p_fund_id
    AND subscription_status IN ('pending', 'approved', 'active')
    AND reservation_status IN ('reserved', 'confirmed');

  IF v_total_committed + p_commitment_amount > v_fund.max_capacity THEN
    RETURN json_build_object('error', 'Fund is at or near capacity');
  END IF;

  -- Assign next FCFS position
  SELECT COALESCE(MAX(fcfs_position), 0) + 1 INTO v_fcfs_position
  FROM fund_subscriptions
  WHERE fund_id = p_fund_id;

  v_expires_at := NOW() + INTERVAL '30 minutes';

  INSERT INTO fund_subscriptions (
    fund_id, investor_id, commitment_amount,
    subscription_status, reservation_status,
    reservation_expires_at, fcfs_position, reserved_at,
    created_by
  ) VALUES (
    p_fund_id, p_investor_id, p_commitment_amount,
    'pending', 'reserved',
    v_expires_at, v_fcfs_position, NOW(),
    p_investor_id
  )
  RETURNING id INTO v_subscription_id;

  RETURN json_build_object(
    'subscription_id',       v_subscription_id,
    'fcfs_position',         v_fcfs_position,
    'reservation_expires_at', v_expires_at
  );
END;
$$;

-- ── fund_allocations ──────────────────────────────────────────────────────────
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

-- Investors can see allocations tied to their subscriptions
CREATE POLICY "fund_allocations_select_own" ON fund_allocations
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM fund_subscriptions fs
      JOIN investors i ON i.id = fs.investor_id
      WHERE fs.id = fund_allocations.subscription_id
        AND i.profile_id = auth.uid()
    )
  );

-- Admin/manager can see all allocations
CREATE POLICY "fund_allocations_select_admin" ON fund_allocations
  FOR SELECT TO authenticated USING (is_admin());

-- Admin/manager can insert allocations
CREATE POLICY "fund_allocations_insert_admin" ON fund_allocations
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'manager'))
  );

-- Admin/manager can update allocation status
CREATE POLICY "fund_allocations_update_admin" ON fund_allocations
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'manager'))
  );

-- ── nav_snapshots ─────────────────────────────────────────────────────────────
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

CREATE INDEX idx_nav_snapshots_fund_id      ON nav_snapshots(fund_id);
CREATE INDEX idx_nav_snapshots_snapshot_date ON nav_snapshots(snapshot_date DESC);

ALTER TABLE nav_snapshots ENABLE ROW LEVEL SECURITY;

-- Admin/manager can read all NAV snapshots
CREATE POLICY "nav_snapshots_select_admin" ON nav_snapshots
  FOR SELECT TO authenticated USING (is_admin());

-- Investors can read NAV snapshots (needed for portfolio view)
CREATE POLICY "nav_snapshots_select_investor" ON nav_snapshots
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('investor', 'admin', 'manager'))
  );

-- Admin/manager can insert NAV snapshots
CREATE POLICY "nav_snapshots_insert_admin" ON nav_snapshots
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'manager'))
  );

-- ── updated_at triggers ───────────────────────────────────────────────────────
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
