import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { canAccess, getDefaultRoute, type UserRole } from '@/lib/auth/roles'
import { signupLimiter, forgotPasswordLimiter } from '@/lib/rate-limit/index'
import { applyRateLimit, getClientIp } from '@/lib/rate-limit/apply'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── IP-based rate limiting for public endpoints ──────────────────────────
  // Check before Supabase is called — blocks abusive requests at the edge.
  if (pathname.startsWith('/signup') || pathname === '/api/auth/signup') {
    const ip = getClientIp(request)
    const blocked = await applyRateLimit(signupLimiter, ip)
    if (blocked) return blocked
  }

  if (pathname.startsWith('/forgot-password')) {
    const ip = getClientIp(request)
    const blocked = await applyRateLimit(forgotPasswordLimiter, ip)
    if (blocked) return blocked
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isProtected = pathname.startsWith('/dashboard')
  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/signup')

  // Unauthenticated user trying to access protected route
  if (isProtected && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Authenticated user — fetch role from DB (not JWT metadata, which can be spoofed)
  if (user && (isAuthRoute || isProtected)) {
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()
    const role = (roleData?.role ?? 'borrower') as UserRole

    // Authenticated user trying to access auth routes — redirect to their dashboard
    if (isAuthRoute) {
      return NextResponse.redirect(new URL(getDefaultRoute(role), request.url))
    }

    // Authenticated user trying to access a route their role doesn't allow
    if (!canAccess(role, pathname)) {
      return NextResponse.redirect(new URL(getDefaultRoute(role), request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
