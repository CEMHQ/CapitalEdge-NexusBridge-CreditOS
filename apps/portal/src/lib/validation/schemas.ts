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
