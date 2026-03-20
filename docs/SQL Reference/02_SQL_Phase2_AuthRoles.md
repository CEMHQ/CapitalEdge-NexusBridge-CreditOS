# NexusBridge CreditOS — SQL Reference: Phase 2 — Auth & Roles

**Phase:** 2 — Auth + Portals
**Related docs:** `docs/02_System_Architecture.md`, `docs/05_Entity_Separation_Strategy.md`
**Migrations:** `0005_user_roles`, `0006_auth_callbacks`

Auth functions, RLS policies, and user management queries.
Run each statement individually in the Supabase SQL Editor.

> Core table DDL (CREATE TABLE statements) is in `01_SQL_CoreSchema.md`.

---

## Table of Contents

1. [Functions & Triggers](#1-functions--triggers)
2. [RLS Policies — Borrower (own data)](#2-rls-policies--borrower-own-data)
3. [RLS Policies — Admin (all data)](#3-rls-policies--admin-all-data)
4. [User Management Queries](#4-user-management-queries)
5. [Audit & Verification Queries](#5-audit--verification-queries)

---

## 1. Functions & Triggers

> Migration: `0005_user_roles`
> Related doc: `docs/02_System_Architecture.md`
> Replaces JWT metadata lookup — reads from user_roles table instead

### Role lookup functions

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

## 2. RLS Policies — Borrower (own data)

> Related doc: `docs/02_System_Architecture.md`
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

## 3. RLS Policies — Admin (all data)

> Related doc: `docs/02_System_Architecture.md`, `docs/05_Entity_Separation_Strategy.md`
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

## 4. User Management Queries

> Related doc: `docs/02_System_Architecture.md`

### Check if a user's records exist

**Check profile only:**
```sql
SELECT * FROM profiles WHERE email = 'user@example.com';
```

**Check role for a specific user:**
```sql
SELECT u.email, r.role, r.created_at, r.updated_at
FROM auth.users u
JOIN public.user_roles r ON r.user_id = u.id
WHERE u.email = 'user@example.com';
```

> Note: the `handle_new_user` trigger uses `ON CONFLICT (user_id) DO NOTHING` — if a `user_roles` row already exists for the user it will not be overwritten. Use a manual `UPDATE` to change an existing role.

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

```sql
-- Step 1: delete loan_requests
DELETE FROM loan_requests WHERE application_id IN (
  SELECT id FROM applications WHERE borrower_id IN (
    SELECT id FROM borrowers WHERE profile_id = (
      SELECT id FROM profiles WHERE email = 'user@example.com'
    )
  )
);

-- Step 2: delete properties
DELETE FROM properties WHERE application_id IN (
  SELECT id FROM applications WHERE borrower_id IN (
    SELECT id FROM borrowers WHERE profile_id = (
      SELECT id FROM profiles WHERE email = 'user@example.com'
    )
  )
);

-- Step 3: delete applications
DELETE FROM applications WHERE borrower_id IN (
  SELECT id FROM borrowers WHERE profile_id = (
    SELECT id FROM profiles WHERE email = 'user@example.com'
  )
);

-- Step 4: delete investor record
DELETE FROM investors WHERE profile_id = (
  SELECT id FROM profiles WHERE email = 'user@example.com'
);

-- Step 5: delete user_roles
DELETE FROM user_roles WHERE user_id = (
  SELECT id FROM profiles WHERE email = 'user@example.com'
);

-- Step 6: delete borrower
DELETE FROM borrowers WHERE profile_id = (
  SELECT id FROM profiles WHERE email = 'user@example.com'
);

-- Step 7: delete profile
DELETE FROM profiles WHERE email = 'user@example.com';
```

---

## 5. Audit & Verification Queries

> Related doc: `docs/02_System_Architecture.md`, `docs/15_Data_Security_Audit_Framework.md`

### Check all RLS policies

```sql
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
