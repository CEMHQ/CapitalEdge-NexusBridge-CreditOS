import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserRole } from '@/lib/auth/roles'
import { validateBody } from '@/lib/validation/validate'
import { inviteUserSchema } from '@/lib/validation/schemas'
import { inviteLimiter } from '@/lib/rate-limit/index'
import { applyRateLimit } from '@/lib/rate-limit/apply'

export async function POST(request: Request) {
  const validation = await validateBody(request, inviteUserSchema)
  if (!validation.success) return validation.response

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const requestingRole = await getUserRole(supabase, user.id)
  if (!['admin', 'manager'].includes(requestingRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const blocked = await applyRateLimit(inviteLimiter, user.id)
  if (blocked) return blocked

  const { email, role } = validation.data

  const adminClient = createAdminClient()

  const { data: inviteData, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { role },
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/set-password`,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Seed user_roles immediately so the role is in the DB before the user accepts.
  // The handle_new_user trigger will also run on acceptance, but this ensures
  // the role is set even if the trigger hasn't fired yet.
  if (inviteData?.user?.id) {
    await adminClient.from('user_roles').upsert(
      { user_id: inviteData.user.id, role, granted_by: user.id },
      { onConflict: 'user_id' }
    )
  }

  return NextResponse.json({ success: true })
}
