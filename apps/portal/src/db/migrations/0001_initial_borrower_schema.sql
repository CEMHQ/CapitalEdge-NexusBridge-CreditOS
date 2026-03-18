-- Migration: 0001_initial_borrower_schema
-- Run this in Supabase SQL Editor

-- ─── profiles ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id          uuid        PRIMARY KEY, -- matches auth.users.id
  email       text        NOT NULL UNIQUE,
  full_name   text,
  phone       text,
  status      text        NOT NULL DEFAULT 'pending',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, status)
  VALUES (NEW.id, NEW.email, 'pending')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── borrowers ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS borrowers (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id         uuid        NOT NULL REFERENCES profiles(id),
  borrower_type      text        NOT NULL DEFAULT 'individual',
  onboarding_status  text        NOT NULL DEFAULT 'pending',
  kyc_status         text        NOT NULL DEFAULT 'not_started',
  aml_status         text        NOT NULL DEFAULT 'not_started',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- ─── applications ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS applications (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  borrower_id            uuid        NOT NULL REFERENCES borrowers(id),
  application_number     text        NOT NULL UNIQUE,
  loan_purpose           text        NOT NULL,
  requested_amount       numeric(18,2) NOT NULL,
  requested_term_months  integer     NOT NULL,
  exit_strategy          text        NOT NULL,
  application_status     text        NOT NULL DEFAULT 'draft',
  submitted_at           timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- ─── properties ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS properties (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id   uuid        NOT NULL REFERENCES applications(id),
  address_line_1   text        NOT NULL,
  address_line_2   text,
  city             text        NOT NULL,
  state            text        NOT NULL,
  postal_code      text        NOT NULL,
  property_type    text        NOT NULL,
  occupancy_type   text        NOT NULL,
  current_value    numeric(18,2),
  arv_value        numeric(18,2),
  purchase_price   numeric(18,2),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ─── loan_requests ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loan_requests (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id           uuid        NOT NULL REFERENCES applications(id),
  requested_principal      numeric(18,2) NOT NULL,
  requested_interest_rate  numeric(8,4),
  requested_points         numeric(8,4),
  requested_ltv            numeric(8,4),
  requested_ltc            numeric(8,4),
  requested_dscr           numeric(8,4),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- ─── indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_borrowers_profile_id ON borrowers(profile_id);
CREATE INDEX IF NOT EXISTS idx_applications_borrower_id ON applications(borrower_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(application_status);
CREATE INDEX IF NOT EXISTS idx_properties_application_id ON properties(application_id);
CREATE INDEX IF NOT EXISTS idx_loan_requests_application_id ON loan_requests(application_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE borrowers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications   ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties     ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_requests  ENABLE ROW LEVEL SECURITY;

-- profiles: users can only read/update their own profile
CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (id = auth.uid());

-- borrowers: users can only see their own borrower record
CREATE POLICY "borrowers_select_own" ON borrowers
  FOR SELECT USING (profile_id = auth.uid());

CREATE POLICY "borrowers_insert_own" ON borrowers
  FOR INSERT WITH CHECK (profile_id = auth.uid());

-- applications: borrowers can only see their own applications
CREATE POLICY "applications_select_own" ON applications
  FOR SELECT USING (
    borrower_id IN (SELECT id FROM borrowers WHERE profile_id = auth.uid())
  );

CREATE POLICY "applications_insert_own" ON applications
  FOR INSERT WITH CHECK (
    borrower_id IN (SELECT id FROM borrowers WHERE profile_id = auth.uid())
  );

CREATE POLICY "applications_update_own" ON applications
  FOR UPDATE USING (
    borrower_id IN (SELECT id FROM borrowers WHERE profile_id = auth.uid())
  );

-- properties: scoped to borrower's applications
CREATE POLICY "properties_select_own" ON properties
  FOR SELECT USING (
    application_id IN (
      SELECT id FROM applications WHERE borrower_id IN (
        SELECT id FROM borrowers WHERE profile_id = auth.uid()
      )
    )
  );

CREATE POLICY "properties_insert_own" ON properties
  FOR INSERT WITH CHECK (
    application_id IN (
      SELECT id FROM applications WHERE borrower_id IN (
        SELECT id FROM borrowers WHERE profile_id = auth.uid()
      )
    )
  );

-- loan_requests: scoped to borrower's applications
CREATE POLICY "loan_requests_select_own" ON loan_requests
  FOR SELECT USING (
    application_id IN (
      SELECT id FROM applications WHERE borrower_id IN (
        SELECT id FROM borrowers WHERE profile_id = auth.uid()
      )
    )
  );

CREATE POLICY "loan_requests_insert_own" ON loan_requests
  FOR INSERT WITH CHECK (
    application_id IN (
      SELECT id FROM applications WHERE borrower_id IN (
        SELECT id FROM borrowers WHERE profile_id = auth.uid()
      )
    )
  );
