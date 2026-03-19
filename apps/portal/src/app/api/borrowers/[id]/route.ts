import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserRole } from '@/lib/auth/roles'
import { emitAuditEvent } from '@/lib/audit/emit'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (!['admin', 'manager'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const adminClient = createAdminClient()

  // Block deletion if applications exist referencing this borrower
  const { data: existingApp } = await adminClient
    .from('applications')
    .select('id')
    .eq('borrower_id', id)
    .limit(1)
    .maybeSingle()

  if (existingApp) {
    return NextResponse.json(
      { error: 'Cannot delete a borrower with existing applications. Delete the applications first.' },
      { status: 409 }
    )
  }

  // Delete borrower-type documents
  const { error: docsError } = await adminClient
    .from('documents')
    .delete()
    .eq('owner_type', 'borrower')
    .eq('owner_id', id)

  if (docsError) {
    return NextResponse.json({ error: docsError.message }, { status: 500 })
  }

  // Delete borrower record
  const { error: borrowerError } = await adminClient
    .from('borrowers')
    .delete()
    .eq('id', id)

  if (borrowerError) {
    return NextResponse.json({ error: borrowerError.message }, { status: 500 })
  }

  emitAuditEvent({
    actorProfileId: user.id,
    eventType:      'application_status_change',
    entityType:     'user',
    entityId:       id,
    eventPayload:   { action: 'borrower_deleted' },
  })

  return NextResponse.json({ success: true })
}
