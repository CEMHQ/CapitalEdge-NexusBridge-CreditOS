import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserRole } from '@/lib/auth/roles'
import { updateInvestorProfileSchema } from '@/lib/validation/schemas'
import { updateLimiter } from '@/lib/rate-limit/index'
import { applyRateLimit } from '@/lib/rate-limit/apply'

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== 'investor') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const blocked = await applyRateLimit(updateLimiter, user.id)
  if (blocked) return blocked

  const body = await request.json().catch(() => null)
  const parsed = updateInvestorProfileSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }

  const { data: investor } = await supabase
    .from('investors')
    .select('id')
    .eq('profile_id', user.id)
    .maybeSingle()

  if (!investor) return NextResponse.json({ error: 'Investor record not found' }, { status: 404 })

  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('investors')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', investor.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
