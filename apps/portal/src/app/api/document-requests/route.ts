import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserRole } from '@/lib/auth/roles'
import { z } from 'zod'

const createRequestSchema = z.object({
  request_owner_type: z.enum(['application', 'borrower', 'investor', 'loan']),
  request_owner_id:   z.string().uuid(),
  document_type:      z.string().min(1).max(100),
  due_date:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes:              z.string().trim().max(500).optional(),
})

// GET /api/document-requests?owner_type=application&owner_id=uuid
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  const { searchParams } = new URL(request.url)
  const owner_type = searchParams.get('owner_type')
  const owner_id = searchParams.get('owner_id')

  let query = supabase
    .from('document_requests')
    .select('*')
    .order('created_at', { ascending: false })

  if (!['admin', 'manager', 'underwriter'].includes(role)) {
    // Borrowers/investors see only their own requests
    query = query.eq('request_owner_id', user.id)
  } else {
    if (owner_type) query = query.eq('request_owner_type', owner_type)
    if (owner_id) query = query.eq('request_owner_id', owner_id)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ document_requests: data })
}

// POST /api/document-requests — admin/underwriter creates a request
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (!['admin', 'manager', 'underwriter'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const validation = createRequestSchema.safeParse(body)
  if (!validation.success) {
    return NextResponse.json({ error: 'Invalid data', issues: validation.error.issues }, { status: 400 })
  }

  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from('document_requests')
    .insert({
      ...validation.data,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, document_request_id: data.id })
}
