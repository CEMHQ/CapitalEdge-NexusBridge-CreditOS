import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserRole } from '@/lib/auth/roles'
import { validateBody } from '@/lib/validation/validate'
import { updateSubscriptionSchema } from '@/lib/validation/schemas'
import { updateLimiter } from '@/lib/rate-limit/index'
import { applyRateLimit } from '@/lib/rate-limit/apply'
import { emitAuditEvent } from '@/lib/audit/emit'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const validation = await validateBody(request, updateSubscriptionSchema)
  if (!validation.success) return validation.response

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (!['admin', 'manager'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const blocked = await applyRateLimit(updateLimiter, user.id)
  if (blocked) return blocked

  const { subscription_status, notes } = validation.data

  const { data: current } = await supabase
    .from('fund_subscriptions')
    .select('id, subscription_status, reservation_status, investor_id, fund_id, commitment_amount')
    .eq('id', id)
    .single()

  if (!current) return NextResponse.json({ error: 'Subscription not found' }, { status: 404 })

  const updates: Record<string, unknown> = {
    subscription_status,
    updated_at: new Date().toISOString(),
  }

  if (notes) updates.notes = notes

  // On approval: confirm the FCFS reservation
  if (subscription_status === 'approved') {
    updates.reservation_status = 'confirmed'
    updates.confirmed_at = new Date().toISOString()
  }

  // On rejection/cancellation: release the reservation
  if (['rejected', 'closed'].includes(subscription_status)) {
    updates.reservation_status = 'cancelled'
  }

  const { data: updated, error } = await supabase
    .from('fund_subscriptions')
    .update(updates)
    .eq('id', id)
    .select('id, subscription_status, reservation_status')
    .single()

  if (error || !updated) {
    return NextResponse.json({ error: error?.message ?? 'Update failed' }, { status: 500 })
  }

  emitAuditEvent({
    actorProfileId: user.id,
    eventType:      'subscription_action',
    entityType:     'subscription',
    entityId:       id,
    oldValue:       { subscription_status: current.subscription_status },
    newValue:       { subscription_status },
    eventPayload:   { fund_id: current.fund_id, commitment_amount: current.commitment_amount },
  })

  return NextResponse.json({ success: true, subscription: updated })
}
