# Phase 3 Implementation Plan

Loan Lifecycle, Underwriting Engine, Document Management, Fund Operations

---

## 1. Phase Overview & Goals

### Goals

Phase 3 transforms the portal from role-scoped dashboards with placeholder content into a fully functional lending operations platform. It implements the five core domain systems that drive NexusBridge's business:

1. **Foundation infrastructure** -- audit logging, notifications, tasks, state machine, and the reusable patterns (Zod schemas, rate limiters, trigger functions) that all subsequent steps depend on
2. **Document management** -- secure document upload, storage, review, and categorization for borrower applications, investor onboarding, and loan closing
3. **Underwriting engine** -- case management, rules-based risk assessment, conditions tracking, and decision recording for loan applications
4. **Loan lifecycle** -- loan creation, payment scheduling, payment recording, draw management, and state transitions from funding through payoff or default
5. **Fund operations** -- fund management, investor subscriptions with FCFS locking, capital allocations, NAV snapshots, and investor portfolio/statements

### What success looks like

- A borrower submits an application, uploads documents, and tracks status through underwriting to funding
- An underwriter receives assigned cases, runs risk assessment, records decisions with conditions, and advances applications
- A servicing agent creates loans from approved applications, records payments, manages draws, and tracks loan states
- An investor subscribes to a fund (with FCFS reservation preventing oversubscription), views portfolio holdings, and reviews statements
- An admin has full visibility and control across all domains with audit trail for every action
- Every sensitive action emits an audit event; every user-facing event generates a notification

### Status: ✅ Complete (all 5 steps + post-phase improvements)

### Connection to Phase 2 and Phase 4

Phase 3 depends on Phase 2 infrastructure:
- Supabase Auth, `user_roles` table, middleware, role route guards
- `getUser()`, `getUserRole()`, `createAdminClient()` helpers
- Dashboard layouts and navigation per role

Phase 3 produces infrastructure Phase 4 will consume:
- `notifications` table + `emitNotification()` -- workflow actions send notifications
- `tasks` table + full CRUD -- workflow actions create tasks
- `audit_events` table + `emitAuditEvent()` -- all Phase 4 actions emit audit events
- `documents` table + Storage buckets -- e-signatures store signed PDFs here
- `underwriting_cases`, `conditions`, `risk_flags` -- workflows auto-create cases and conditions
- Loan state machine -- e-signature gates add `pending_closing` state
- `fund_subscriptions` with FCFS locking -- e-signature gates add `pending_signature` status

---

## 2. Step 1 -- Foundation ✅

### Database tables

#### `audit_events` (partitioned, append-only, immutable)

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| event_type | text | e.g. `application_created`, `document_reviewed`, `loan_funded` |
| entity_type | text | e.g. `application`, `document`, `loan`, `investor` |
| entity_id | uuid | FK to the entity |
| actor_id | uuid | FK -> auth.users.id (who performed the action) |
| actor_role | text | Role at time of action |
| payload | jsonb | Event-specific data (before/after values, metadata) |
| ip_address | inet | Nullable |
| user_agent | text | Nullable |
| created_at | timestamptz | Partition key |

**Partitioning**: Monthly range partitions on `created_at` via pg_partman. Partitions are created automatically by the pg_cron maintenance job.

**Immutability**: No UPDATE or DELETE policies. The table is append-only. RLS allows INSERT for all authenticated users (via `emitAuditEvent()`) and SELECT for admin/manager.

#### `activity_logs` (partitioned)

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| user_id | uuid | FK -> auth.users.id |
| action | text | e.g. `login`, `page_view`, `form_submit` |
| resource | text | e.g. `/dashboard/admin/applications` |
| metadata | jsonb | Additional context |
| created_at | timestamptz | Partition key |

**Partitioning**: Weekly range partitions on `created_at` via pg_partman.

#### `notifications`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| user_id | uuid | FK -> auth.users.id |
| title | text | Short notification title |
| message | text | Notification body |
| type | text | `info`, `success`, `warning`, `error` |
| entity_type | text | Nullable; e.g. `application`, `document` |
| entity_id | uuid | Nullable; FK to entity for deep linking |
| is_read | boolean | Default false |
| read_at | timestamptz | Nullable |
| created_at | timestamptz | |

#### `tasks`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| title | text | Task title |
| description | text | Nullable |
| status | text | `open`, `in_progress`, `completed`, `cancelled` |
| priority | text | `low`, `medium`, `high`, `urgent` |
| assigned_to | uuid | FK -> auth.users.id |
| created_by | uuid | FK -> auth.users.id |
| entity_type | text | Nullable; e.g. `application`, `loan` |
| entity_id | uuid | Nullable; FK to entity |
| due_date | date | Nullable |
| completed_at | timestamptz | Nullable |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### PostgreSQL extensions

| Extension | Purpose |
|---|---|
| `pg_partman` | Automatic partition management for `audit_events` and `activity_logs` |
| `pg_cron` | Scheduled jobs: hourly partman maintenance, future delinquency detection |

### pg_cron jobs

```sql
-- Hourly: run pg_partman maintenance (create new partitions, drop old ones)
SELECT cron.schedule('partman-maintenance', '0 * * * *',
  $$SELECT partman.run_maintenance()$$
);
```

### Reusable infrastructure

#### `set_updated_at()` trigger function

```sql
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

Applied to every Phase 3 table that has an `updated_at` column via:

```sql
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON <table_name>
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

#### `emitAuditEvent()` helper

```typescript
// src/lib/audit/emit.ts
// Fire-and-forget: does not await, does not block the API response
// Uses the admin client to bypass RLS (audit_events is append-only)
// Server-only: import 'server-only'
export function emitAuditEvent(params: {
  eventType: string;
  entityType: string;
  entityId: string;
  actorId: string;
  actorRole: string;
  payload?: Record<string, unknown>;
}): void { ... }
```

#### `emitNotification()` helper

```typescript
// src/lib/notifications/emit.ts
// Fire-and-forget: does not await, does not block the API response
// Server-only: import 'server-only'
export function emitNotification(params: {
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  entityType?: string;
  entityId?: string;
}): void { ... }
```

#### Zod schemas

All request body validation schemas are centralized in `src/lib/validation/schemas.ts`:

| Schema | Used By |
|---|---|
| `createTaskSchema` | POST /api/tasks |
| `updateTaskSchema` | PATCH /api/tasks/[id] |
| `updateNotificationSchema` | PATCH /api/notifications/[id] |
| `documentUploadSchema` | POST /api/documents/upload |
| `documentReviewSchema` | PATCH /api/documents/[id] |
| `underwritingAssignSchema` | PATCH /api/underwriting/cases/[id]/assign |
| `underwritingDecisionSchema` | POST /api/underwriting/cases/[id]/decision |
| `conditionSchema` | POST /api/underwriting/cases/[id]/conditions |
| `conditionUpdateSchema` | PATCH /api/underwriting/conditions/[id] |
| `riskFlagSchema` | POST /api/underwriting/cases/[id]/risk-flags |
| `createLoanSchema` | POST /api/loans |
| `recordPaymentSchema` | POST /api/loans/[id]/payments |
| `manageDrawSchema` | POST /api/loans/[id]/draws |
| `loanTransitionSchema` | PATCH /api/loans/[id]/status |
| `fundSubscriptionSchema` | POST /api/funds/[id]/subscriptions |
| `fundAllocationSchema` | POST /api/funds/[id]/allocations |
| `navSnapshotSchema` | POST /api/funds/[id]/nav |
| `updateUserSchema` | PATCH /api/admin/users/[id] |
| `updateInvestorSchema` | PATCH /api/admin/investors/[id] |
| `editApplicationFieldsSchema` | PATCH /api/applications/[id]/fields |

#### Rate limiters

All rate limiter instances are centralized in `src/lib/rate-limit/index.ts`:

| Limiter | Identifier | Limit | Window | Used By |
|---|---|---|---|---|
| `taskLimiter` | User ID | 30 req | 1 min | POST/PATCH/DELETE /api/tasks |
| `notificationLimiter` | User ID | 30 req | 1 min | GET/PATCH /api/notifications |
| `documentLimiter` | User ID | 20 req | 1 min | POST /api/documents/upload, PATCH /api/documents/[id] |
| `underwritingLimiter` | User ID | 20 req | 1 min | All /api/underwriting routes |
| `loanLimiter` | User ID | 20 req | 1 min | All /api/loans routes |
| `fundLimiter` | User ID | 20 req | 1 min | All /api/funds routes |
| `adminLimiter` | User ID | 20 req | 1 hour | /api/admin routes |

#### State machine

`src/lib/loan/state-machine.ts` defines valid transitions for applications and loans:

```typescript
const APPLICATION_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  draft: ['submitted'],
  submitted: ['under_review', 'withdrawn'],
  under_review: ['documents_pending', 'approved', 'declined'],
  documents_pending: ['under_review', 'withdrawn'],
  approved: ['pending_closing', 'declined'],
  pending_closing: ['funded', 'declined'],
  funded: ['active'],
  active: ['paid_off', 'defaulted'],
  declined: [],
  withdrawn: [],
  paid_off: [],
  defaulted: [],
};

const LOAN_TRANSITIONS: Record<LoanStatus, LoanStatus[]> = {
  funded: ['active'],
  active: ['paid_off', 'defaulted'],
  paid_off: [],
  defaulted: [],
};
```

Exported functions:
- `canTransitionApplication(current, target): boolean`
- `canTransitionLoan(current, target): boolean`
- `getValidApplicationTransitions(current): ApplicationStatus[]`
- `getValidLoanTransitions(current): LoanStatus[]`

---

## 3. Step 2 -- Document Management ✅

### Database tables

#### `documents`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| owner_type | text | `borrower`, `investor`, `application`, `loan` |
| owner_id | uuid | FK to owner entity |
| uploaded_by | uuid | FK -> auth.users.id |
| document_type | text | e.g. `bank_statement`, `tax_return`, `pay_stub`, `appraisal`, `id_document` |
| file_name | text | Original file name |
| file_path | text | Supabase Storage path |
| file_size | bigint | Bytes |
| mime_type | text | e.g. `application/pdf`, `image/jpeg` |
| review_status | text | `pending`, `verified`, `rejected` |
| reviewed_by | uuid | Nullable FK -> auth.users.id |
| reviewed_at | timestamptz | Nullable |
| review_notes | text | Nullable |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| created_by | uuid | FK -> auth.users.id |

#### `document_requests`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| application_id | uuid | FK -> applications.id |
| document_type | text | Requested document type |
| description | text | Instructions for the borrower |
| status | text | `pending`, `uploaded`, `verified`, `waived` |
| requested_by | uuid | FK -> auth.users.id |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### Supabase Storage buckets

| Bucket | Access | Purpose |
|---|---|---|
| `borrower-documents` | RLS-gated | Borrower-uploaded documents (bank statements, tax returns, IDs) |
| `investor-documents` | RLS-gated | Investor-uploaded documents (accreditation evidence, IDs) |
| `application-documents` | RLS-gated | Application-specific documents (appraisals, property photos) |
| `loan-documents` | RLS-gated | Loan-specific documents (closing docs, signed agreements) |

### API routes

| Method | Path | Roles | Description |
|---|---|---|---|
| POST | `/api/documents/upload` | borrower, investor, admin, manager | Generate signed upload URL for direct-to-Storage upload |
| PATCH | `/api/documents/[id]` | admin, manager | Review a document (verify/reject with notes) |

### Upload flow (signed URLs)

```
1. Client calls POST /api/documents/upload with metadata (owner_type, document_type, file_name, etc.)
2. API route validates metadata, creates documents record with review_status='pending'
3. API route generates a signed upload URL from Supabase Storage
4. Client uploads file directly to Storage using the signed URL (no file passes through the API route)
5. On successful upload, client confirms via a callback (or the signed URL triggers Storage webhook)
```

This approach avoids Vercel's request body size limit (4.5MB on serverless functions) and allows direct uploads of large documents.

### UI components

| Component | Page | Description |
|---|---|---|
| `DocumentUploadForm` | Borrower documents page | File picker, document type selector, upload progress indicator |
| `DocumentList` | Multiple pages | Sortable/filterable table of documents with status badges |
| `DocumentReviewPanel` | Admin documents page | Review actions: verify/reject with notes, file preview |
| `DocumentRequestBanner` | Borrower application detail | Shows pending document requests with upload CTA |

### Audit events

- `document_uploaded` -- when a document is created
- `document_reviewed` -- when admin verifies or rejects a document
- `document_request_created` -- when a document request is created for a borrower

---

## 4. Step 3 -- Underwriting Engine ✅

### Database tables

#### `underwriting_cases`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| application_id | uuid | FK -> applications.id, unique |
| assigned_to | uuid | Nullable FK -> auth.users.id (underwriter) |
| status | text | `pending`, `in_progress`, `decision_made`, `closed` |
| risk_score | numeric(5,2) | Nullable; computed by rules engine |
| risk_grade | text | Nullable; e.g. `A`, `B`, `C`, `D`, `F` |
| notes | text | Nullable |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| created_by | uuid | |

#### `underwriting_decisions`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| case_id | uuid | FK -> underwriting_cases.id |
| decision | text | `approved`, `declined`, `conditional_approval`, `refer_to_committee` |
| rationale | text | Detailed reasoning |
| decided_by | uuid | FK -> auth.users.id |
| conditions_summary | text | Nullable; summary of conditions if conditional |
| created_at | timestamptz | |

#### `conditions`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| case_id | uuid | FK -> underwriting_cases.id |
| condition_type | text | `prior_to_funding`, `prior_to_closing`, `ongoing` |
| description | text | What must be satisfied |
| status | text | `pending`, `satisfied`, `waived`, `not_met` |
| satisfied_by | uuid | Nullable FK -> auth.users.id |
| satisfied_at | timestamptz | Nullable |
| evidence_document_id | uuid | Nullable FK -> documents.id |
| notes | text | Nullable |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| created_by | uuid | |

#### `risk_flags`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| case_id | uuid | FK -> underwriting_cases.id |
| flag_type | text | e.g. `high_ltv`, `low_credit`, `incomplete_docs`, `property_concern` |
| severity | text | `low`, `medium`, `high`, `critical` |
| description | text | Detail of the flag |
| resolved | boolean | Default false |
| resolved_by | uuid | Nullable |
| resolved_at | timestamptz | Nullable |
| resolution_notes | text | Nullable |
| created_at | timestamptz | |
| created_by | uuid | |

### Rules engine

`src/lib/underwriting/rules-engine.ts` contains pure functions for risk assessment:

```typescript
// Pure function -- no side effects, no DB access
export function assessRisk(application: ApplicationData): RiskAssessment {
  const flags: RiskFlag[] = [];
  let score = 100; // Start at 100, deduct for risk factors

  // LTV check
  if (application.ltv > 75) {
    flags.push({ type: 'high_ltv', severity: 'high', ... });
    score -= 15;
  }

  // DSCR check
  if (application.dscr < 1.2) {
    flags.push({ type: 'low_dscr', severity: 'medium', ... });
    score -= 10;
  }

  // Credit score check
  if (application.creditScore < 650) {
    flags.push({ type: 'low_credit', severity: 'high', ... });
    score -= 20;
  }

  // ... additional rules

  return {
    score: Math.max(0, score),
    grade: scoreToGrade(score),
    flags,
    recommendation: score >= 70 ? 'approve' : score >= 50 ? 'conditional' : 'decline',
  };
}
```

**Design principles:**
- Pure functions: no DB access, no side effects, deterministic
- Testable in isolation with mock data
- Risk factors and thresholds are configurable (not hardcoded magic numbers)
- Returns recommendation but does not enforce it -- the underwriter makes the final decision

### `is_internal_user()` SQL function

Used in RLS policies for underwriting tables:

```sql
CREATE OR REPLACE FUNCTION public.is_internal_user()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('admin', 'manager', 'underwriter', 'servicing')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

### API routes

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/api/underwriting/cases` | admin, manager, underwriter | List cases (underwriter sees only assigned) |
| GET | `/api/underwriting/cases/[id]` | admin, manager, underwriter | Case detail with decisions, conditions, risk flags |
| PATCH | `/api/underwriting/cases/[id]/assign` | admin, manager | Assign case to underwriter |
| POST | `/api/underwriting/cases/[id]/decision` | admin, manager, underwriter | Record underwriting decision |
| POST | `/api/underwriting/cases/[id]/conditions` | admin, manager, underwriter | Add condition to case |
| PATCH | `/api/underwriting/conditions/[id]` | admin, manager, underwriter | Update condition status |
| POST | `/api/underwriting/cases/[id]/risk-flags` | admin, manager, underwriter | Add risk flag to case |

### UI components

| Component | Page | Description |
|---|---|---|
| `CaseList` | Underwriter dashboard, Admin underwriting | Sortable table: application, borrower, risk grade, status, assigned to |
| `CaseDetail` | Case detail page | Full case view: application summary, risk assessment, conditions, flags, decisions |
| `DecisionForm` | Case detail page | Decision dropdown, rationale textarea, conditions summary |
| `ConditionsPanel` | Case detail page | List of conditions with status badges, satisfy/waive actions |
| `RiskFlagsPanel` | Case detail page | List of risk flags with severity badges, resolve actions |
| `RiskScoreBadge` | Multiple pages | Color-coded badge: A=green, B=blue, C=yellow, D=orange, F=red |

---

## 5. Step 4 -- Loan Lifecycle ✅

### Database tables

#### `loans`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| application_id | uuid | FK -> applications.id, unique |
| loan_number | text | Auto-generated: LN-YYYYMMDD-XXXX |
| borrower_id | uuid | FK -> borrowers.id |
| loan_type | text | `bridge`, `fix_and_flip`, `gap_funding`, `micro_lending` |
| principal_amount | numeric(18,2) | Original loan amount |
| interest_rate | numeric(8,5) | Annual interest rate (decimal, e.g. 0.12 = 12%) |
| term_months | integer | Loan term in months |
| payment_type | text | `interest_only`, `amortizing`, `balloon` |
| status | text | `funded`, `active`, `paid_off`, `defaulted` |
| funded_date | date | |
| maturity_date | date | funded_date + term_months |
| current_balance | numeric(18,2) | Running balance |
| total_draws | numeric(18,2) | Cumulative draw amount (fix & flip) |
| max_draw_amount | numeric(18,2) | Maximum allowed draws |
| property_address | text | |
| property_type | text | |
| ltv | numeric(5,2) | Loan-to-value ratio |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| created_by | uuid | |

#### Loan number auto-generation trigger

```sql
CREATE OR REPLACE FUNCTION generate_loan_number()
RETURNS trigger AS $$
DECLARE
  seq_num integer;
  date_str text;
BEGIN
  date_str := to_char(NOW(), 'YYYYMMDD');
  SELECT COUNT(*) + 1 INTO seq_num
  FROM loans
  WHERE loan_number LIKE 'LN-' || date_str || '-%';
  NEW.loan_number := 'LN-' || date_str || '-' || lpad(seq_num::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_loan_number
  BEFORE INSERT ON loans
  FOR EACH ROW EXECUTE FUNCTION generate_loan_number();
```

#### `payment_schedule`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| loan_id | uuid | FK -> loans.id |
| payment_number | integer | 1-indexed |
| due_date | date | |
| principal_amount | numeric(18,2) | |
| interest_amount | numeric(18,2) | |
| total_amount | numeric(18,2) | principal + interest |
| status | text | `scheduled`, `due`, `paid`, `overdue`, `waived` |
| paid_date | date | Nullable |
| paid_amount | numeric(18,2) | Nullable |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### `payments`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| loan_id | uuid | FK -> loans.id |
| schedule_id | uuid | Nullable FK -> payment_schedule.id |
| payment_type | text | `regular`, `extra_principal`, `payoff`, `late_fee`, `draw_repayment` |
| amount | numeric(18,2) | |
| principal_portion | numeric(18,2) | |
| interest_portion | numeric(18,2) | |
| fees_portion | numeric(18,2) | |
| payment_date | date | |
| payment_method | text | `ach`, `wire`, `check` |
| reference_number | text | Nullable |
| notes | text | Nullable |
| recorded_by | uuid | FK -> auth.users.id |
| created_at | timestamptz | |

#### `draws`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| loan_id | uuid | FK -> loans.id |
| draw_number | integer | 1-indexed per loan |
| amount | numeric(18,2) | |
| status | text | `requested`, `approved`, `funded`, `rejected` |
| purpose | text | e.g. `foundation`, `framing`, `electrical`, `finish_work` |
| inspection_status | text | `pending`, `passed`, `failed`, `waived` |
| requested_date | date | |
| approved_date | date | Nullable |
| funded_date | date | Nullable |
| approved_by | uuid | Nullable FK -> auth.users.id |
| notes | text | Nullable |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| created_by | uuid | |

### Amortization calculator

`src/lib/loan/amortization.ts` generates payment schedules:

```typescript
export function generatePaymentSchedule(params: {
  principal: number;
  annualRate: number;
  termMonths: number;
  paymentType: 'interest_only' | 'amortizing' | 'balloon';
  startDate: Date;
}): PaymentScheduleEntry[] { ... }
```

| Payment Type | Principal | Interest | Balloon |
|---|---|---|---|
| Interest Only | $0/month (full principal at maturity) | Monthly interest on full principal | Full principal due at maturity |
| Amortizing | Equal monthly P&I payments | Decreasing monthly interest | None |
| Balloon | $0/month (full principal at maturity) | Monthly interest on full principal | Full principal + final interest at maturity |

**Financial precision**: All calculations use fixed-precision arithmetic. No floating-point math for financial amounts.

### API routes

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/api/loans` | admin, manager, servicing | List all loans (filterable by status, type, borrower) |
| GET | `/api/loans/[id]` | admin, manager, servicing, borrower (own only) | Loan detail with payment schedule, payments, draws |
| POST | `/api/loans` | admin, manager | Create loan from approved application |
| POST | `/api/loans/[id]/payments` | admin, manager, servicing | Record a payment |
| POST | `/api/loans/[id]/draws` | admin, manager, servicing | Request/approve/fund a draw |
| PATCH | `/api/loans/[id]/status` | admin, manager, servicing | Transition loan state |

### UI components

| Component | Page | Description |
|---|---|---|
| `LoanList` | Servicing dashboard, Admin loans | Sortable table: loan number, borrower, type, balance, status, maturity |
| `LoanDetail` | Loan detail page | Full view: loan summary, payment schedule, payment history, draws, state transitions |
| `RecordPaymentForm` | Loan detail page | Payment amount, type, method, date, reference number |
| `DrawsManagement` | Loan detail page | Draw request list with approve/reject/fund actions, inspection status |
| `CreateLoanForm` | Admin applications | Create loan from approved application with terms |
| `PaymentScheduleTable` | Loan detail page | Full amortization table with due/paid status per row |
| `LoanStateBadge` | Multiple pages | Color-coded status badge |

---

## 6. Step 5 -- Fund Operations ✅

### Database tables

#### `funds`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| name | text | e.g. "NexusBridge Capital LP" |
| fund_type | text | `reg_d_506c`, `reg_a_tier2`, `reg_cf` |
| target_size | numeric(18,2) | Fund target raise |
| current_size | numeric(18,2) | Current committed capital |
| min_investment | numeric(18,2) | Minimum subscription amount |
| max_investment | numeric(18,2) | Nullable; maximum per investor |
| status | text | `raising`, `closed`, `fully_deployed`, `winding_down` |
| vintage_year | integer | |
| target_return | numeric(8,4) | Target annual return (decimal) |
| management_fee | numeric(8,4) | Annual management fee (decimal) |
| performance_fee | numeric(8,4) | Performance fee / carried interest (decimal) |
| nav_per_unit | numeric(18,6) | Current NAV per unit |
| total_units | numeric(18,6) | Total outstanding units |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| created_by | uuid | |

#### `fund_subscriptions`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| fund_id | uuid | FK -> funds.id |
| investor_id | uuid | FK -> investors.id |
| commitment_amount | numeric(18,2) | Committed capital |
| funded_amount | numeric(18,2) | Actually funded |
| units_issued | numeric(18,6) | Units allocated |
| subscription_status | text | `draft`, `submitted`, `approved`, `pending_signature`, `active`, `redeemed`, `rejected` |
| subscription_date | date | |
| reserved_at | timestamptz | Nullable; FCFS reservation timestamp |
| reservation_expires_at | timestamptz | Nullable; 30-minute hold window |
| notes | text | Nullable |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| created_by | uuid | |

#### `fund_allocations`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| fund_id | uuid | FK -> funds.id |
| loan_id | uuid | FK -> loans.id |
| allocation_amount | numeric(18,2) | Capital allocated to this loan |
| allocation_percentage | numeric(8,4) | Percentage of fund deployed to this loan |
| status | text | `active`, `repaid`, `defaulted` |
| allocated_date | date | |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| created_by | uuid | |

#### `nav_snapshots`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| fund_id | uuid | FK -> funds.id |
| snapshot_date | date | |
| total_assets | numeric(18,2) | |
| total_liabilities | numeric(18,2) | |
| nav | numeric(18,2) | total_assets - total_liabilities |
| nav_per_unit | numeric(18,6) | nav / total_units |
| total_units | numeric(18,6) | |
| notes | text | Nullable |
| created_at | timestamptz | |
| created_by | uuid | |

### FCFS (First-Come First-Served) locking

`reserve_fund_subscription()` is a PostgreSQL `SECURITY DEFINER` function that prevents oversubscription:

```sql
CREATE OR REPLACE FUNCTION reserve_fund_subscription(
  p_fund_id uuid,
  p_investor_id uuid,
  p_commitment_amount numeric
)
RETURNS uuid AS $$
DECLARE
  v_fund funds%ROWTYPE;
  v_subscription_id uuid;
BEGIN
  -- Lock the fund row to serialize concurrent reservations
  SELECT * INTO v_fund FROM funds WHERE id = p_fund_id FOR UPDATE;

  -- Check remaining capacity
  IF v_fund.current_size + p_commitment_amount > v_fund.target_size THEN
    RAISE EXCEPTION 'Fund oversubscribed: remaining capacity is %',
      v_fund.target_size - v_fund.current_size;
  END IF;

  -- Create subscription with 30-minute reservation hold
  INSERT INTO fund_subscriptions (
    fund_id, investor_id, commitment_amount,
    subscription_status, reserved_at, reservation_expires_at
  ) VALUES (
    p_fund_id, p_investor_id, p_commitment_amount,
    'submitted', NOW(), NOW() + INTERVAL '30 minutes'
  ) RETURNING id INTO v_subscription_id;

  -- Update fund current_size
  UPDATE funds SET current_size = current_size + p_commitment_amount
  WHERE id = p_fund_id;

  RETURN v_subscription_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Key properties:**
- `SELECT FOR UPDATE` on the fund row serializes concurrent subscription attempts
- 30-minute reservation window: if not approved within 30 minutes, the reservation expires and capacity is released
- `SECURITY DEFINER` runs as the function owner, not the calling user, ensuring the `FOR UPDATE` lock works regardless of RLS
- A pg_cron job runs periodically to expire stale reservations and release capacity

### API routes

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/api/funds` | admin, manager, investor | List funds (investor sees eligible funds only) |
| GET | `/api/funds/[id]` | admin, manager, investor | Fund detail |
| POST | `/api/funds/[id]/subscriptions` | investor, admin | Create subscription (FCFS reservation) |
| PATCH | `/api/funds/[id]/subscriptions/[subId]` | admin, manager | Update subscription status (approve/reject) |
| POST | `/api/funds/[id]/allocations` | admin, manager | Create fund allocation to a loan |
| POST | `/api/funds/[id]/nav` | admin | Record NAV snapshot |

### UI pages

| Page | Path | Role | Description |
|---|---|---|---|
| Investor Portfolio | `/dashboard/investor/portfolio` | investor | Holdings, current NAV, fund performance, allocation breakdown |
| Investor Statements | `/dashboard/investor/statements` | investor | Transaction history, distributions, capital calls |
| Admin Fund Dashboard | `/dashboard/admin/funds` | admin, manager | Fund overview, subscriptions, allocations, NAV history |

---

## 7. Post-Phase 3 Improvements ✅

After the five core steps, the following improvements were implemented to complete the operational platform:

### RBAC per operation

All API routes enforce role-specific access at the operation level, not just route level:

| Operation | admin | manager | underwriter | servicing | borrower | investor |
|---|---|---|---|---|---|---|
| Create/update/delete users | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Delete investors | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Manage applications | ✅ | ✅ | Read only | ❌ | Own only | ❌ |
| Manage underwriting | ✅ | ✅ | Assigned only | ❌ | ❌ | ❌ |
| Manage loans | ✅ | ✅ | Read only | ✅ | Own only | ❌ |
| Manage documents | ✅ | ✅ | Read only | Read only | Own only | Own only |
| Manage funds | ✅ | ✅ | ❌ | ❌ | ❌ | Subscribe only |
| Manage tasks | ✅ | ✅ | Own only | Own only | ❌ | ❌ |
| View audit log | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| View workflows | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

### Admin CRUD -- Users

| Method | Path | Roles | Description |
|---|---|---|---|
| PATCH | `/api/admin/users/[id]` | admin | Update user role or status |

Component: `EditUserRoleButton` -- inline role/status editor on users list.

### Admin CRUD -- Investors

| Method | Path | Roles | Description |
|---|---|---|---|
| PATCH | `/api/admin/investors/[id]` | admin, manager | Update investor statuses (kyc, accreditation, subscription) |
| DELETE | `/api/admin/investors/[id]` | admin | Delete investor (blocked if active subscriptions exist) |

Components: `EditInvestorStatusButton`, `DeleteInvestorButton` (with subscription guard confirmation).

### Admin CRUD -- Applications

| Method | Path | Roles | Description |
|---|---|---|---|
| PATCH | `/api/applications/[id]/fields` | admin, manager | Edit application fields (loan purpose, amount, term, exit strategy, property fields) |

Component: `EditApplicationFieldsForm` -- modal form for editing application details.

### Borrower application pages

| Page | Path | Description |
|---|---|---|
| Application List | `/dashboard/borrower/applications` | Real list of borrower's own applications with status badges |
| Application Detail | `/dashboard/borrower/applications/[id]` | Full detail: status timeline, conditions, documents, review status |

Ownership-gated: borrowers can only view their own applications (enforced by RLS + API check).

### Notifications system

| Component | Description |
|---|---|
| `NotificationBell` | In nav header for all roles; shows unread count; dropdown with recent notifications |
| Notifications inbox | `/dashboard/notifications` -- full paginated notification list with mark-read actions |
| `emitNotification()` | Wired to: document review, application status changes, task assignments, underwriting decisions |

API routes:
- GET `/api/notifications` -- paginated, user-scoped
- PATCH `/api/notifications` -- mark all as read
- PATCH `/api/notifications/[id]` -- mark single as read

### Audit log viewer

Page: `/dashboard/admin/audit`

Features:
- Paginated event list
- Filterable by: event type, entity type, date range, actor
- Color-coded badges per event type
- Collapsible payload viewer (JSON formatted)
- Admin and manager access only

### Tasks system

API routes:
- POST `/api/tasks` -- create task
- PATCH `/api/tasks/[id]` -- update status, assignee, due date, priority
- DELETE `/api/tasks/[id]` -- delete task

Page: `/dashboard/admin/tasks` (admin/manager), `/dashboard/underwriter/tasks` and `/dashboard/servicing/tasks` (own tasks)

Features:
- Status tabs: Open, In Progress, Completed, Cancelled
- Priority badges: Low (gray), Medium (blue), High (orange), Urgent (red)
- Due date warnings (overdue = red, due today = yellow)
- Assignee display
- `CreateTaskForm` component
- `TaskStatusButton` for quick status transitions

### New audit event types added

| Event Type | Entity Type | Trigger |
|---|---|---|
| `user_updated` | user | Admin changes user role or status |
| `investor_updated` | investor | Admin updates investor statuses |
| `investor_deleted` | investor | Admin deletes investor |

---

## 8. Database Summary

### All Phase 3 tables

| Table | Step | Partitioned | Immutable |
|---|---|---|---|
| `audit_events` | 1 | Monthly (pg_partman) | Yes (append-only) |
| `activity_logs` | 1 | Weekly (pg_partman) | No |
| `notifications` | 1 | No | No |
| `tasks` | 1 | No | No |
| `documents` | 2 | No | No |
| `document_requests` | 2 | No | No |
| `underwriting_cases` | 3 | No | No |
| `underwriting_decisions` | 3 | No | Yes (append-only) |
| `conditions` | 3 | No | No |
| `risk_flags` | 3 | No | No |
| `loans` | 4 | No | No |
| `payment_schedule` | 4 | No | No |
| `payments` | 4 | No | Yes (append-only) |
| `draws` | 4 | No | No |
| `funds` | 5 | No | No |
| `fund_subscriptions` | 5 | No | No |
| `fund_allocations` | 5 | No | No |
| `nav_snapshots` | 5 | No | Yes (append-only) |

### PostgreSQL extensions

| Extension | Added In | Purpose |
|---|---|---|
| `pg_partman` | Step 1 | Partition management |
| `pg_cron` | Step 1 | Scheduled maintenance jobs |

### Triggers

| Trigger | Table | Function |
|---|---|---|
| `set_updated_at` | All tables with `updated_at` | `set_updated_at()` |
| `set_loan_number` | `loans` | `generate_loan_number()` |

### SQL functions

| Function | Type | Purpose |
|---|---|---|
| `set_updated_at()` | TRIGGER | Auto-update `updated_at` timestamp |
| `generate_loan_number()` | TRIGGER | Auto-generate loan numbers (LN-YYYYMMDD-XXXX) |
| `get_user_role(uuid)` | QUERY | Return user role from `user_roles` |
| `is_admin()` | QUERY | Check if current user is admin |
| `is_internal_user()` | QUERY | Check if current user is admin/manager/underwriter/servicing |
| `reserve_fund_subscription(uuid, uuid, numeric)` | MUTATION | FCFS fund subscription reservation with locking |

---

## 9. API Routes Summary

### All Phase 3 API routes

| Domain | Method | Path | Roles |
|---|---|---|---|
| **Documents** | POST | `/api/documents/upload` | borrower, investor, admin, manager |
| | PATCH | `/api/documents/[id]` | admin, manager |
| **Underwriting** | GET | `/api/underwriting/cases` | admin, manager, underwriter |
| | GET | `/api/underwriting/cases/[id]` | admin, manager, underwriter |
| | PATCH | `/api/underwriting/cases/[id]/assign` | admin, manager |
| | POST | `/api/underwriting/cases/[id]/decision` | admin, manager, underwriter |
| | POST | `/api/underwriting/cases/[id]/conditions` | admin, manager, underwriter |
| | PATCH | `/api/underwriting/conditions/[id]` | admin, manager, underwriter |
| | POST | `/api/underwriting/cases/[id]/risk-flags` | admin, manager, underwriter |
| **Loans** | GET | `/api/loans` | admin, manager, servicing |
| | GET | `/api/loans/[id]` | admin, manager, servicing, borrower (own) |
| | POST | `/api/loans` | admin, manager |
| | POST | `/api/loans/[id]/payments` | admin, manager, servicing |
| | POST | `/api/loans/[id]/draws` | admin, manager, servicing |
| | PATCH | `/api/loans/[id]/status` | admin, manager, servicing |
| **Funds** | GET | `/api/funds` | admin, manager, investor |
| | GET | `/api/funds/[id]` | admin, manager, investor |
| | POST | `/api/funds/[id]/subscriptions` | investor, admin |
| | PATCH | `/api/funds/[id]/subscriptions/[subId]` | admin, manager |
| | POST | `/api/funds/[id]/allocations` | admin, manager |
| | POST | `/api/funds/[id]/nav` | admin |
| **Notifications** | GET | `/api/notifications` | all authenticated |
| | PATCH | `/api/notifications` | all authenticated |
| | PATCH | `/api/notifications/[id]` | all authenticated |
| **Tasks** | POST | `/api/tasks` | admin, manager, underwriter, servicing |
| | PATCH | `/api/tasks/[id]` | admin, manager, underwriter (own), servicing (own) |
| | DELETE | `/api/tasks/[id]` | admin, manager |
| **Admin -- Users** | PATCH | `/api/admin/users/[id]` | admin |
| **Admin -- Investors** | PATCH | `/api/admin/investors/[id]` | admin, manager |
| | DELETE | `/api/admin/investors/[id]` | admin |
| **Applications** | PATCH | `/api/applications/[id]/fields` | admin, manager |

---

## 10. State Machine

### Application state transitions

```
draft → submitted → under_review → documents_pending → under_review (loop)
                  → under_review → approved → pending_closing → funded → active → paid_off
                                                                               → defaulted
                  → under_review → declined
                  → withdrawn (from submitted or documents_pending)
```

Full transition map:

| Current State | Valid Next States |
|---|---|
| `draft` | `submitted` |
| `submitted` | `under_review`, `withdrawn` |
| `under_review` | `documents_pending`, `approved`, `declined` |
| `documents_pending` | `under_review`, `withdrawn` |
| `approved` | `pending_closing`, `declined` |
| `pending_closing` | `funded`, `declined` |
| `funded` | `active` |
| `active` | `paid_off`, `defaulted` |
| `declined` | (terminal) |
| `withdrawn` | (terminal) |
| `paid_off` | (terminal) |
| `defaulted` | (terminal) |

### Loan state transitions

| Current State | Valid Next States |
|---|---|
| `funded` | `active` |
| `active` | `paid_off`, `defaulted` |
| `paid_off` | (terminal) |
| `defaulted` | (terminal) |

### Transition enforcement

- `canTransitionApplication(current, target)` and `canTransitionLoan(current, target)` are called before any state change
- Invalid transitions return 400 with a clear error message
- Every state transition emits an audit event
- Application status changes trigger notifications to the borrower

---

## 11. Security & RLS

### RLS policies by domain

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `audit_events` | admin, manager | all authenticated (via emitAuditEvent) | None (immutable) | None (immutable) |
| `activity_logs` | admin, manager | all authenticated | None | None |
| `notifications` | own user; admin | system (admin client) | own user (mark read) | None |
| `tasks` | admin, manager, own assignee | admin, manager, underwriter, servicing | admin, manager, own assignee | admin, manager |
| `documents` | admin, manager, own uploader; internal users (read) | all authenticated | admin, manager | admin |
| `document_requests` | admin, manager, own borrower | admin, manager, underwriter | admin, manager, underwriter | admin |
| `underwriting_cases` | admin, manager, assigned underwriter | admin, manager | admin, manager, assigned underwriter | None |
| `underwriting_decisions` | admin, manager, assigned underwriter | admin, manager, underwriter | None (immutable) | None |
| `conditions` | admin, manager, assigned underwriter | admin, manager, underwriter | admin, manager, underwriter | admin |
| `risk_flags` | admin, manager, assigned underwriter | admin, manager, underwriter | admin, manager, underwriter | admin |
| `loans` | admin, manager, servicing, own borrower | admin, manager | admin, manager, servicing | None |
| `payment_schedule` | admin, manager, servicing, own borrower | system | admin, manager, servicing | None |
| `payments` | admin, manager, servicing, own borrower | admin, manager, servicing | None (immutable) | None |
| `draws` | admin, manager, servicing, own borrower | admin, manager, servicing | admin, manager, servicing | None |
| `funds` | admin, manager, investor | admin | admin, manager | None |
| `fund_subscriptions` | admin, manager, own investor | investor (via reserve function), admin | admin, manager | None |
| `fund_allocations` | admin, manager | admin, manager | admin, manager | admin |
| `nav_snapshots` | admin, manager, investor | admin | None (immutable) | None |

### Security patterns

1. **Ownership gating**: borrowers see only their own applications, loans, documents; investors see only their own subscriptions, portfolio, statements
2. **Internal user access**: underwriters, servicing agents see data relevant to their domain but cannot access other domains
3. **Append-only tables**: `audit_events`, `underwriting_decisions`, `payments`, `nav_snapshots` have no UPDATE or DELETE policies
4. **SECURITY DEFINER functions**: `reserve_fund_subscription()` runs as the function owner to ensure the `FOR UPDATE` lock works correctly
5. **Admin client isolation**: `createAdminClient()` bypasses RLS and is only used in `server-only` files

---

## 12. Environment Variables

Phase 3 does not introduce new environment variables beyond those established in Phase 2. All Phase 3 functionality uses:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (admin operations, audit events, notifications) |
| `DATABASE_URL` | PostgreSQL connection (Drizzle ORM, port 6543) |
| `UPSTASH_REDIS_REST_URL` | Rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | Rate limiting |
| `NEXT_PUBLIC_APP_URL` | Portal URL for redirects |

---

## 13. Testing Requirements

### Unit tests

- [ ] State machine: `canTransitionApplication()` returns true for valid transitions, false for invalid
- [ ] State machine: `canTransitionLoan()` returns true for valid transitions, false for invalid
- [ ] Amortization calculator: interest-only schedule produces correct amounts
- [ ] Amortization calculator: amortizing schedule produces correct P&I split
- [ ] Amortization calculator: balloon schedule produces correct final payment
- [ ] Financial precision: no floating-point errors in payment calculations
- [ ] Rules engine: `assessRisk()` produces correct flags for high-LTV application
- [ ] Rules engine: `assessRisk()` produces correct risk grade for edge cases
- [ ] Rules engine: pure function (no side effects, deterministic)

### Integration tests

- [ ] Document upload: signed URL generation → Storage upload → documents record created
- [ ] Document review: PATCH → status updated → audit event emitted → notification sent to borrower
- [ ] Underwriting case: assign → decision → conditions → status transitions
- [ ] Loan creation: POST with valid application → loan record + payment schedule generated
- [ ] Payment recording: POST → payment record created → loan balance updated → schedule entry marked paid
- [ ] Draw management: request → approve → fund → loan draw balance updated
- [ ] Fund subscription: FCFS reservation → approve → active (with capacity tracking)
- [ ] Fund subscription: concurrent reservations → only one succeeds when at capacity
- [ ] NAV snapshot: POST → snapshot recorded → fund nav_per_unit updated
- [ ] Notification delivery: emitNotification() creates record; GET returns it; PATCH marks read

### E2E tests

- [ ] Full borrower journey: signup → apply → upload docs → track status → view conditions → receive approval notification
- [ ] Full underwriting journey: receive case → assess risk → add conditions → record decision → advance application
- [ ] Full servicing journey: create loan → record payments → manage draws → transition to paid off
- [ ] Full investor journey: view fund → subscribe → track portfolio → view statements
- [ ] Oversubscription prevention: two investors try to subscribe beyond fund capacity → second is rejected
- [ ] Role isolation: borrower cannot access admin pages; investor cannot access underwriting
- [ ] Audit trail: every action produces an audit event viewable in the admin audit log

### RLS tests

- [ ] Borrower A cannot see Borrower B's applications, documents, or loans
- [ ] Investor A cannot see Investor B's subscriptions or portfolio
- [ ] Underwriter cannot see applications not assigned to them (unless admin/manager)
- [ ] Servicing agent can see loans but cannot modify underwriting cases
- [ ] Anonymous (no session) cannot read any table
