import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserRole } from '@/lib/auth/roles'
import { workflowLimiter } from '@/lib/rate-limit/index'
import { applyRateLimit } from '@/lib/rate-limit/apply'
import { emitAuditEvent } from '@/lib/audit/emit'
import { patchWorkflowTriggerSchema } from '@/lib/validation/schemas'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const blocked = await applyRateLimit(workflowLimiter, user.id)
  if (blocked) return blocked

  const body = await request.json().catch(() => null)
  const parsed = patchWorkflowTriggerSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { data: existing } = await supabase
    .from('workflow_triggers')
    .select('name, is_active')
    .eq('id', id)
    .single()

  const { error } = await supabase
    .from('workflow_triggers')
    .update(parsed.data)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  void emitAuditEvent({
    actorProfileId: user.id,
    eventType: 'workflow_updated',
    entityType: 'workflow_trigger',
    entityId: id,
    oldValue: existing as Record<string, unknown>,
    newValue: parsed.data as Record<string, unknown>,
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
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await supabase
    .from('workflow_triggers')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  void emitAuditEvent({
    actorProfileId: user.id,
    eventType: 'workflow_deleted',
    entityType: 'workflow_trigger',
    entityId: id,
  })

  return NextResponse.json({ success: true })
}
