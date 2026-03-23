import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateLimiter } from '@/lib/rate-limit/index'
import { applyRateLimit } from '@/lib/rate-limit/apply'

const OFFERING_DOCUMENTS_BUCKET = 'offering-documents'
// Signed URL valid for 15 minutes — long enough to open a PDF, short enough
// to limit exposure of a sensitive document link.
const SIGNED_URL_EXPIRY_SECONDS = 900

/**
 * GET /api/offerings/[docId]/document
 *
 * Returns a short-lived signed URL for downloading an offering document.
 * Investor role only; RLS on offering_documents ensures the parent offering
 * is 'active' before the record is visible.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ docId: string }> }
) {
  const { docId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const blocked = await applyRateLimit(updateLimiter, user.id)
  if (blocked) return blocked

  // Fetch the document record — RLS automatically restricts to active offerings
  // for investor/borrower roles; admin/manager bypass via staff policy.
  const { data: doc } = await supabase
    .from('offering_documents')
    .select('id, file_path, label')
    .eq('id', docId)
    .maybeSingle()

  if (!doc) {
    return NextResponse.json({ error: 'Document not found or not accessible' }, { status: 404 })
  }

  const adminClient = createAdminClient()

  const { data: signedData, error } = await adminClient
    .storage
    .from(OFFERING_DOCUMENTS_BUCKET)
    .createSignedUrl(doc.file_path, SIGNED_URL_EXPIRY_SECONDS)

  if (error || !signedData?.signedUrl) {
    return NextResponse.json({ error: 'Failed to generate document URL' }, { status: 500 })
  }

  // Redirect directly to the signed URL so <a href="..."> downloads work
  return NextResponse.redirect(signedData.signedUrl, { status: 302 })
}
