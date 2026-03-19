import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserRole } from '@/lib/auth/roles'
import { validateBody } from '@/lib/validation/validate'
import { assignApplicationSchema } from '@/lib/validation/schemas'
import { underwritingLimiter } from '@/lib/rate-limit/index'
import { applyRateLimit } from '@/lib/rate-limit/apply'
import { emitAuditEvent } from '@/lib/audit/emit'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const validation = await validateBody(request, assignApplicationSchema)
  if (!validation.success) return validation.response

  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (!['admin', 'manager'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const blocked = await applyRateLimit(underwritingLimiter, user.id)
  if (blocked) return blocked

  const { assigned_to } = validation.data

  // Find the underwriting case for this application
  const { data: uwCase } = await supabase
    .from('underwriting_cases')
    .select('id, assigned_to')
    .eq('application_id', id)
    .maybeSingle()

  if (!uwCase) {
    return NextResponse.json({ error: 'No underwriting case found for this application' }, { status: 404 })
  }

  const { error } = await supabase
    .from('underwriting_cases')
    .update({ assigned_to: assigned_to ?? null, updated_at: new Date().toISOString() })
    .eq('id', uwCase.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await emitAuditEvent({
    actorProfileId: user.id,
    eventType:      'underwriting_assigned',
    entityType:     'underwriting_case',
    entityId:       uwCase.id,
    eventPayload:   { application_id: id, assigned_to: assigned_to ?? null, actor_role: role },
  })

  return NextResponse.json({ success: true })
}
