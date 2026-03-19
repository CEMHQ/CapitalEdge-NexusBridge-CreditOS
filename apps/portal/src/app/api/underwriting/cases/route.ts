import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserRole } from '@/lib/auth/roles'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (!['admin', 'manager', 'underwriter'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let query = supabase
    .from('underwriting_cases')
    .select(`
      id,
      case_status,
      priority,
      opened_at,
      closed_at,
      assigned_to,
      applications (
        id,
        application_number,
        application_status,
        requested_amount,
        loan_purpose,
        borrowers (
          profiles ( full_name, email )
        )
      )
    `)
    .order('opened_at', { ascending: false })

  // Underwriters only see their own assigned cases
  if (role === 'underwriter') {
    query = query.eq('assigned_to', user.id)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ cases: data ?? [] })
}
