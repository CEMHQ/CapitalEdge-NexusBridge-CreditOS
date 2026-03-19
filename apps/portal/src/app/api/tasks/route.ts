import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getUserRole } from '@/lib/auth/roles'
import { updateLimiter } from '@/lib/rate-limit/index'
import { applyRateLimit } from '@/lib/rate-limit/apply'

const createTaskSchema = z.object({
  task_owner_type: z.enum(['application', 'loan', 'underwriting_case', 'investor']),
  task_owner_id:   z.string().uuid('Must be a valid UUID'),
  title:           z.string().trim().min(2).max(200),
  description:     z.string().trim().max(1000).optional(),
  priority:        z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  due_date:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  assigned_to:     z.string().uuid().optional(),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (!['admin', 'manager'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const blocked = await applyRateLimit(updateLimiter, user.id)
  if (blocked) return blocked

  const body = await request.json().catch(() => null)
  const parsed = createTaskSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 })
  }

  const { error, data } = await supabase
    .from('tasks')
    .insert({
      ...parsed.data,
      due_date:   parsed.data.due_date ?? null,
      assigned_to: parsed.data.assigned_to ?? null,
      created_by: user.id,
      task_status: 'open',
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, id: data.id }, { status: 201 })
}
