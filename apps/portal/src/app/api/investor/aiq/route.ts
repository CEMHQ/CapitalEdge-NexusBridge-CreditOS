import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserRole } from '@/lib/auth/roles'
import { validateBody } from '@/lib/validation/validate'
import { submitAiqSchema } from '@/lib/validation/schemas'
import { updateLimiter } from '@/lib/rate-limit/index'
import { applyRateLimit } from '@/lib/rate-limit/apply'
import { emitAuditEvent } from '@/lib/audit/emit'

// POST /api/investor/aiq
// Submits the Accredited Investor Questionnaire (AIQ) self-certification.
// Required for Reg D 506(c) subscriptions in addition to admin-verified accreditation.
// Sets aiq_self_certified_at + aiq_accreditation_basis on the investors record.
export async function POST(request: Request) {
  const validation = await validateBody(request, submitAiqSchema)
  if (!validation.success) return validation.response

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== 'investor') {
    return NextResponse.json({ error: 'Only investors can submit the AIQ' }, { status: 403 })
  }

  const blocked = await applyRateLimit(updateLimiter, user.id)
  if (blocked) return blocked

  const { accreditation_basis } = validation.data

  const { data: investor } = await supabase
    .from('investors')
    .select('id, accreditation_status, aiq_self_certified_at')
    .eq('profile_id', user.id)
    .single()

  if (!investor) {
    return NextResponse.json({ error: 'Investor record not found' }, { status: 404 })
  }

  // Only allow if investor has at least started accreditation verification
  if (investor.accreditation_status === 'pending' || investor.accreditation_status === 'not_started') {
    return NextResponse.json(
      { error: 'Please submit your accreditation documentation before completing the AIQ' },
      { status: 422 }
    )
  }

  const now = new Date().toISOString()
  const adminClient = createAdminClient()

  const { error } = await adminClient
    .from('investors')
    .update({
      aiq_self_certified_at:   now,
      aiq_accreditation_basis: accreditation_basis,
      updated_at:              now,
    })
    .eq('id', investor.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  emitAuditEvent({
    actorProfileId: user.id,
    eventType:      'aiq_submitted',
    entityType:     'investor',
    entityId:       investor.id,
    eventPayload: {
      accreditation_basis,
      aiq_self_certified_at: now,
    },
  })

  return NextResponse.json({ success: true })
}
