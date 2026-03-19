import { z } from 'zod'

// ─── Shared primitives ────────────────────────────────────────────────────────

const currencyAmount = z
  .union([z.string(), z.number()])
  .transform((v) => Number(String(v).replace(/[^0-9.-]/g, '')))
  .pipe(z.number().positive())
  .nullable()
  .optional()

const positiveAmount = z
  .union([z.string(), z.number()])
  .transform((v) => Number(String(v).replace(/[^0-9.-]/g, '')))
  .pipe(z.number().min(1, 'Amount must be greater than 0'))

// ─── POST /api/applications ───────────────────────────────────────────────────

export const createApplicationSchema = z.object({
  profile: z.object({
    full_name: z.string().trim().min(2, 'Full name is required').max(120),
    phone: z
      .string()
      .regex(/^\+?[\d\s\-().]{7,20}$/, 'Invalid phone number')
      .optional()
      .or(z.literal('')),
  }),
  property: z.object({
    address_line_1: z.string().trim().min(5, 'Address is required').max(200),
    address_line_2: z.string().trim().max(100).optional().or(z.literal('')),
    city: z.string().trim().min(2, 'City is required').max(100),
    state: z
      .string()
      .trim()
      .length(2, 'State must be a 2-letter code')
      .toUpperCase(),
    postal_code: z
      .string()
      .trim()
      .regex(/^\d{5}(-\d{4})?$/, 'Invalid ZIP code'),
    property_type: z.enum([
      'sfh',
      'multifamily',
      'condo',
      'land',
      'mixed_use',
      'commercial',
    ]),
    occupancy_type: z.enum(['owner_occupied', 'rental', 'vacant']),
    current_value: currencyAmount,
    arv_value: currencyAmount,
    purchase_price: currencyAmount,
  }),
  loan: z.object({
    loan_purpose: z.enum(['bridge', 'renovation', 'contingency', 'other']),
    requested_amount: positiveAmount.pipe(
      z.number().min(25000, 'Minimum loan is $25,000').max(10000000, 'Maximum loan is $10,000,000')
    ),
    requested_term_months: z
      .union([z.string(), z.number()])
      .transform((v) => Number(v))
      .pipe(z.number().int().min(1).max(360)),
    exit_strategy: z.enum(['sale', 'refinance', 'repayment']),
  }),
})

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>

// ─── PATCH /api/applications/[id] ────────────────────────────────────────────

export const updateApplicationStatusSchema = z.object({
  application_status: z.enum([
    'submitted',
    'under_review',
    'conditionally_approved',
    'approved',
    'declined',
    'funded',
    'closed',
  ]),
})

export type UpdateApplicationStatusInput = z.infer<typeof updateApplicationStatusSchema>

// ─── POST /api/auth/invite ────────────────────────────────────────────────────

export const inviteUserSchema = z.object({
  email: z.string().trim().email('Invalid email address').max(254),
  role: z.enum(['investor', 'admin', 'manager', 'underwriter', 'servicing']),
})

export type InviteUserInput = z.infer<typeof inviteUserSchema>

// ─── PATCH /api/loan-requests/[id] ───────────────────────────────────────────

export const updateLoanRequestSchema = z
  .object({
    requested_ltv: z.number().min(0).max(1).nullable().optional(),
    requested_ltc: z.number().min(0).max(1).nullable().optional(),
    requested_dscr: z.number().min(0).max(10).nullable().optional(),
  })
  .refine(
    (data) =>
      data.requested_ltv !== undefined ||
      data.requested_ltc !== undefined ||
      data.requested_dscr !== undefined,
    { message: 'At least one metric (LTV, LTC, or DSCR) is required' }
  )

export type UpdateLoanRequestInput = z.infer<typeof updateLoanRequestSchema>

// ─── Phase 3: Loan lifecycle ──────────────────────────────────────────────────

export const updateApplicationStatusSchemaV2 = z.object({
  application_status: z.enum([
    'submitted',
    'under_review',
    'conditionally_approved',
    'approved',
    'declined',
    'funded',
    'closed',
  ]),
  notes: z.string().trim().max(2000).optional(),
})

export const createLoanSchema = z.object({
  application_id:    z.string().uuid(),
  principal_amount:  z.number().positive(),
  interest_rate:     z.number().min(0).max(1),       // e.g. 0.12 = 12%
  origination_fee:   z.number().min(0).optional(),
  term_months:       z.number().int().min(1).max(360),
  payment_type:      z.enum(['interest_only', 'amortizing', 'balloon']),
  funding_date:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export type CreateLoanInput = z.infer<typeof createLoanSchema>

export const updateLoanStatusSchema = z.object({
  loan_status: z.enum([
    'pending_funding',
    'active',
    'matured',
    'delinquent',
    'defaulted',
    'paid_off',
    'charged_off',
    'closed',
  ]),
  notes: z.string().trim().max(2000).optional(),
})

export type UpdateLoanStatusInput = z.infer<typeof updateLoanStatusSchema>

export const createDrawSchema = z.object({
  draw_amount:  z.number().positive(),
  description:  z.string().trim().max(500).optional(),
})

export type CreateDrawInput = z.infer<typeof createDrawSchema>

export const updateDrawSchema = z.object({
  draw_status: z.enum(['approved', 'funded', 'cancelled']),
  notes:       z.string().trim().max(500).optional(),
})

export type UpdateDrawInput = z.infer<typeof updateDrawSchema>

export const recordPaymentSchema = z.object({
  payment_date:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  payment_amount:        z.number().positive(),
  principal_applied:     z.number().min(0).default(0),
  interest_applied:      z.number().min(0).default(0),
  fees_applied:          z.number().min(0).default(0),
  payment_method:        z.enum(['ach', 'wire', 'check', 'other']).optional(),
  external_reference:    z.string().trim().max(200).optional(),
  payment_schedule_id:   z.string().uuid().optional(),
})

export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>

// ─── Phase 3: Underwriting ────────────────────────────────────────────────────

export const assignApplicationSchema = z.object({
  assigned_to: z.string().uuid().optional(),  // null = unassigned
})

export const recordDecisionSchema = z.object({
  decision_type:         z.enum(['conditional_approval', 'approval', 'decline', 'hold', 'override']),
  approved_amount:       z.number().positive().optional(),
  approved_rate:         z.number().min(0).max(1).optional(),
  approved_term_months:  z.number().int().min(1).max(360).optional(),
  approved_ltv:          z.number().min(0).max(1).optional(),
  approved_ltc:          z.number().min(0).max(1).optional(),
  conditions_summary:    z.string().trim().max(2000).optional(),
  decision_notes:        z.string().trim().max(2000).optional(),
})

export type RecordDecisionInput = z.infer<typeof recordDecisionSchema>

export const addConditionSchema = z.object({
  condition_type: z.enum(['appraisal', 'insurance', 'title', 'document', 'financial', 'compliance']),
  description:    z.string().trim().min(5).max(1000),
})

export const updateConditionSchema = z.object({
  status: z.enum(['satisfied', 'waived']),
  notes:  z.string().trim().max(500).optional(),
})

// ─── Phase 3: Documents ───────────────────────────────────────────────────────

export const requestUploadUrlSchema = z.object({
  owner_type:    z.enum(['borrower', 'investor', 'application', 'loan']),
  owner_id:      z.string().uuid(),
  document_type: z.enum([
    'id', 'tax_return', 'bank_statement', 'appraisal', 'agreement',
    'promissory_note', 'deed_of_trust', 'insurance', 'title_report',
    'draw_request', 'k1', 'statement', 'subscription_agreement',
    'closing_disclosure', 'payoff_letter',
  ]),
  file_name:     z.string().trim().min(1).max(255),
  mime_type:     z.enum([
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ]),
  file_size_bytes: z.number().int().positive().max(52428800), // 50 MB max
})

export type RequestUploadUrlInput = z.infer<typeof requestUploadUrlSchema>

export const reviewDocumentSchema = z.object({
  review_status:    z.enum(['verified', 'rejected']),
  rejection_reason: z.string().trim().max(500).optional(),
})

// ─── Phase 3: Fund operations ─────────────────────────────────────────────────

export const createSubscriptionSchema = z.object({
  fund_id:           z.string().uuid(),
  commitment_amount: z.number().positive().min(10000, 'Minimum commitment is $10,000'),
})

export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>

export const updateSubscriptionSchema = z.object({
  subscription_status: z.enum(['approved', 'rejected', 'active', 'redeemed']),
  notes:               z.string().trim().max(1000).optional(),
})

export const createAllocationSchema = z.object({
  subscription_id:   z.string().uuid(),
  loan_id:           z.string().uuid(),
  allocation_amount: z.number().positive(),
  allocation_date:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export const recordNavSchema = z.object({
  snapshot_date:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  total_assets:     z.number().min(0),
  total_liabilities: z.number().min(0).default(0),
  nav:              z.number().min(0),
  nav_per_unit:     z.number().min(0).optional(),
  notes:            z.string().trim().max(1000).optional(),
})

export type RecordNavInput = z.infer<typeof recordNavSchema>
