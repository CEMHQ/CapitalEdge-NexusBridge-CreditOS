-- Migration: 0005_user_roles
-- Creates a user_roles table as the source of truth for roles.
-- Replaces JWT metadata as the role source so roles are verified at the DB layer.
--
-- Why: role stored only in user_metadata is a single point of failure —
-- a manipulated JWT bypasses both middleware and RLS. This migration moves
-- role enforcement to the database where it cannot be spoofed client-side.
--
-- Run each statement separately in the Supabase SQL Editor.

-- ─── 1. Create user_roles table ──────────────────────────────────────────────

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

-- ─── 2. Indexes ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);

-- ─── 3. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Users can read their own role (needed by middleware and API routes)
CREATE POLICY "user_roles_select_own" ON user_roles
  FOR SELECT USING (user_id = auth.uid());

-- No INSERT/UPDATE/DELETE from client — all writes go through service role only

-- ─── 4. Replace is_admin() with DB lookup ────────────────────────────────────
-- Old version read from JWT user_metadata — can be spoofed.
-- New version queries the user_roles table — cannot be spoofed.

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS text AS $$
  SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
  SELECT get_user_role() IN ('admin', 'manager', 'underwriter', 'servicing');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ─── 5. Update handle_new_user trigger to seed user_roles ────────────────────
-- Distinguishes invite flow (invited_at IS NOT NULL) from public signup.
-- Invite flow: respects role set in metadata by the admin.
-- Public signup: forces role to 'borrower' regardless of what client sends.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_role text;
BEGIN
  -- Create profile row
  INSERT INTO public.profiles (id, email, status)
  VALUES (NEW.id, NEW.email, 'pending')
  ON CONFLICT (id) DO NOTHING;

  -- Determine role: invite flow respects metadata, public signup forces borrower
  IF NEW.invited_at IS NOT NULL THEN
    v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'borrower');
    -- Validate the role is in the allowed set; fall back to borrower if not
    IF v_role NOT IN ('borrower', 'investor', 'admin', 'underwriter', 'servicing', 'manager') THEN
      v_role := 'borrower';
    END IF;
  ELSE
    v_role := 'borrower';
  END IF;

  -- Seed user_roles
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, v_role)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 6. Backfill existing users into user_roles ───────────────────────────────
-- One-time backfill. ON CONFLICT DO NOTHING makes it safe to re-run.

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
