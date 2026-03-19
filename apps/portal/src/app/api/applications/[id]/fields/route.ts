import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserRole } from '@/lib/auth/roles'
import { validateBody } from '@/lib/validation/validate'
import { editApplicationFieldsSchema } from '@/lib/validation/schemas'
import { updateLimiter } from '@/lib/rate-limit/index'
import { applyRateLimit } from '@/lib/rate-limit/apply'
import { emitAuditEvent } from '@/lib/audit/emit'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const validation = await validateBody(request, editApplicationFieldsSchema)
  if (!validation.success) return validation.response

  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (!['admin', 'manager'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const blocked = await applyRateLimit(updateLimiter, user.id)
  if (blocked) return blocked

  const { loan_purpose, requested_amount, requested_term_months, exit_strategy, property } = validation.data
  const adminClient = createAdminClient()

  // Verify application exists
  const { data: existing } = await adminClient
    .from('applications')
    .select('id, application_number')
    .eq('id', id)
    .single()

  if (!existing) return NextResponse.json({ error: 'Application not found' }, { status: 404 })

  // Update application core fields
  const { error: appError } = await adminClient
    .from('applications')
    .update({
      loan_purpose,
      requested_amount,
      requested_term_months,
      exit_strategy,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (appError) return NextResponse.json({ error: appError.message }, { status: 500 })

  // Update property (upsert on application_id)
  const { error: propError } = await adminClient
    .from('properties')
    .update({
      address_line_1:  property.address_line_1,
      address_line_2:  property.address_line_2 ?? null,
      city:            property.city,
      state:           property.state,
      postal_code:     property.postal_code,
      property_type:   property.property_type,
      occupancy_type:  property.occupancy_type,
      current_value:   property.current_value ?? null,
      arv_value:       property.arv_value ?? null,
      purchase_price:  property.purchase_price ?? null,
      updated_at:      new Date().toISOString(),
    })
    .eq('application_id', id)

  if (propError) return NextResponse.json({ error: propError.message }, { status: 500 })

  emitAuditEvent({
    actorProfileId: user.id,
    eventType:      'application_status_change',
    entityType:     'application',
    entityId:       id,
    eventPayload:   { action: 'fields_updated', loan_purpose, requested_amount, requested_term_months },
  })

  return NextResponse.json({ success: true })
}
