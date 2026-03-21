import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { computeRegALimit, getRollingRegACommitments } from '@/lib/compliance/reg-a'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Load investor record
  const { data: investor, error } = await supabase
    .from('investors')
    .select('id, accreditation_status, annual_income, net_worth')
    .eq('profile_id', user.id)
    .maybeSingle()

  if (error || !investor) {
    return NextResponse.json({ error: 'Investor record not found' }, { status: 404 })
  }

  const limit = computeRegALimit(
    investor.accreditation_status,
    investor.annual_income,
    investor.net_worth,
  )

  // Accredited — no Reg A limit
  if (limit === null) {
    return NextResponse.json({
      accredited: true,
      limit:      null,
      used:       0,
      remaining:  null,
    })
  }

  const used = await getRollingRegACommitments(supabase, investor.id)

  return NextResponse.json({
    accredited: false,
    limit,
    used,
    remaining: Math.max(0, limit - used),
  })
}
