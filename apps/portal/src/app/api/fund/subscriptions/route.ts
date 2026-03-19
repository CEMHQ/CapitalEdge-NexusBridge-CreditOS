import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserRole } from '@/lib/auth/roles'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (!['admin', 'manager'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('fund_subscriptions')
    .select(`
      id, commitment_amount, funded_amount, subscription_status,
      reservation_status, fcfs_position, reserved_at, confirmed_at,
      reservation_expires_at, notes, created_at, updated_at,
      funds ( id, fund_name ),
      investors (
        id, accreditation_status, onboarding_status,
        profiles ( full_name, email )
      )
    `)
    .order('fcfs_position', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ subscriptions: data ?? [] })
}
