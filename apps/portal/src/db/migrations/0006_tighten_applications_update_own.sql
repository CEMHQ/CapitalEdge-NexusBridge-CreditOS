-- Migration: 0006_tighten_applications_update_own
-- Restricts borrower UPDATE access on applications to draft status only.
--
-- Why: the original policy allowed borrowers to update their own application
-- at any status. This means a borrower could change application_status directly
-- (e.g. revert from 'under_review' back to 'draft') bypassing admin workflow.
-- Tightening to draft-only means once submitted, only admins control status.
--
-- Run statements separately in Supabase SQL Editor.

DROP POLICY "applications_update_own" ON applications;

CREATE POLICY "applications_update_own" ON applications
  FOR UPDATE USING (
    borrower_id IN (SELECT id FROM borrowers WHERE profile_id = auth.uid())
    AND application_status = 'draft'
  )
  WITH CHECK (
    borrower_id IN (SELECT id FROM borrowers WHERE profile_id = auth.uid())
    AND application_status = 'draft'
  );
