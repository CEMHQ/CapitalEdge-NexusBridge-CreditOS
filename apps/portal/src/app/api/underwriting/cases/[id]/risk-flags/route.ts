import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getUserRole } from '@/lib/auth/roles'
import { validateBody } from '@/lib/validation/validate'
import { underwritingLimiter } from '@/lib/rate-limit/index'
import { applyRateLimit } from '@/lib/rate-limit/apply'

const addRiskFlagSchema = z.object({
  flag_type:   z.string().trim().min(2).max(100),
  severity:    z.enum(['low', 'medium', 'high', 'critical']),
  description: z.string().trim().min(5).max(1000),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const validation = await validateBody(request, addRiskFlagSchema)
  if (!validation.success) return validation.response

  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (!['admin', 'manager', 'underwriter'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const blocked = await applyRateLimit(underwritingLimiter, user.id)
  if (blocked) return blocked

  const { error } = await supabase
    .from('risk_flags')
    .insert({
      case_id:     id,
      flag_type:   validation.data.flag_type,
      severity:    validation.data.severity,
      description: validation.data.description,
      source:      'manual',
      created_by:  user.id,
    })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
