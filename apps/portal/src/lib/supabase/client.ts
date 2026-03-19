import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // PKCE prevents authorization code interception attacks on magic links
        // and OAuth flows. The code verifier is stored in cookies (via @supabase/ssr)
        // and verified server-side during the /auth/callback exchange.
        flowType: 'pkce',
      },
    }
  )
}
