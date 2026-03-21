import 'server-only'
import { SupabaseClient } from '@supabase/supabase-js'

const REG_A_MIN_LIMIT = 2500 // SEC Tier 2 floor per rolling 12 months
const REG_A_INCOME_PCT = 0.10
const REG_A_NETWORTH_PCT = 0.10

/**
 * Compute the Reg A Tier 2 investment limit for an investor.
 *
 * SEC Rule 251(d)(2)(C): non-accredited investors may not purchase more than
 * the greater of 10% of annual income OR 10% of net worth in any 12 months,
 * subject to a $2,500 floor.
 *
 * Returns null when the investor is accredited — no limit applies.
 */
export function computeRegALimit(
  accreditationStatus: string,
  annualIncome: string | null,
  netWorth: string | null,
): number | null {
  // Accredited investors are exempt from the Reg A investment limit
  if (accreditationStatus === 'verified') return null

  const income  = annualIncome ? parseFloat(annualIncome)  : null
  const nw      = netWorth     ? parseFloat(netWorth)      : null

  const fromIncome  = income != null ? income  * REG_A_INCOME_PCT   : 0
  const fromNetWorth = nw    != null ? nw      * REG_A_NETWORTH_PCT : 0

  return Math.max(fromIncome, fromNetWorth, REG_A_MIN_LIMIT)
}

/**
 * Sum the investor's Reg A commitments over the rolling 12-month window.
 * Only counts subscriptions in active states (not cancelled/rejected).
 */
export async function getRollingRegACommitments(
  supabase: SupabaseClient,
  investorId: string,
): Promise<number> {
  const since = new Date()
  since.setFullYear(since.getFullYear() - 1)

  const { data, error } = await supabase
    .from('fund_subscriptions')
    .select('commitment_amount, funds!inner(offering_type)')
    .eq('investor_id', investorId)
    .eq('funds.offering_type', 'reg_a')
    .in('subscription_status', ['pending', 'confirmed', 'funded'])
    .gte('created_at', since.toISOString())

  if (error || !data) return 0

  return data.reduce((sum, row) => {
    const amt = parseFloat((row as { commitment_amount: string }).commitment_amount ?? '0')
    return sum + (isNaN(amt) ? 0 : amt)
  }, 0)
}

export interface RegACheckResult {
  allowed:    boolean
  limit:      number | null  // null = accredited, no limit
  used:       number
  remaining:  number | null  // null = accredited
  reason?:    string
}

/**
 * Full Reg A gate check.
 *
 * Returns { allowed: true } when:
 *   - investor is accredited (exempt), OR
 *   - rolling commitments + requested amount <= computed limit
 *
 * Returns { allowed: false, reason } when the limit would be exceeded.
 */
export async function checkRegALimit(
  supabase: SupabaseClient,
  investorId: string,
  accreditationStatus: string,
  annualIncome: string | null,
  netWorth: string | null,
  requestedAmount: number,
): Promise<RegACheckResult> {
  const limit = computeRegALimit(accreditationStatus, annualIncome, netWorth)

  // Accredited — no limit
  if (limit === null) {
    return { allowed: true, limit: null, used: 0, remaining: null }
  }

  const used      = await getRollingRegACommitments(supabase, investorId)
  const remaining = limit - used

  if (requestedAmount > remaining) {
    return {
      allowed:   false,
      limit,
      used,
      remaining: Math.max(0, remaining),
      reason:    `Subscription of $${requestedAmount.toLocaleString()} would exceed your Reg A annual investment limit. ` +
                 `Remaining capacity: $${Math.max(0, remaining).toLocaleString()}.`,
    }
  }

  return { allowed: true, limit, used, remaining }
}
