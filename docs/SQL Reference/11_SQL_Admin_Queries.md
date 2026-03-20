# NexusBridge CreditOS — SQL Reference: Admin & Operational Queries

**Phase:** Operational (all phases)
**Related docs:** `docs/01_Database_Schema.md`, `docs/15_Data_Security_Audit_Framework.md`

Operational SQL queries for admin use — user management, audit verification, and database health checks.
Run each statement individually in the Supabase SQL Editor.

---

## Delete User (Cascade)

Run each statement **one at a time** in the Supabase SQL Editor.
Replace the UUID with the actual user ID to delete.

**User:** vepap21@gmail.com
**ID:** `62a82767-1aa4-4483-bdcf-15d359dbca96`

---

## Step 1 — Delete application documents

```sql
DELETE FROM documents
WHERE owner_type = 'application'
  AND owner_id IN (
    SELECT id FROM applications
    WHERE borrower_id IN (
      SELECT id FROM borrowers
      WHERE profile_id = '62a82767-1aa4-4483-bdcf-15d359dbca96'
    )
  );
```

## Step 2 — Delete loan requests

```sql
DELETE FROM loan_requests
WHERE application_id IN (
  SELECT id FROM applications
  WHERE borrower_id IN (
    SELECT id FROM borrowers
    WHERE profile_id = '62a82767-1aa4-4483-bdcf-15d359dbca96'
  )
);
```

## Step 3 — Delete properties

```sql
DELETE FROM properties
WHERE application_id IN (
  SELECT id FROM applications
  WHERE borrower_id IN (
    SELECT id FROM borrowers
    WHERE profile_id = '62a82767-1aa4-4483-bdcf-15d359dbca96'
  )
);
```

## Step 4 — Delete applications

```sql
DELETE FROM applications
WHERE borrower_id IN (
  SELECT id FROM borrowers
  WHERE profile_id = '62a82767-1aa4-4483-bdcf-15d359dbca96'
);
```

## Step 5 — Delete borrower documents

```sql
DELETE FROM documents
WHERE uploaded_by = '62a82767-1aa4-4483-bdcf-15d359dbca96';
```

## Step 6 — Delete borrower record

```sql
DELETE FROM borrowers
WHERE profile_id = '62a82767-1aa4-4483-bdcf-15d359dbca96';
```

## Step 6b — Nullify audit events (preserves history)

```sql
UPDATE audit_events
SET actor_profile_id = NULL
WHERE actor_profile_id = '62a82767-1aa4-4483-bdcf-15d359dbca96';
```

## Step 7 — Delete profile

```sql
DELETE FROM profiles
WHERE id = '62a82767-1aa4-4483-bdcf-15d359dbca96';
```

## Step 8 — Delete auth user

```sql
DELETE FROM auth.users
WHERE id = '62a82767-1aa4-4483-bdcf-15d359dbca96';
```

---

## Verification — Check everything is deleted

Run this after all steps to confirm nothing remains:

```sql
SELECT 'auth.users'    AS tbl, COUNT(*) FROM auth.users        WHERE id           = '62a82767-1aa4-4483-bdcf-15d359dbca96'
UNION ALL
SELECT 'profiles',              COUNT(*) FROM profiles          WHERE id           = '62a82767-1aa4-4483-bdcf-15d359dbca96'
UNION ALL
SELECT 'user_roles',            COUNT(*) FROM user_roles        WHERE user_id      = '62a82767-1aa4-4483-bdcf-15d359dbca96'
UNION ALL
SELECT 'borrowers',             COUNT(*) FROM borrowers         WHERE profile_id   = '62a82767-1aa4-4483-bdcf-15d359dbca96'
UNION ALL
SELECT 'applications',          COUNT(*) FROM applications      WHERE borrower_id  IN (SELECT id FROM borrowers WHERE profile_id = '62a82767-1aa4-4483-bdcf-15d359dbca96')
UNION ALL
SELECT 'documents',             COUNT(*) FROM documents         WHERE uploaded_by  = '62a82767-1aa4-4483-bdcf-15d359dbca96';
```

All rows should return `0`. If any show a non-zero count, re-run the corresponding delete step.
