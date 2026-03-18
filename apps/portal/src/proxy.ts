import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { canAccess, getDefaultRoute, type UserRole } from '@/lib/auth/roles'

export async function proxy(request: NextRequest) {
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

  const { pathname } = request.nextUrl
  const isProtected = pathname.startsWith('/dashboard')
  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/signup')

  // Unauthenticated user trying to access protected route
  if (isProtected && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Authenticated user trying to access auth routes — redirect to their dashboard
  if (isAuthRoute && user) {
    const role = (user.user_metadata?.role ?? 'borrower') as UserRole
    return NextResponse.redirect(new URL(getDefaultRoute(role), request.url))
  }

  // Authenticated user trying to access a route their role doesn't allow
  if (isProtected && user) {
    const role = (user.user_metadata?.role ?? 'borrower') as UserRole
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
