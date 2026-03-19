import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// ─── Public endpoint limiters (IP-based) ─────────────────────────────────────
// Applied in proxy.ts before Supabase is ever called.

// Signup: 5 attempts per IP per 10 minutes
export const signupLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '10 m'),
  prefix: 'rl:signup',
})

// Forgot password: 3 attempts per IP per 15 minutes
export const forgotPasswordLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, '15 m'),
  prefix: 'rl:forgot-password',
})

// ─── Authenticated endpoint limiters (user ID-based) ─────────────────────────
// Applied inside API route handlers after auth check.

// Submit application: 5 per user per hour
export const submitApplicationLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(5, '1 h'),
  prefix: 'rl:submit-application',
})

// Invite user: 20 per user per hour
export const inviteLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(20, '1 h'),
  prefix: 'rl:invite',
})

// Status / metrics updates: 60 per user per hour
export const updateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(60, '1 h'),
  prefix: 'rl:update',
})

// ─── Phase 3 limiters ─────────────────────────────────────────────────────────

// Create loan (from approved application): 10 per user per hour
export const createLoanLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(10, '1 h'),
  prefix: 'rl:create-loan',
})

// Record payment: 30 per user per hour
export const recordPaymentLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(30, '1 h'),
  prefix: 'rl:record-payment',
})

// Underwriting decisions: 20 per user per hour
export const underwritingLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(20, '1 h'),
  prefix: 'rl:underwriting',
})

// Document upload URL requests: 30 per user per hour
export const documentUploadLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(30, '1 h'),
  prefix: 'rl:document-upload',
})

// Subscription creation: 5 per user per hour
export const subscriptionLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(5, '1 h'),
  prefix: 'rl:subscription',
})
