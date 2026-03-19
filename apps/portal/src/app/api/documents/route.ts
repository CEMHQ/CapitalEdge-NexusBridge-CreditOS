import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserRole } from '@/lib/auth/roles'

// GET /api/documents?owner_type=borrower&owner_id=uuid
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  const { searchParams } = new URL(request.url)
  const owner_type = searchParams.get('owner_type')
  const owner_id = searchParams.get('owner_id')

  // Non-admin can only list their own documents
  if (!['admin', 'manager', 'underwriter', 'servicing'].includes(role)) {
    if (owner_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  let query = supabase
    .from('documents')
    .select('id, owner_type, owner_id, document_type, file_name, file_size_bytes, upload_status, review_status, rejection_reason, created_at, uploaded_by')
    .eq('upload_status', 'uploaded')
    .order('created_at', { ascending: false })

  if (owner_type) query = query.eq('owner_type', owner_type)
  if (owner_id) query = query.eq('owner_id', owner_id)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ documents: data })
}
