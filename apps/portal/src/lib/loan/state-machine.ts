// Loan lifecycle state machine — pure functions, zero side effects.
// Import this module anywhere; it has no DB or network dependencies.
//
// Two separate state flows:
//   1. Application status — tracks the loan application through origination
//   2. Loan status       — tracks the funded loan through its lifecycle
//
// Always call canTransition*() before executing a status change in an API route.

import type { UserRole } from '@/lib/auth/roles'

// ─── Application state machine ────────────────────────────────────────────────

export type ApplicationStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'conditionally_approved'
  | 'approved'
  | 'pending_closing'
  | 'declined'
  | 'funded'
  | 'closed'

// Valid next states for each application status
const APPLICATION_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  draft:                  ['submitted'],
  submitted:              ['under_review', 'declined'],
  under_review:           ['conditionally_approved', 'approved', 'declined'],
  conditionally_approved: ['approved', 'declined', 'under_review'],
  approved:               ['pending_closing', 'declined'],
  pending_closing:        ['funded', 'declined'],
  declined:               ['under_review'],   // allow re-opening with new info
  funded:                 ['closed'],
  closed:                 [],
}

// Which roles may execute each transition
const APPLICATION_TRANSITION_ROLES: Partial<Record<ApplicationStatus, UserRole[]>> = {
  submitted:              ['borrower', 'admin', 'manager'],
  under_review:           ['admin', 'manager', 'underwriter'],
  conditionally_approved: ['admin', 'manager', 'underwriter'],
  approved:               ['admin', 'manager'],
  pending_closing:        ['admin', 'manager'],
  declined:               ['admin', 'manager', 'underwriter'],
  funded:                 ['admin', 'manager'],
  closed:                 ['admin', 'manager'],
}

export function canTransitionApplication(
  current: ApplicationStatus,
  next: ApplicationStatus
): boolean {
  return APPLICATION_TRANSITIONS[current]?.includes(next) ?? false
}

export function canRoleTransitionApplication(
  role: UserRole,
  next: ApplicationStatus
): boolean {
  const allowedRoles = APPLICATION_TRANSITION_ROLES[next]
  if (!allowedRoles) return false
  return allowedRoles.includes(role)
}

// ─── Loan status state machine ────────────────────────────────────────────────

export type LoanStatus =
  | 'pending_funding'
  | 'active'
  | 'matured'
  | 'delinquent'
  | 'defaulted'
  | 'paid_off'
  | 'charged_off'
  | 'closed'

const LOAN_TRANSITIONS: Record<LoanStatus, LoanStatus[]> = {
  pending_funding: ['active'],
  active:          ['matured', 'delinquent', 'paid_off'],
  matured:         ['paid_off', 'defaulted'],
  delinquent:      ['active', 'defaulted'],   // active = cured
  defaulted:       ['charged_off'],
  paid_off:        ['closed'],
  charged_off:     ['closed'],
  closed:          [],
}

const LOAN_TRANSITION_ROLES: Partial<Record<LoanStatus, UserRole[]>> = {
  active:      ['admin', 'manager', 'servicing'],
  matured:     ['admin', 'manager', 'servicing'],
  delinquent:  ['admin', 'manager', 'servicing'],
  defaulted:   ['admin', 'manager'],
  paid_off:    ['admin', 'manager', 'servicing'],
  charged_off: ['admin', 'manager'],
  closed:      ['admin', 'manager'],
}

export function canTransitionLoan(current: LoanStatus, next: LoanStatus): boolean {
  return LOAN_TRANSITIONS[current]?.includes(next) ?? false
}

export function canRoleTransitionLoan(role: UserRole, next: LoanStatus): boolean {
  const allowedRoles = LOAN_TRANSITION_ROLES[next]
  if (!allowedRoles) return false
  return allowedRoles.includes(role)
}

// ─── Document requirements per transition ─────────────────────────────────────

// Returns document types that must be present before a transition is allowed.
// Used by the API route to gate status changes.
export function getRequiredDocumentsForApplication(
  next: ApplicationStatus
): string[] {
  switch (next) {
    case 'under_review':
      return ['id', 'bank_statement']
    case 'approved':
      return ['appraisal', 'title_report', 'insurance']
    case 'funded':
      return ['promissory_note', 'deed_of_trust', 'closing_disclosure']
    default:
      return []
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function formatApplicationStatus(status: ApplicationStatus): string {
  const labels: Record<ApplicationStatus, string> = {
    draft:                  'Draft',
    submitted:              'Submitted',
    under_review:           'Under Review',
    conditionally_approved: 'Conditionally Approved',
    approved:               'Approved',
    pending_closing:        'Pending Closing',
    declined:               'Declined',
    funded:                 'Funded',
    closed:                 'Closed',
  }
  return labels[status] ?? status
}

export function formatLoanStatus(status: LoanStatus): string {
  const labels: Record<LoanStatus, string> = {
    pending_funding: 'Pending Funding',
    active:          'Active',
    matured:         'Matured',
    delinquent:      'Delinquent',
    defaulted:       'Defaulted',
    paid_off:        'Paid Off',
    charged_off:     'Charged Off',
    closed:          'Closed',
  }
  return labels[status] ?? status
}

export function applicationStatusColor(status: ApplicationStatus): string {
  switch (status) {
    case 'draft':                  return 'bg-gray-100 text-gray-600'
    case 'submitted':              return 'bg-blue-50 text-blue-700'
    case 'under_review':           return 'bg-amber-50 text-amber-700'
    case 'conditionally_approved': return 'bg-purple-50 text-purple-700'
    case 'approved':               return 'bg-green-50 text-green-700'
    case 'pending_closing':        return 'bg-indigo-50 text-indigo-700'
    case 'declined':               return 'bg-red-50 text-red-700'
    case 'funded':                 return 'bg-emerald-50 text-emerald-700'
    case 'closed':                 return 'bg-gray-100 text-gray-500'
    default:                       return 'bg-gray-100 text-gray-600'
  }
}

export function loanStatusColor(status: LoanStatus): string {
  switch (status) {
    case 'pending_funding': return 'bg-amber-50 text-amber-700'
    case 'active':          return 'bg-green-50 text-green-700'
    case 'matured':         return 'bg-blue-50 text-blue-700'
    case 'delinquent':      return 'bg-orange-50 text-orange-700'
    case 'defaulted':       return 'bg-red-50 text-red-700'
    case 'paid_off':        return 'bg-emerald-50 text-emerald-700'
    case 'charged_off':     return 'bg-red-100 text-red-800'
    case 'closed':          return 'bg-gray-100 text-gray-500'
    default:                return 'bg-gray-100 text-gray-600'
  }
}
