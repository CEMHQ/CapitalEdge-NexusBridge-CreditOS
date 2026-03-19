import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/notifications — fetch current user's notifications (most recent 30)
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('notifications')
    .select('id, subject, message, link_url, delivery_status, created_at, read_at')
    .eq('recipient_profile_id', user.id)
    .order('created_at', { ascending: false })
    .limit(30)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const unread = (data ?? []).filter((n) => n.delivery_status !== 'read').length

  return NextResponse.json({ notifications: data ?? [], unread })
}

// PATCH /api/notifications — mark all as read
export async function PATCH() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('notifications')
    .update({ delivery_status: 'read', read_at: new Date().toISOString() })
    .eq('recipient_profile_id', user.id)
    .neq('delivery_status', 'read')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
