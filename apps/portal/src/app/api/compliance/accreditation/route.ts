import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserRole } from '@/lib/auth/roles'
import { submitAccreditationSchema } from '@/lib/validation/schemas'
import { complianceLimiter } from '@/lib/rate-limit/index'
import { applyRateLimit } from '@/lib/rate-limit/apply'
import { emitAuditEvent } from '@/lib/audit/emit'
import { emitNotification } from '@/lib/notifications/emit'

// GET — investor views their own accreditation records
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)

  if (role === 'investor') {
    const { data: investor } = await supabase
      .from('investors')
      .select('id')
      .eq('profile_id', user.id)
      .maybeSingle()

    if (!investor) return NextResponse.json({ error: 'Investor record not found' }, { status: 404 })

    const { data: records } = await supabase
      .from('accreditation_records')
      .select('id, verification_method, provider, status, verified_at, expires_at, reviewer_notes, reviewed_at, created_at')
      .eq('investor_id', investor.id)
      .order('created_at', { ascending: false })

    return NextResponse.json({ records: records ?? [] })
  }

  if (['admin', 'manager'].includes(role)) {
    const { searchParams } = new URL(request.url)
    const investorId = searchParams.get('investor_id')
    const status = searchParams.get('status')

    const adminClient = createAdminClient()
    let query = adminClient
      .from('accreditation_records')
      .select(`
        id, investor_id, verification_method, provider, status,
        verified_at, expires_at, reviewer_notes, reviewed_by, reviewed_at, created_at,
        investors ( profiles ( full_name, email ) )
      `)
      .order('created_at', { ascending: false })

    if (investorId) query = query.eq('investor_id', investorId)
    if (status) query = query.eq('status', status)

    const { data: records } = await query
    return NextResponse.json({ records: records ?? [] })
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// POST — investor submits an accreditation verification request
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== 'investor') {
    return NextResponse.json({ error: 'Only investors can submit accreditation records' }, { status: 403 })
  }

  const blocked = await applyRateLimit(complianceLimiter, user.id)
  if (blocked) return blocked

  const body = await request.json().catch(() => null)
  const parsed = submitAccreditationSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }

  const { verification_method, evidence_document_id, notes } = parsed.data

  const { data: investor } = await supabase
    .from('investors')
    .select('id')
    .eq('profile_id', user.id)
    .maybeSingle()

  if (!investor) return NextResponse.json({ error: 'Investor record not found' }, { status: 404 })

  // Check for an existing pending/under_review record (avoid duplicates)
  const { data: existing } = await supabase
    .from('accreditation_records')
    .select('id, status')
    .eq('investor_id', investor.id)
    .in('status', ['pending', 'under_review'])
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: `You already have a ${existing.status} accreditation request. Wait for it to be reviewed before submitting another.` },
      { status: 409 }
    )
  }

  const adminClient = createAdminClient()

  const { data: record, error } = await adminClient
    .from('accreditation_records')
    .insert({
      investor_id:          investor.id,
      verification_method,
      provider:             'manual',
      status:               'pending',
      evidence_document_id: evidence_document_id ?? null,
      reviewer_notes:       notes ?? null,
      created_by:           user.id,
    })
    .select('id')
    .single()

  if (error || !record) {
    return NextResponse.json({ error: 'Failed to create accreditation record' }, { status: 500 })
  }

  // Update investor onboarding_status to in_progress if still pending
  await adminClient
    .from('investors')
    .update({ onboarding_status: 'in_progress', updated_at: new Date().toISOString() })
    .eq('id', investor.id)
    .eq('onboarding_status', 'pending')

  void emitAuditEvent({
    actorProfileId: user.id,
    eventType:      'accreditation_submitted',
    entityType:     'investor',
    entityId:       investor.id,
    newValue:       { verification_method, record_id: record.id },
  })

  // Notify admin team
  void emitNotification({
    recipientProfileId: user.id,
    subject:            'Accreditation request submitted',
    message:            'Your accreditation verification request has been submitted. Our compliance team will review it within 1–2 business days.',
    linkUrl:            '/dashboard/investor/compliance',
  })

  return NextResponse.json({ id: record.id }, { status: 201 })
}
