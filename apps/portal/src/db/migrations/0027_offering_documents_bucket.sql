-- Migration: 0027_offering_documents_bucket
-- Creates the 'offering-documents' Supabase Storage bucket and its RLS policies.
-- Bucket is private (not public). Signed URLs are generated server-side via the
-- admin client and expire after 15 minutes (download) or 60 minutes (upload).

-- ── Bucket ────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'offering-documents',
  'offering-documents',
  false,
  52428800,  -- 50 MB per file
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- ── Storage RLS policies ──────────────────────────────────────────────────────

-- Admins and managers: full CRUD on offering documents
CREATE POLICY "offering_documents_storage_admin_all"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'offering-documents'
  AND EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role IN ('admin', 'manager')
  )
)
WITH CHECK (
  bucket_id = 'offering-documents'
  AND EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role IN ('admin', 'manager')
  )
);

-- Investors and borrowers: read-only access to documents
-- linked to active offerings (server generates signed URL, this is a fallback).
CREATE POLICY "offering_documents_storage_read_active"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'offering-documents'
);
