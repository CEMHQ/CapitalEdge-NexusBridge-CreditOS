import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserRole } from '@/lib/auth/roles'
import { validateBody } from '@/lib/validation/validate'
import { createOfferingSchema } from '@/lib/validation/schemas'
import { offeringsLimiter } from '@/lib/rate-limit/index'
import { applyRateLimit } from '@/lib/rate-limit/apply'
import { emitAuditEvent } from '@/lib/audit/emit'

/**
 * GET /api/admin/offerings
 *
 * Returns all offerings (any status) with fund name and document count.
 * Admin and manager only.
 */
export async function GET(_request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (!['admin', 'manager'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const blocked = await applyRateLimit(offeringsLimiter, user.id)
  if (blocked) return blocked

  const adminClient = createAdminClient()

  const { data: offerings, error } = await adminClient
    .from('offerings')
    .select(`
      id, offering_type, offering_status, title, description,
      max_offering_amount, min_investment, max_investment,
      per_share_price, shares_offered,
      sec_file_number, qualification_date,
      offering_open_date, offering_close_date,
      jurisdiction_restrictions, created_at, updated_at,
      funds ( id, fund_name ),
      offering_documents ( id )
    `)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Attach document count for list view
  const result = (offerings ?? []).map(o => ({
    ...o,
    document_count: Array.isArray((o as unknown as { offering_documents: unknown[] }).offering_documents)
      ? (o as unknown as { offering_documents: unknown[] }).offering_documents.length
      : 0,
  }))

  return NextResponse.json({ offerings: result })
}

/**
 * POST /api/admin/offerings
 *
 * Creates a new offering (status defaults to 'draft').
 * Admin only.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const blocked = await applyRateLimit(offeringsLimiter, user.id)
  if (blocked) return blocked

  const validation = await validateBody(request, createOfferingSchema)
  if (!validation.success) return validation.response

  const adminClient = createAdminClient()

  const { data: offering, error } = await adminClient
    .from('offerings')
    .insert({
      ...validation.data,
      offering_status: 'draft',
      created_by: user.id,
    })
    .select('id, title, offering_type, offering_status')
    .single()

  if (error || !offering) {
    return NextResponse.json({ error: error?.message ?? 'Failed to create offering' }, { status: 500 })
  }

  emitAuditEvent({
    actorProfileId: user.id,
    eventType: 'offering_created',
    entityType: 'offering',
    entityId: offering.id,
    newValue: { title: offering.title, offering_type: offering.offering_type },
  })

  return NextResponse.json({ offering }, { status: 201 })
}
