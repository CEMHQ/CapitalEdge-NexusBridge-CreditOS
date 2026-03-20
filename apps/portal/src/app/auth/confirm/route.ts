import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { EmailOtpType } from '@supabase/supabase-js'

// Handles token_hash-based email confirmation (invite, recovery, signup).
// Email template must use {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite
// Supabase email templates send {{ .TokenHash }} as a query param — unlike the
// legacy implicit flow, the raw JWT is never exposed in the URL or browser history.
// verifyOtp() validates the hash server-side and establishes a session via cookies.

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null

  if (token_hash && type) {
    const cookieStore = await cookies()

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { error } = await supabase.auth.verifyOtp({ token_hash, type })

    if (!error) {
      // Invite and password recovery both require setting a password first
      if (type === 'invite' || type === 'recovery') {
        return NextResponse.redirect(`${origin}/set-password`)
      }
      // Email confirmation (signup) — let middleware route by role
      return NextResponse.redirect(`${origin}/dashboard`)
    }
  }

  return NextResponse.redirect(`${origin}/invite-expired`)
}
