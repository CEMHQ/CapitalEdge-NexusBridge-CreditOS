# NexusBridge CreditOS — SQL Reference

Organized reference for all Supabase SQL queries.
Run each statement individually in the Supabase SQL Editor.

---

## Table of Contents

1. [Schema — Core Tables](#1-schema--core-tables)
2. [Schema — User Roles](#2-schema--user-roles)
3. [Schema — Investors](#3-schema--investors)
4. [Functions & Triggers](#4-functions--triggers)
5. [RLS Policies — Borrower (own data)](#5-rls-policies--borrower-own-data)
6. [RLS Policies — Admin (all data)](#6-rls-policies--admin-all-data)
7. [Foreign Keys & Cascade Deletes](#7-foreign-keys--cascade-deletes)
8. [User Management Queries](#8-user-management-queries)
9. [Audit & Verification Queries](#9-audit--verification-queries)

---

## 1. Schema — Core Tables

> Migration: 0001_initial_borrower_schema
> Creates profiles, borrowers, applications, properties, loan_requests

```sql
CREATE TABLE IF NOT EXISTS profiles (
  id          uuid        PRIMARY KEY, -- matches auth.users.id
  email       text        NOT NULL UNIQUE,
  full_name   text,
  phone       text,
  status      text        NOT NULL DEFAULT 'pending',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
```

```sql
CREATE TABLE IF NOT EXISTS borrowers (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id         uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  borrower_type      text        NOT NULL DEFAULT 'individual',
  onboarding_status  text        NOT NULL DEFAULT 'pending',
  kyc_status         text        NOT NULL DEFAULT 'not_started',
  aml_status         text        NOT NULL DEFAULT 'not_started',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
```

```sql
CREATE TABLE IF NOT EXISTS applications (
  id                     uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  borrower_id            uuid          NOT NULL REFERENCES borrowers(id) ON DELETE CASCADE,
  application_number     text          NOT NULL UNIQUE,
  loan_purpose           text          NOT NULL,
  requested_amount       numeric(18,2) NOT NULL,
  requested_term_months  integer       NOT NULL,
  exit_strategy          text          NOT NULL,
  application_status     text          NOT NULL DEFAULT 'draft',
  submitted_at           timestamptz,
  created_at             timestamptz   NOT NULL DEFAULT now(),
  updated_at             timestamptz   NOT NULL DEFAULT now()
);
```

```sql
CREATE TABLE IF NOT EXISTS properties (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id   uuid          NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  address_line_1   text          NOT NULL,
  address_line_2   text,
  city             text          NOT NULL,
  state            text          NOT NULL,
  postal_code      text          NOT NULL,
  property_type    text          NOT NULL,
  occupancy_type   text          NOT NULL,
  current_value    numeric(18,2),
  arv_value        numeric(18,2),
  purchase_price   numeric(18,2),
  created_at       timestamptz   NOT NULL DEFAULT now(),
  updated_at       timestamptz   NOT NULL DEFAULT now()
);
```

```sql
CREATE TABLE IF NOT EXISTS loan_requests (
  id                       uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id           uuid          NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  requested_principal      numeric(18,2) NOT NULL,
  requested_interest_rate  numeric(8,4),
  requested_points         numeric(8,4),
  requested_ltv            numeric(8,4),
  requested_ltc            numeric(8,4),
  requested_dscr           numeric(8,4),
  created_at               timestamptz   NOT NULL DEFAULT now(),
  updated_at               timestamptz   NOT NULL DEFAULT now()
);
```

```sql
-- Indexes
CREATE INDEX IF NOT EXISTS idx_borrowers_profile_id ON borrowers(profile_id);
CREATE INDEX IF NOT EXISTS idx_applications_borrower_id ON applications(borrower_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(application_status);
CREATE INDEX IF NOT EXISTS idx_properties_application_id ON properties(application_id);
CREATE INDEX IF NOT EXISTS idx_loan_requests_application_id ON loan_requests(application_id);
```

```sql
-- Enable RLS on all core tables
ALTER TABLE profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE borrowers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications   ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties     ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_requests  ENABLE ROW LEVEL SECURITY;
```

---

## 2. Schema — User Roles

> Migration: 0005_user_roles
> Source of truth for roles — prevents role spoofing via JWT metadata

```sql
CREATE TABLE IF NOT EXISTS user_roles (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text        NOT NULL DEFAULT 'borrower',
  granted_by  uuid        REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_role CHECK (
    role IN ('borrower', 'investor', 'admin', 'underwriter', 'servicing', 'manager')
  )
);
```

```sql
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
```

```sql
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
```

```sql
-- Users can read their own role
CREATE POLICY "user_roles_select_own" ON user_roles
  FOR SELECT USING (user_id = auth.uid());
```

```sql
-- Backfill existing users (safe to re-run)
INSERT INTO public.user_roles (user_id, role)
SELECT
  id,
  CASE
    WHEN raw_user_meta_data->>'role' IN ('borrower','investor','admin','underwriter','servicing','manager')
    THEN raw_user_meta_data->>'role'
    ELSE 'borrower'
  END
FROM auth.users
ON CONFLICT (user_id) DO NOTHING;
```

---

## 3. Schema — Investors

> Migration: 0007_investors
> Accredited investor onboarding — mirrors borrowers table pattern

```sql
CREATE TABLE IF NOT EXISTS investors (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id            uuid        NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  investor_type         text        NOT NULL DEFAULT 'individual',
  accreditation_status  text        NOT NULL DEFAULT 'pending',
  kyc_status            text        NOT NULL DEFAULT 'not_started',
  aml_status            text        NOT NULL DEFAULT 'not_started',
  onboarding_status     text        NOT NULL DEFAULT 'pending',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
```

```sql
CREATE INDEX IF NOT EXISTS idx_investors_profile_id ON investors(profile_id);
```

```sql
ALTER TABLE investors ENABLE ROW LEVEL SECURITY;
```

---

## 4. Functions & Triggers

### Role lookup functions

> Migration: 0005_user_roles
> Replaces JWT metadata lookup — reads from user_roles table instead

```sql
-- Returns the current user's role from the database
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS text AS $$
  SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

```sql
-- Returns true if current user is admin/manager/underwriter/servicing
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
  SELECT get_user_role() IN ('admin', 'manager', 'underwriter', 'servicing');
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

### handle_new_user trigger

> Auto-creates profile and user_roles row on signup.
> Invite flow respects role from metadata. Public signup forces 'borrower'.

```sql
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_role text;
BEGIN
  INSERT INTO public.profiles (id, email, status)
  VALUES (NEW.id, NEW.email, 'pending')
  ON CONFLICT (id) DO NOTHING;

  IF NEW.invited_at IS NOT NULL THEN
    v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'borrower');
    IF v_role NOT IN ('borrower', 'investor', 'admin', 'underwriter', 'servicing', 'manager') THEN
      v_role := 'borrower';
    END IF;
  ELSE
    v_role := 'borrower';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, v_role)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

```sql
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

---

## 5. RLS Policies — Borrower (own data)

> Users can only read/write their own records

```sql
-- profiles
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (id = auth.uid());
```

```sql
-- borrowers
CREATE POLICY "borrowers_select_own" ON borrowers FOR SELECT USING (profile_id = auth.uid());
CREATE POLICY "borrowers_insert_own" ON borrowers FOR INSERT WITH CHECK (profile_id = auth.uid());
```

```sql
-- applications (update locked to draft status only)
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
    AND application_status = 'draft'
  )
  WITH CHECK (
    borrower_id IN (SELECT id FROM borrowers WHERE profile_id = auth.uid())
    AND application_status = 'draft'
  );
```

```sql
-- properties
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
```

```sql
-- loan_requests
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
```

```sql
-- investors
CREATE POLICY "investors_select_own" ON investors FOR SELECT USING (profile_id = auth.uid());
CREATE POLICY "investors_insert_own" ON investors FOR INSERT WITH CHECK (profile_id = auth.uid());
```

---

## 6. RLS Policies — Admin (all data)

> Admin/manager/underwriter/servicing can read and update all records

```sql
-- profiles
CREATE POLICY "profiles_select_admin" ON profiles FOR SELECT USING (is_admin());
CREATE POLICY "profiles_update_admin" ON profiles FOR UPDATE USING (is_admin());
```

```sql
-- borrowers
CREATE POLICY "borrowers_select_admin" ON borrowers FOR SELECT USING (is_admin());
CREATE POLICY "borrowers_update_admin" ON borrowers FOR UPDATE USING (is_admin());
```

```sql
-- applications
CREATE POLICY "applications_select_admin" ON applications FOR SELECT USING (is_admin());
CREATE POLICY "applications_update_admin" ON applications FOR UPDATE USING (is_admin());
```

```sql
-- properties
CREATE POLICY "properties_select_admin" ON properties FOR SELECT USING (is_admin());
CREATE POLICY "properties_update_admin" ON properties FOR UPDATE USING (is_admin());
```

```sql
-- loan_requests
CREATE POLICY "loan_requests_select_admin" ON loan_requests FOR SELECT USING (is_admin());
CREATE POLICY "loan_requests_update_admin" ON loan_requests FOR UPDATE USING (is_admin());
```

```sql
-- investors
CREATE POLICY "investors_select_admin" ON investors FOR SELECT USING (is_admin());
CREATE POLICY "investors_update_admin" ON investors FOR UPDATE USING (is_admin());
```

---

## 7. Foreign Keys & Cascade Deletes

> Migration: 0008_cascade_deletes
> Deleting a user from Supabase Auth → Authentication → Users automatically
> removes all associated records across the entire chain.

```sql
-- profiles → auth.users
ALTER TABLE profiles
  ADD CONSTRAINT profiles_id_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
```

```sql
-- borrowers → profiles
ALTER TABLE borrowers DROP CONSTRAINT borrowers_profile_id_fkey;
ALTER TABLE borrowers
  ADD CONSTRAINT borrowers_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;
```

```sql
-- investors → profiles
ALTER TABLE investors DROP CONSTRAINT investors_profile_id_fkey;
ALTER TABLE investors
  ADD CONSTRAINT investors_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;
```

```sql
-- applications → borrowers
ALTER TABLE applications DROP CONSTRAINT applications_borrower_id_fkey;
ALTER TABLE applications
  ADD CONSTRAINT applications_borrower_id_fkey
  FOREIGN KEY (borrower_id) REFERENCES borrowers(id) ON DELETE CASCADE;
```

```sql
-- properties → applications
ALTER TABLE properties DROP CONSTRAINT properties_application_id_fkey;
ALTER TABLE properties
  ADD CONSTRAINT properties_application_id_fkey
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE;
```

```sql
-- loan_requests → applications
ALTER TABLE loan_requests DROP CONSTRAINT loan_requests_application_id_fkey;
ALTER TABLE loan_requests
  ADD CONSTRAINT loan_requests_application_id_fkey
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE;
```

---

## 8. User Management Queries

### Check if a user's records exist

**Check profile only:**
```sql
SELECT * FROM profiles WHERE email = 'user@example.com';
```

**Check all records for a user:**
```sql
SELECT
  p.id, p.email, p.status,
  r.role,
  b.id AS borrower_id, b.kyc_status,
  i.id AS investor_id, i.accreditation_status
FROM profiles p
LEFT JOIN user_roles r ON r.user_id = p.id
LEFT JOIN borrowers b ON b.profile_id = p.id
LEFT JOIN investors i ON i.profile_id = p.id
WHERE p.email = 'user@example.com';
```

### Manual cascade delete

> Migration 0008 is applied — deleting a user from Supabase Auth → Authentication → Users
> now cascades automatically. Use these manual steps only for emergency cleanup.

**Step 1 — delete loan_requests:**
```sql
DELETE FROM loan_requests WHERE application_id IN (
  SELECT id FROM applications WHERE borrower_id IN (
    SELECT id FROM borrowers WHERE profile_id = (
      SELECT id FROM profiles WHERE email = 'user@example.com'
    )
  )
);
```

**Step 2 — delete properties:**
```sql
DELETE FROM properties WHERE application_id IN (
  SELECT id FROM applications WHERE borrower_id IN (
    SELECT id FROM borrowers WHERE profile_id = (
      SELECT id FROM profiles WHERE email = 'user@example.com'
    )
  )
);
```

**Step 3 — delete applications:**
```sql
DELETE FROM applications WHERE borrower_id IN (
  SELECT id FROM borrowers WHERE profile_id = (
    SELECT id FROM profiles WHERE email = 'user@example.com'
  )
);
```

**Step 4 — delete investor record:**
```sql
DELETE FROM investors WHERE profile_id = (
  SELECT id FROM profiles WHERE email = 'user@example.com'
);
```

**Step 5 — delete user_roles:**
```sql
DELETE FROM user_roles WHERE user_id = (
  SELECT id FROM profiles WHERE email = 'user@example.com'
);
```

**Step 6 — delete borrower:**
```sql
DELETE FROM borrowers WHERE profile_id = (
  SELECT id FROM profiles WHERE email = 'user@example.com'
);
```

**Step 7 — delete profile:**
```sql
DELETE FROM profiles WHERE email = 'user@example.com';
```

---

## 9. Audit & Verification Queries

### Check all RLS policies

```sql
-- All policies across core tables
SELECT policyname, tablename, cmd
FROM pg_policies
WHERE tablename IN ('profiles', 'borrowers', 'applications', 'properties', 'loan_requests', 'user_roles', 'investors')
ORDER BY tablename, cmd, policyname;
```

### Check all users and their roles

```sql
SELECT u.email, r.role, r.granted_by, u.created_at
FROM auth.users u
LEFT JOIN public.user_roles r ON r.user_id = u.id
ORDER BY u.created_at DESC;
```

### Check all applications

```sql
SELECT
  a.application_number,
  a.application_status,
  a.requested_amount,
  a.submitted_at,
  p.email AS borrower_email,
  p.full_name AS borrower_name
FROM applications a
JOIN borrowers b ON b.id = a.borrower_id
JOIN profiles p ON p.id = b.profile_id
ORDER BY a.created_at DESC;
```

### Check foreign key constraints

```sql
-- Verify cascade constraints are in place
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table,
  rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name IN ('profiles', 'borrowers', 'investors', 'applications', 'properties', 'loan_requests', 'user_roles')
ORDER BY tc.table_name;
```
