-- Migration: 0008_cascade_deletes
-- Adds ON DELETE CASCADE to all foreign key chains so that deleting a user
-- from Supabase Auth automatically removes all associated records.
--
-- Delete chain:
--   auth.users → profiles → borrowers → applications → properties
--                                                    → loan_requests
--                         → investors
--   auth.users → user_roles (already CASCADE from migration 0005)
--
-- Run each statement separately in the Supabase SQL Editor.

-- ─── 1. profiles → auth.users ────────────────────────────────────────────────
-- profiles has no FK to auth.users — add it now
ALTER TABLE profiles
  ADD CONSTRAINT profiles_id_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ─── 2. borrowers → profiles ─────────────────────────────────────────────────
ALTER TABLE borrowers DROP CONSTRAINT borrowers_profile_id_fkey;
ALTER TABLE borrowers
  ADD CONSTRAINT borrowers_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- ─── 3. investors → profiles ─────────────────────────────────────────────────
ALTER TABLE investors DROP CONSTRAINT investors_profile_id_fkey;
ALTER TABLE investors
  ADD CONSTRAINT investors_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- ─── 4. applications → borrowers ─────────────────────────────────────────────
ALTER TABLE applications DROP CONSTRAINT applications_borrower_id_fkey;
ALTER TABLE applications
  ADD CONSTRAINT applications_borrower_id_fkey
  FOREIGN KEY (borrower_id) REFERENCES borrowers(id) ON DELETE CASCADE;

-- ─── 5. properties → applications ────────────────────────────────────────────
ALTER TABLE properties DROP CONSTRAINT properties_application_id_fkey;
ALTER TABLE properties
  ADD CONSTRAINT properties_application_id_fkey
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE;

-- ─── 6. loan_requests → applications ─────────────────────────────────────────
ALTER TABLE loan_requests DROP CONSTRAINT loan_requests_application_id_fkey;
ALTER TABLE loan_requests
  ADD CONSTRAINT loan_requests_application_id_fkey
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE;
