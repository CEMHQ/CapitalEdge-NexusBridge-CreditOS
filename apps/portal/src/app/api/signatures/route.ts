import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserRole } from '@/lib/auth/roles'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (!['admin', 'manager'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const entityType = url.searchParams.get('entity_type')
  const entityId   = url.searchParams.get('entity_id')

  let query = supabase
    .from('signature_requests')
    .select('id, entity_type, entity_id, document_type, status, signers, sent_at, completed_at, declined_at, decline_reason, created_at')
    .order('created_at', { ascending: false })

  if (entityType) query = query.eq('entity_type', entityType)
  if (entityId)   query = query.eq('entity_id', entityId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
