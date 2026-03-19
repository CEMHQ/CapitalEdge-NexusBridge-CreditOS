import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getUserRole } from '@/lib/auth/roles'
import { updateLimiter } from '@/lib/rate-limit/index'
import { applyRateLimit } from '@/lib/rate-limit/apply'

const patchTaskSchema = z.object({
  task_status:  z.enum(['open', 'in_progress', 'completed', 'cancelled']).optional(),
  priority:     z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  title:        z.string().trim().min(2).max(200).optional(),
  description:  z.string().trim().max(1000).optional(),
  due_date:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  assigned_to:  z.string().uuid().nullable().optional(),
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

  const blocked = await applyRateLimit(updateLimiter, user.id)
  if (blocked) return blocked

  const body = await request.json().catch(() => null)
  const parsed = patchTaskSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  // Non-admin/manager can only update task_status on tasks assigned to them
  if (!['admin', 'manager'].includes(role)) {
    const keys = Object.keys(parsed.data)
    const allowedKeys = ['task_status']
    if (keys.some((k) => !allowedKeys.includes(k))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    // Verify task is assigned to this user
    const { data: task } = await supabase
      .from('tasks')
      .select('assigned_to')
      .eq('id', id)
      .single()
    if (task?.assigned_to !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const updates: Record<string, unknown> = { ...parsed.data }
  if (parsed.data.task_status === 'completed') {
    updates.completed_at = new Date().toISOString()
  } else if (parsed.data.task_status) {
    updates.completed_at = null
  }

  const { error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

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
  if (!['admin', 'manager'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
