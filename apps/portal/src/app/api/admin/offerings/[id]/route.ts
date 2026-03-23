import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserRole } from '@/lib/auth/roles'
import { validateBody } from '@/lib/validation/validate'
import { patchOfferingSchema } from '@/lib/validation/schemas'
import { offeringsLimiter } from '@/lib/rate-limit/index'
import { applyRateLimit } from '@/lib/rate-limit/apply'
import { emitAuditEvent } from '@/lib/audit/emit'

/**
 * PATCH /api/admin/offerings/[id]
 *
 * Update any offering field including offering_status.
 * Admin only (managers can read but not mutate offerings).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const blocked = await applyRateLimit(offeringsLimiter, user.id)
  if (blocked) return blocked

  const validation = await validateBody(request, patchOfferingSchema)
  if (!validation.success) return validation.response

  const updates = Object.fromEntries(
    Object.entries(validation.data).filter(([, v]) => v !== undefined)
  )

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  const { error } = await adminClient
    .from('offerings')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  emitAuditEvent({
    actorProfileId: user.id,
    eventType: 'offering_updated',
    entityType: 'offering',
    entityId: id,
    newValue: updates,
  })

  return NextResponse.json({ success: true })
}

/**
 * DELETE /api/admin/offerings/[id]
 *
 * Hard-delete an offering. Blocked if the offering is 'active' to prevent
 * removing live offerings while investors can see them — set to 'terminated'
 * first.
 * Admin only.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const blocked = await applyRateLimit(offeringsLimiter, user.id)
  if (blocked) return blocked

  const adminClient = createAdminClient()

  // Block deletion of active offerings
  const { data: offering } = await adminClient
    .from('offerings')
    .select('id, offering_status, title')
    .eq('id', id)
    .maybeSingle()

  if (!offering) return NextResponse.json({ error: 'Offering not found' }, { status: 404 })

  if (offering.offering_status === 'active') {
    return NextResponse.json(
      { error: 'Cannot delete an active offering. Set status to "terminated" or "closed" first.' },
      { status: 409 }
    )
  }

  const { error } = await adminClient.from('offerings').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  emitAuditEvent({
    actorProfileId: user.id,
    eventType: 'offering_deleted',
    entityType: 'offering',
    entityId: id,
    eventPayload: { title: offering.title, status: offering.offering_status },
  })

  return NextResponse.json({ success: true })
}
