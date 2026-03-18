import { NextResponse } from 'next/server'
import type { Ratelimit } from '@upstash/ratelimit'

// Checks a rate limiter for the given identifier.
// Returns a 429 response if the limit is exceeded, null if the request is allowed.
// Usage: const blocked = await applyRateLimit(limiter, identifier)
//        if (blocked) return blocked
export async function applyRateLimit(
  limiter: Ratelimit,
  identifier: string
): Promise<NextResponse | null> {
  const { success, reset } = await limiter.limit(identifier)

  if (!success) {
    const retryAfterSeconds = Math.ceil((reset - Date.now()) / 1000)
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: { 'Retry-After': String(retryAfterSeconds) },
      }
    )
  }

  return null
}

// Extracts the real client IP from a request, accounting for Vercel's proxy headers.
export function getClientIp(request: Request): string {
  const forwarded = (request as Request & { headers: Headers }).headers.get('x-forwarded-for')
  return forwarded?.split(',')[0]?.trim() ?? 'unknown'
}
