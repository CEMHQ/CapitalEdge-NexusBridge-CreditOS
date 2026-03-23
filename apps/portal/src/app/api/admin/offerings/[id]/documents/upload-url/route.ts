import 'server-only'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserRole } from '@/lib/auth/roles'
import { updateLimiter } from '@/lib/rate-limit/index'
import { applyRateLimit } from '@/lib/rate-limit/apply'

const OFFERING_DOCUMENTS_BUCKET = 'offering-documents'
// Signed upload URL valid for 60 minutes
const UPLOAD_URL_EXPIRY_SECONDS = 3600

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

/**
 * POST /api/admin/offerings/[id]/documents/upload-url
 *
 * Generates a signed upload URL for an offering document file.
 * Admin/manager only.
 *
 * Body: { filename: string, content_type: string }
 * Returns: { upload_url: string, file_path: string }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: offeringId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const blocked = await applyRateLimit(updateLimiter, user.id)
  if (blocked) return blocked

  const role = await getUserRole(supabase, user.id)
  if (!['admin', 'manager'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Verify offering exists
  const { data: offering } = await supabase
    .from('offerings')
    .select('id')
    .eq('id', offeringId)
    .maybeSingle()

  if (!offering) {
    return NextResponse.json({ error: 'Offering not found' }, { status: 404 })
  }

  let body: { filename?: unknown; content_type?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const filename = typeof body.filename === 'string' ? body.filename.trim() : ''
  const contentType = typeof body.content_type === 'string' ? body.content_type.trim() : ''

  if (!filename) {
    return NextResponse.json({ error: 'filename is required' }, { status: 400 })
  }
  if (!ALLOWED_MIME_TYPES.has(contentType)) {
    return NextResponse.json({ error: 'File type not allowed' }, { status: 400 })
  }

  // Sanitize filename: strip path components, replace whitespace/special chars
  const safeName = filename
    .replace(/.*[\\/]/, '')           // strip directory components
    .replace(/[^a-zA-Z0-9._-]/g, '-') // replace unsafe chars
    .toLowerCase()

  const timestamp = Date.now()
  const filePath = `offerings/${offeringId}/${timestamp}-${safeName}`

  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .storage
    .from(OFFERING_DOCUMENTS_BUCKET)
    .createSignedUploadUrl(filePath)

  if (error || !data?.signedUrl) {
    console.error('Failed to create signed upload URL:', error)
    return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 })
  }

  return NextResponse.json({
    upload_url: data.signedUrl,
    file_path: filePath,
  })
}
