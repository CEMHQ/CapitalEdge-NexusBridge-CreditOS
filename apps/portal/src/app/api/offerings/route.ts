import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserRole } from '@/lib/auth/roles'
import { updateLimiter } from '@/lib/rate-limit/index'
import { applyRateLimit } from '@/lib/rate-limit/apply'
import { computeRegALimit, getRollingRegACommitments } from '@/lib/compliance/reg-a'

/**
 * GET /api/offerings
 *
 * Returns active offerings visible to the authenticated investor, filtered by
 * jurisdiction restrictions and enriched with the investor's current Reg A
 * capacity for any reg_a-type offerings.
 *
 * Accreditation-status-agnostic: all authenticated investors can browse
 * offerings; the subscription flow enforces eligibility gates.
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== 'investor') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const blocked = await applyRateLimit(updateLimiter, user.id)
  if (blocked) return blocked

  // Fetch investor suitability fields for jurisdiction screening + Reg A capacity
  const { data: investor } = await supabase
    .from('investors')
    .select('id, accreditation_status, annual_income, net_worth')
    .eq('profile_id', user.id)
    .maybeSingle()

  if (!investor) return NextResponse.json({ error: 'Investor record not found' }, { status: 404 })

  // RLS already filters to offering_status = 'active', so no extra filter needed
  const { data: offerings, error } = await supabase
    .from('offerings')
    .select(`
      id, title, description, offering_type,
      max_offering_amount, min_investment, max_investment, per_share_price, shares_offered,
      sec_file_number, qualification_date,
      offering_open_date, offering_close_date,
      jurisdiction_restrictions,
      funds ( id, fund_name )
    `)
    .order('offering_open_date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Investor's jurisdiction (new column — may not be in generated types)
  const investorJurisdiction = (investor as Record<string, unknown>).jurisdiction as string | null ?? null

  // Reg A capacity (computed once, reused for all reg_a offerings in the list)
  const regALimit = computeRegALimit(
    investor.accreditation_status,
    investor.annual_income ?? null,
    investor.net_worth ?? null,
  )
  const regAUsed = regALimit !== null ? await getRollingRegACommitments(supabase, investor.id) : 0

  // Filter and enrich
  const result = (offerings ?? [])
    .filter(o => {
      // Jurisdiction gate: skip if investor's state is in the restricted list
      if (!investorJurisdiction) return true // no jurisdiction on file → show all, gate at subscribe
      const restricted = Array.isArray(o.jurisdiction_restrictions) ? o.jurisdiction_restrictions as string[] : []
      return !restricted.includes(investorJurisdiction)
    })
    .map(o => ({
      ...o,
      // Attach Reg A capacity for reg_a-type offerings only
      reg_a_capacity: o.offering_type === 'reg_a'
        ? {
            limit:     regALimit,
            used:      regAUsed,
            remaining: regALimit !== null ? Math.max(0, regALimit - regAUsed) : null,
          }
        : null,
    }))

  return NextResponse.json({ offerings: result })
}
