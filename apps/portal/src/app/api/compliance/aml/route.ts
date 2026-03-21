import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserRole } from '@/lib/auth/roles'
import { initiateAmlSchema } from '@/lib/validation/schemas'
import { complianceLimiter } from '@/lib/rate-limit/index'
import { applyRateLimit } from '@/lib/rate-limit/apply'
import { emitAuditEvent } from '@/lib/audit/emit'
import { emitNotification } from '@/lib/notifications/emit'
import { screenOfacSdn } from '@/lib/aml/ofac'

// POST — admin or manager runs AML/OFAC screening for an investor
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (!['admin', 'manager'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const blocked = await applyRateLimit(complianceLimiter, user.id)
  if (blocked) return blocked

  const body = await request.json().catch(() => null)
  const parsed = initiateAmlSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }

  const { investor_id, dob } = parsed.data
  const adminClient = createAdminClient()

  // Fetch investor + profile for full name
  const { data: investor } = await adminClient
    .from('investors')
    .select('id, profiles ( full_name )')
    .eq('id', investor_id)
    .maybeSingle()

  if (!investor) return NextResponse.json({ error: 'Investor not found' }, { status: 404 })

  const profile = Array.isArray(investor.profiles) ? investor.profiles[0] : investor.profiles
  const fullName: string = (profile as { full_name: string } | null)?.full_name ?? ''

  // Insert a pending AML screening record
  const { data: amlRecord, error: insertError } = await adminClient
    .from('aml_screenings')
    .insert({
      entity_type:    'investor',
      entity_id:      investor_id,
      provider:       'ofac_sdn',
      screening_type: 'ofac',
      status:         'pending',
      created_by:     user.id,
    })
    .select('id')
    .single()

  if (insertError || !amlRecord) {
    return NextResponse.json({ error: 'Failed to create AML screening record' }, { status: 500 })
  }

  // Run OFAC SDN screening
  const result = await screenOfacSdn({
    name:       fullName,
    dob:        dob,
    entityType: 'individual',
  })

  // Map result status to the DB enum values
  let screeningStatus: 'clear' | 'match' | 'pending'
  if (result.status === 'clear') {
    screeningStatus = 'clear'
  } else if (result.status === 'match') {
    screeningStatus = 'match'
  } else {
    // 'error' — leave as pending for manual review
    screeningStatus = 'pending'
  }

  // Update AML screening record with result
  await adminClient
    .from('aml_screenings')
    .update({
      status:       screeningStatus,
      result_json:  result.rawResult,
      match_details: result.matchDetails,
      updated_at:   new Date().toISOString(),
    })
    .eq('id', amlRecord.id)

  // Sync investor aml_status
  let investorAmlStatus: string
  if (result.status === 'clear') {
    investorAmlStatus = 'approved'
  } else if (result.status === 'match') {
    investorAmlStatus = 'failed'
  } else {
    investorAmlStatus = 'pending'
  }

  await adminClient
    .from('investors')
    .update({ aml_status: investorAmlStatus, updated_at: new Date().toISOString() })
    .eq('id', investor_id)

  void emitAuditEvent({
    actorProfileId: user.id,
    eventType:      'aml_screened',
    entityType:     'investor',
    entityId:       investor_id,
    newValue:       { status: result.status, score: result.score },
  })

  // If there is a match, notify all admin users
  if (result.status === 'match') {
    const { data: adminProfiles } = await adminClient
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin')

    if (adminProfiles && adminProfiles.length > 0) {
      for (const adminProfile of adminProfiles) {
        void emitNotification({
          recipientProfileId: adminProfile.user_id,
          subject:            'AML match detected',
          message:            `AML match found for investor ${fullName}. Review required.`,
          linkUrl:            `/dashboard/admin/investors/${investor_id}`,
        })
      }
    }
  }

  return NextResponse.json({
    success:      true,
    status:       result.status,
    score:        result.score,
    matchDetails: result.matchDetails,
  })
}
