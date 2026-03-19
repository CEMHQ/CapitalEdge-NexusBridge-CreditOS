import 'server-only'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ApplicationSnapshot {
  requested_amount:       number
  requested_term_months:  number
  loan_purpose:           string
  current_value:          number | null
  arv_value:              number | null
  purchase_price:         number | null
  requested_ltv:          number | null
  requested_ltc:          number | null
  requested_dscr:         number | null
  property_type:          string
  occupancy_type:         string
  kyc_status:             string
  aml_status:             string
}

export type RiskSeverity = 'low' | 'medium' | 'high' | 'critical'

export interface RiskFlagResult {
  flag_type:   string
  severity:    RiskSeverity
  description: string
  source:      'system'
}

export interface RulesEngineResult {
  flags:             RiskFlagResult[]
  risk_score:        number   // 0–100 (higher = riskier)
  recommendation:    'approve' | 'conditional' | 'decline' | 'review'
  blocking_flags:    number
}

// ─── Thresholds ───────────────────────────────────────────────────────────────

const MAX_LTV         = 0.75   // 75%
const WARN_LTV        = 0.65   // flag if > 65%
const MAX_LTC         = 0.85   // 85%
const WARN_LTC        = 0.75
const MIN_LOAN        = 25_000
const MAX_LOAN        = 10_000_000
const MAX_TERM_MONTHS = 24

// ─── Pure rule functions ───────────────────────────────────────────────────────

function checkLtv(snap: ApplicationSnapshot): RiskFlagResult[] {
  const flags: RiskFlagResult[] = []
  const ltv = snap.requested_ltv ?? computeLtv(snap)
  if (ltv === null) {
    flags.push({
      flag_type:   'missing_ltv',
      severity:    'medium',
      description: 'LTV could not be calculated — current_value or requested_amount is missing.',
      source:      'system',
    })
    return flags
  }
  if (ltv > MAX_LTV) {
    flags.push({
      flag_type:   'ltv_exceeded',
      severity:    'critical',
      description: `LTV of ${(ltv * 100).toFixed(1)}% exceeds the maximum allowed 75%.`,
      source:      'system',
    })
  } else if (ltv > WARN_LTV) {
    flags.push({
      flag_type:   'ltv_elevated',
      severity:    'medium',
      description: `LTV of ${(ltv * 100).toFixed(1)}% is above the 65% guideline — additional scrutiny warranted.`,
      source:      'system',
    })
  }
  return flags
}

function checkLtc(snap: ApplicationSnapshot): RiskFlagResult[] {
  const flags: RiskFlagResult[] = []
  const ltc = snap.requested_ltc ?? computeLtc(snap)
  if (ltc === null) return flags
  if (ltc > MAX_LTC) {
    flags.push({
      flag_type:   'ltc_exceeded',
      severity:    'high',
      description: `LTC of ${(ltc * 100).toFixed(1)}% exceeds the maximum allowed 85%.`,
      source:      'system',
    })
  } else if (ltc > WARN_LTC) {
    flags.push({
      flag_type:   'ltc_elevated',
      severity:    'medium',
      description: `LTC of ${(ltc * 100).toFixed(1)}% is above the 75% guideline.`,
      source:      'system',
    })
  }
  return flags
}

function checkLoanAmount(snap: ApplicationSnapshot): RiskFlagResult[] {
  const flags: RiskFlagResult[] = []
  if (snap.requested_amount < MIN_LOAN) {
    flags.push({
      flag_type:   'loan_below_minimum',
      severity:    'critical',
      description: `Requested amount $${snap.requested_amount.toLocaleString()} is below the $25,000 minimum.`,
      source:      'system',
    })
  }
  if (snap.requested_amount > MAX_LOAN) {
    flags.push({
      flag_type:   'loan_above_maximum',
      severity:    'critical',
      description: `Requested amount $${snap.requested_amount.toLocaleString()} exceeds the $10,000,000 maximum.`,
      source:      'system',
    })
  }
  return flags
}

function checkTerm(snap: ApplicationSnapshot): RiskFlagResult[] {
  const flags: RiskFlagResult[] = []
  if (snap.requested_term_months > MAX_TERM_MONTHS) {
    flags.push({
      flag_type:   'term_exceeds_policy',
      severity:    'high',
      description: `Requested term of ${snap.requested_term_months} months exceeds the typical 24-month bridge loan maximum.`,
      source:      'system',
    })
  }
  return flags
}

function checkKycAml(snap: ApplicationSnapshot): RiskFlagResult[] {
  const flags: RiskFlagResult[] = []
  if (snap.kyc_status !== 'verified') {
    flags.push({
      flag_type:   'kyc_not_verified',
      severity:    'critical',
      description: `Borrower KYC status is "${snap.kyc_status}" — must be verified before approval.`,
      source:      'system',
    })
  }
  if (snap.aml_status === 'flagged') {
    flags.push({
      flag_type:   'aml_flagged',
      severity:    'critical',
      description: 'Borrower has an active AML flag — compliance review required.',
      source:      'system',
    })
  }
  return flags
}

function checkPropertyType(snap: ApplicationSnapshot): RiskFlagResult[] {
  const flags: RiskFlagResult[] = []
  if (snap.property_type === 'land') {
    flags.push({
      flag_type:   'land_collateral',
      severity:    'high',
      description: 'Land-only collateral carries elevated risk — no income or improvement value.',
      source:      'system',
    })
  }
  if (snap.property_type === 'commercial') {
    flags.push({
      flag_type:   'commercial_collateral',
      severity:    'medium',
      description: 'Commercial collateral requires additional appraisal and insurance documentation.',
      source:      'system',
    })
  }
  return flags
}

function checkValuation(snap: ApplicationSnapshot): RiskFlagResult[] {
  const flags: RiskFlagResult[] = []
  if (snap.arv_value && snap.current_value) {
    const uplift = (snap.arv_value - snap.current_value) / snap.current_value
    if (uplift > 0.50) {
      flags.push({
        flag_type:   'arv_uplift_high',
        severity:    'medium',
        description: `ARV implies ${(uplift * 100).toFixed(0)}% value uplift over current value — verify with independent appraisal.`,
        source:      'system',
      })
    }
  }
  return flags
}

// ─── Computed metrics ─────────────────────────────────────────────────────────

function computeLtv(snap: ApplicationSnapshot): number | null {
  if (!snap.current_value || snap.current_value === 0) return null
  return snap.requested_amount / snap.current_value
}

function computeLtc(snap: ApplicationSnapshot): number | null {
  if (!snap.purchase_price || snap.purchase_price === 0) return null
  return snap.requested_amount / snap.purchase_price
}

// ─── Severity weights for score ───────────────────────────────────────────────

const SEVERITY_WEIGHT: Record<RiskSeverity, number> = {
  low:      5,
  medium:   15,
  high:     30,
  critical: 50,
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export function runRulesEngine(snap: ApplicationSnapshot): RulesEngineResult {
  const flags: RiskFlagResult[] = [
    ...checkLtv(snap),
    ...checkLtc(snap),
    ...checkLoanAmount(snap),
    ...checkTerm(snap),
    ...checkKycAml(snap),
    ...checkPropertyType(snap),
    ...checkValuation(snap),
  ]

  const rawScore = flags.reduce((sum, f) => sum + SEVERITY_WEIGHT[f.severity], 0)
  const risk_score = Math.min(100, rawScore)

  const blockingFlags = flags.filter((f) => f.severity === 'critical').length

  let recommendation: RulesEngineResult['recommendation']
  if (blockingFlags > 0) {
    recommendation = 'decline'
  } else if (risk_score >= 45) {
    recommendation = 'review'
  } else if (risk_score >= 20) {
    recommendation = 'conditional'
  } else {
    recommendation = 'approve'
  }

  return {
    flags,
    risk_score,
    recommendation,
    blocking_flags: blockingFlags,
  }
}
