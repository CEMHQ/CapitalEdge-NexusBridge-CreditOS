import { NextResponse } from 'next/server'

const PUBLIC_ROLES = ['borrower']

/**
 * Server-side guard: rejects any signup attempt with a role that is not
 * publicly allowed. Investor, admin, manager, underwriter, and servicing
 * accounts must be created via the admin invite flow.
 */
export async function POST(request: Request) {
  const body = await request.json()
  const role = body?.role ?? 'borrower'

  if (!PUBLIC_ROLES.includes(role)) {
    return NextResponse.json(
      { error: 'This role requires an invitation. Contact NexusBridge to request access.' },
      { status: 403 }
    )
  }

  return NextResponse.json({ ok: true })
}
