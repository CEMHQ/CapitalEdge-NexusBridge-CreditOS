# NexusBridge CreditOS — SQL Reference: Core Schema

**Phase:** 1 & 2 — Foundation DDL
**Related docs:** `docs/01_Database_Schema.md`, `docs/02_System_Architecture.md`
**Migrations:** `0001_initial_borrower_schema`, `0005_user_roles`, `0007_investors`, `0008_cascade_deletes`

All CREATE TABLE statements, indexes, and foreign key constraints for the core platform schema.
Run each statement individually in the Supabase SQL Editor.

> Auth functions, RLS policies, and user management queries are in `02_SQL_Phase2_AuthRoles.md`.

---

## Table of Contents

1. [Core Tables — Borrower Domain](#1-core-tables--borrower-domain)
2. [User Roles](#2-user-roles)
3. [Investors](#3-investors)
4. [Foreign Keys & Cascade Deletes](#4-foreign-keys--cascade-deletes)

---

## 1. Core Tables — Borrower Domain

> Migration: `0001_initial_borrower_schema`
> Related doc: `docs/01_Database_Schema.md`
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
CREATE INDEX IF NOT EXISTS idx_borrowers_profile_id        ON borrowers(profile_id);
CREATE INDEX IF NOT EXISTS idx_applications_borrower_id    ON applications(borrower_id);
CREATE INDEX IF NOT EXISTS idx_applications_status         ON applications(application_status);
CREATE INDEX IF NOT EXISTS idx_properties_application_id   ON properties(application_id);
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

## 2. User Roles

> Migration: `0005_user_roles`
> Related doc: `docs/02_System_Architecture.md`, `docs/05_Entity_Separation_Strategy.md`
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

## 3. Investors

> Migration: `0007_investors`
> Related doc: `docs/01_Database_Schema.md`, `docs/12_Investor_Portal_RegA_UX_Flow.md`
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

## 4. Foreign Keys & Cascade Deletes

> Migration: `0008_cascade_deletes`
> Related doc: `docs/01_Database_Schema.md`
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
