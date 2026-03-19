'use client'

// Handles the implicit-flow (hash fragment) redirect from Supabase invite emails.
// Supabase sends invite tokens as #access_token=...&refresh_token=... in the URL hash.
// Hash fragments are browser-only — they never reach the server — so a client
// component is required to read them and establish the session via setSession().

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AuthConfirmPage() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()

    const hash = window.location.hash.substring(1)
    const params = new URLSearchParams(hash)
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    const type = params.get('type')

    if (!accessToken || !refreshToken) {
      router.replace('/login?error=invite_expired')
      return
    }

    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        if (error) {
          router.replace('/login?error=invite_expired')
          return
        }

        // Invite flow — user must set a password before accessing the portal
        if (type === 'invite') {
          router.replace('/set-password')
          return
        }

        // Recovery flow (password reset) — also goes to set-password
        if (type === 'recovery') {
          router.replace('/set-password')
          return
        }

        // Any other type — go to root and let middleware route by role
        router.replace('/dashboard')
      })
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-sm text-gray-500">Completing sign in…</p>
    </div>
  )
}
