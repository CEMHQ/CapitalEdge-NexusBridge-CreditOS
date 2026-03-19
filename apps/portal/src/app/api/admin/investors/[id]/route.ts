import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserRole } from '@/lib/auth/roles'
import { updateLimiter, deleteUserLimiter } from '@/lib/rate-limit/index'
import { applyRateLimit } from '@/lib/rate-limit/apply'
import { emitAuditEvent } from '@/lib/audit/emit'

const patchInvestorSchema = z.object({
  accreditation_status: z.enum(['pending', 'verified', 'expired']).optional(),
  kyc_status: z.enum(['not_started', 'in_progress', 'approved', 'failed']).optional(),
  aml_status: z.enum(['not_started', 'in_progress', 'approved', 'failed']).optional(),
  onboarding_status: z.enum(['pending', 'in_progress', 'complete']).optional(),
})

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

  const blocked = await applyRateLimit(updateLimiter, user.id)
  if (blocked) return blocked

  const body = await request.json().catch(() => null)
  const parsed = patchInvestorSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

  const updates = Object.fromEntries(
    Object.entries(parsed.data).filter(([, v]) => v !== undefined)
  )

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('investors')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  emitAuditEvent({
    actorProfileId: user.id,
    eventType: 'investor_updated',
    entityType: 'investor',
    entityId: id,
    eventPayload: updates,
  })

  return NextResponse.json({ success: true })
}

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

  const blocked = await applyRateLimit(deleteUserLimiter, user.id)
  if (blocked) return blocked

  const adminClient = createAdminClient()

  // Block if investor has any fund subscriptions
  const { data: subs } = await adminClient
    .from('fund_subscriptions')
    .select('id')
    .eq('investor_id', id)
    .limit(1)
    .maybeSingle()

  if (subs) {
    return NextResponse.json(
      { error: 'Cannot delete investor — they have fund subscription records.' },
      { status: 409 }
    )
  }

  // Delete fund_allocations
  await adminClient.from('fund_allocations').delete().eq('investor_id', id)

  // Delete the investor record
  const { error } = await adminClient.from('investors').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  emitAuditEvent({
    actorProfileId: user.id,
    eventType: 'investor_deleted',
    entityType: 'investor',
    entityId: id,
    eventPayload: { action: 'investor_deleted' },
  })

  return NextResponse.json({ success: true })
}
