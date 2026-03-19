import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserRole } from '@/lib/auth/roles'
import { deleteUserLimiter, updateLimiter } from '@/lib/rate-limit/index'
import { applyRateLimit } from '@/lib/rate-limit/apply'
import { emitAuditEvent } from '@/lib/audit/emit'

const VALID_ROLES = ['admin', 'manager', 'underwriter', 'servicing', 'investor', 'borrower'] as const
const patchUserSchema = z.object({
  role: z.enum(VALID_ROLES).optional(),
  status: z.enum(['active', 'inactive', 'suspended']).optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const callerRole = await getUserRole(supabase, user.id)
  if (callerRole !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const blocked = await applyRateLimit(updateLimiter, user.id)
  if (blocked) return blocked

  const body = await request.json().catch(() => null)
  const parsed = patchUserSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

  const { role, status } = parsed.data
  const adminClient = createAdminClient()

  if (role !== undefined) {
    // Upsert into user_roles
    const { error: roleError } = await adminClient
      .from('user_roles')
      .upsert({ user_id: id, role }, { onConflict: 'user_id' })

    if (roleError) return NextResponse.json({ error: roleError.message }, { status: 500 })
  }

  if (status !== undefined) {
    const { error: statusError } = await adminClient
      .from('profiles')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (statusError) return NextResponse.json({ error: statusError.message }, { status: 500 })
  }

  emitAuditEvent({
    actorProfileId: user.id,
    eventType: 'user_updated',
    entityType: 'user',
    entityId: id,
    eventPayload: { role, status },
  })

  return NextResponse.json({ success: true })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // 1. Auth: admin only
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const role = await getUserRole(supabase, user.id)
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Rate limit
  const blocked = await applyRateLimit(deleteUserLimiter, user.id)
  if (blocked) return blocked

  // 2. Prevent self-deletion
  if (id === user.id) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // 3. Get borrower records for this user
  const { data: borrowers, error: borrowersError } = await adminClient
    .from('borrowers')
    .select('id')
    .eq('profile_id', id)

  if (borrowersError) {
    return NextResponse.json({ error: borrowersError.message }, { status: 500 })
  }

  const borrowerIds = (borrowers ?? []).map((b) => b.id)

  // 4. Handle borrower-related cascades
  if (borrowerIds.length > 0) {
    // 4a. Get application IDs
    const { data: applications, error: appsError } = await adminClient
      .from('applications')
      .select('id')
      .in('borrower_id', borrowerIds)

    if (appsError) {
      return NextResponse.json({ error: appsError.message }, { status: 500 })
    }

    const appIds = (applications ?? []).map((a) => a.id)

    if (appIds.length > 0) {
      // Check for loans — block if any exist
      const { data: existingLoan, error: loanCheckError } = await adminClient
        .from('loans')
        .select('id')
        .in('application_id', appIds)
        .limit(1)
        .maybeSingle()

      if (loanCheckError) {
        return NextResponse.json({ error: loanCheckError.message }, { status: 500 })
      }

      if (existingLoan) {
        return NextResponse.json(
          { error: 'Cannot delete user — they have an active loan record. Close the loan first.' },
          { status: 409 }
        )
      }

      // Delete documents linked to applications
      const { error: appDocsError } = await adminClient
        .from('documents')
        .delete()
        .eq('owner_type', 'application')
        .in('owner_id', appIds)

      if (appDocsError) {
        return NextResponse.json({ error: appDocsError.message }, { status: 500 })
      }

      // Delete loan_requests
      const { error: lrError } = await adminClient
        .from('loan_requests')
        .delete()
        .in('application_id', appIds)

      if (lrError) {
        return NextResponse.json({ error: lrError.message }, { status: 500 })
      }

      // Delete properties
      const { error: propError } = await adminClient
        .from('properties')
        .delete()
        .in('application_id', appIds)

      if (propError) {
        return NextResponse.json({ error: propError.message }, { status: 500 })
      }

      // Delete applications (underwriting_cases cascade automatically)
      const { error: appDeleteError } = await adminClient
        .from('applications')
        .delete()
        .in('id', appIds)

      if (appDeleteError) {
        return NextResponse.json({ error: appDeleteError.message }, { status: 500 })
      }
    }

    // 4c. Delete borrower-level documents uploaded by this user
    const { error: borrowerDocsError } = await adminClient
      .from('documents')
      .delete()
      .eq('owner_type', 'borrower')
      .eq('uploaded_by', id)

    if (borrowerDocsError) {
      return NextResponse.json({ error: borrowerDocsError.message }, { status: 500 })
    }

    // 4d. Delete borrowers
    const { error: borrowerDeleteError } = await adminClient
      .from('borrowers')
      .delete()
      .in('id', borrowerIds)

    if (borrowerDeleteError) {
      return NextResponse.json({ error: borrowerDeleteError.message }, { status: 500 })
    }
  }

  // 5. Delete any remaining documents uploaded by this user
  const { error: remainingDocsError } = await adminClient
    .from('documents')
    .delete()
    .eq('uploaded_by', id)

  if (remainingDocsError) {
    return NextResponse.json({ error: remainingDocsError.message }, { status: 500 })
  }

  // 6. Nullify reviewed_by on any documents they reviewed
  const { error: nullifyError } = await adminClient
    .from('documents')
    .update({ reviewed_by: null, updated_at: new Date().toISOString() })
    .eq('reviewed_by', id)

  if (nullifyError) {
    return NextResponse.json({ error: nullifyError.message }, { status: 500 })
  }

  // 7. Nullify audit_events actor reference (FK blocks profile delete)
  await adminClient
    .from('audit_events')
    .update({ actor_profile_id: null })
    .eq('actor_profile_id', id)

  // 8. Delete profile (no FK cascade from auth.users)
  const { error: profileError } = await adminClient
    .from('profiles')
    .delete()
    .eq('id', id)

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  // 9. Delete auth user
  const { error: authError } = await adminClient.auth.admin.deleteUser(id)

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 })
  }

  // 9. Emit audit event (fire-and-forget)
  emitAuditEvent({
    actorProfileId: user.id,
    eventType: 'user_deleted',
    entityType: 'user',
    entityId: id,
    eventPayload: { action: 'user_deleted' },
  })

  return NextResponse.json({ success: true })
}
