import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserRole } from '@/lib/auth/roles'
import { initiateKycSchema } from '@/lib/validation/schemas'
import { complianceLimiter } from '@/lib/rate-limit/index'
import { applyRateLimit } from '@/lib/rate-limit/apply'
import { emitAuditEvent } from '@/lib/audit/emit'
import { createPersonaInquiry } from '@/lib/kyc/persona'

// POST — admin, manager, or investor initiates KYC for an investor
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (!['admin', 'manager', 'investor'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const blocked = await applyRateLimit(complianceLimiter, user.id)
  if (blocked) return blocked

  const body = await request.json().catch(() => null)
  const parsed = initiateKycSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }

  const { investor_id } = parsed.data
  const adminClient = createAdminClient()

  // Investors may only initiate KYC for their own record
  if (role === 'investor') {
    const { data: ownInvestor } = await supabase
      .from('investors')
      .select('id')
      .eq('profile_id', user.id)
      .maybeSingle()

    if (!ownInvestor || ownInvestor.id !== investor_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  // Fetch investor + profile for email and full name
  const { data: investor } = await adminClient
    .from('investors')
    .select('id, profiles ( email, full_name )')
    .eq('id', investor_id)
    .maybeSingle()

  if (!investor) return NextResponse.json({ error: 'Investor not found' }, { status: 404 })

  const profile = Array.isArray(investor.profiles) ? investor.profiles[0] : investor.profiles
  const email: string = (profile as { email: string; full_name: string } | null)?.email ?? ''
  const fullName: string = (profile as { email: string; full_name: string } | null)?.full_name ?? ''

  // Guard: do not re-initiate if KYC is already verified
  const { data: existingVerification } = await adminClient
    .from('kyc_verifications')
    .select('id, status')
    .eq('entity_type', 'investor')
    .eq('entity_id', investor_id)
    .neq('status', 'failed')
    .maybeSingle()

  if (existingVerification?.status === 'verified') {
    return NextResponse.json({ error: 'KYC already verified' }, { status: 409 })
  }

  // Insert a pending KYC verification record
  const { data: kycRecord, error: insertError } = await adminClient
    .from('kyc_verifications')
    .insert({
      entity_type:       'investor',
      entity_id:         investor_id,
      provider:          'persona',
      verification_type: 'identity',
      status:            'pending',
      created_by:        user.id,
    })
    .select('id')
    .single()

  if (insertError || !kycRecord) {
    return NextResponse.json({ error: 'Failed to create KYC record' }, { status: 500 })
  }

  // Attempt to create Persona inquiry (skip if API key not configured)
  const personaApiKey = process.env.PERSONA_API_KEY

  if (!personaApiKey) {
    // Manual / sandbox mode — return without calling Persona
    void emitAuditEvent({
      actorProfileId: user.id,
      eventType:      'kyc_initiated',
      entityType:     'investor',
      entityId:       investor_id,
      newValue:       { kycId: kycRecord.id, manual: true },
    })
    return NextResponse.json({ success: true, inquiryUrl: null, kycId: kycRecord.id, manual: true })
  }

  let inquiryUrl: string
  try {
    const result = await createPersonaInquiry({
      investorId:  investor_id,
      email,
      fullName,
      referenceId: kycRecord.id,
    })

    // Persist the Persona inquiry ID back on the record
    await adminClient
      .from('kyc_verifications')
      .update({
        provider_reference_id: result.inquiryId,
        updated_at:            new Date().toISOString(),
      })
      .eq('id', kycRecord.id)

    inquiryUrl = result.inquiryUrl
  } catch (err) {
    console.error('[kyc] Persona inquiry creation failed:', err)
    return NextResponse.json({ error: 'Failed to initiate identity verification' }, { status: 502 })
  }

  // Mark investor kyc_status as in_progress
  await adminClient
    .from('investors')
    .update({ kyc_status: 'in_progress', updated_at: new Date().toISOString() })
    .eq('id', investor_id)

  void emitAuditEvent({
    actorProfileId: user.id,
    eventType:      'kyc_initiated',
    entityType:     'investor',
    entityId:       investor_id,
    newValue:       { kycId: kycRecord.id },
  })

  return NextResponse.json({ success: true, inquiryUrl, kycId: kycRecord.id })
}
