# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

NexusBridge CreditOS is a hybrid financial infrastructure platform connecting borrowers seeking short-term asset-backed financing (bridge loans, real estate) with investors seeking yield-generating private credit exposure. It handles Reg A/D offerings, investor management, fund accounting, and borrower workflows.

**Business model**: Originate and manage short-duration loans (6-12 months), secured by real assets, with conservative LTV ratios. Investors participate through NexusBridge Capital LP. Long-term vision includes a hybrid "HyFi" layer -- blockchain-based tokenized participation on top of the centralized lending platform.

The marketing site (`apps/web-marketing`) is **live on Vercel** (Phase 1 complete). The unified portal (`apps/portal`) is **live in development** (Phase 3 complete, post-Phase 3 improvements done). The `services/`, `core/`, and `infrastructure/` directories are scaffolding -- not yet built.

Design docs live in `/docs/`. Before implementing any feature, read the relevant doc:

| Topic | Doc |
|---|---|
| Platform vision & goals | `docs/01_Platform_Overview.md` |
| Architecture & tech stack | `docs/02_System_Architecture.md` |
| Workflows & user journeys | `docs/03_Platform_Workflows.md` |
| Implementation phasing & dev guide | `docs/04_Developer_Guide.md` |
| Loan state machine | `docs/05_Loan_State_Machine.md` |
| Capital waterfall logic | `docs/06_Capital_Waterfall_Logic.md` |
| Underwriting rules engine | `docs/07_Underwriting_Rules_Engine.md` |
| Servicing & ledger model | `docs/08_Servicing_Ledger_Model.md` |
| SOC2 implementation | `docs/09_SOC2_Implementation_Protocol.md` |
| Document management | `docs/10_Document_Management.md` |
| Data security & audit framework | `docs/11_Data_Security_Audit_Framework.md` |
| Institutional ledger architecture | `docs/12_Institutional_Ledger_Architecture.md` |
| Event-driven workflow engine | `docs/13_Event_Driven_Workflow_Engine.md` |
| Reg A / Reg D compliance | `docs/14_RegA_RegD_Compliance_System.md` |
| Database schema (canonical) | `docs/Database_Schema.md` |
| **Database infrastructure & config** | **`docs/15_Database_Infrastructure.md`** |
| **SQL reference index** | **`docs/SQL_Reference.md`** |
| **SQL reference — Phase 1 & 2** | **`docs/SQL_Reference_Phase1_2.md`** |
| **SQL reference — Phase 3** | **`docs/SQL_Reference_Phase3.md`** |
| **Entity separation (debt vs. equity)** | **`docs/Entity_Separation_Strategy.md`** |
| **Phase 4 implementation plan** | **`docs/Phase4_Implementation_Plan.md`** |

UI/UX rules are in `CLAUDE_Web_Design.md` (marketing site) and `CLAUDE_App_UI.md` (application portals).

---

## Entity Separation -- Critical Rule

Two brands. Two licenses. Two regulatory lanes. **Never cross them.**

| Entity | Lane | License | Website |
|---|---|---|---|
| Capital Edge Management, Inc. (CEM) | **Equity** | Real Estate License | capitaledgeinvest.com |
| NexusBridge Lending LLC | **Debt** | Lending License | nexusbridgelending.com |

### CEM owns (equity side):
- Real Estate Fund (Reg A / Reg D) -- income-producing, value-add, distressed properties
- Crowdfund (Reg CF) -- startups and growth-stage companies
- Advisory / Education

### NexusBridge owns (debt side):
- Bridge Loans, Renovation Financing, Asset-Backed Lending, GAP Funding, Micro-Lending
- NexusBridge Capital LP -- private credit fund (Reg D / 506(c)), investor access to loan portfolio

### Rules for all code and content decisions:
- **No equity investment products on the NexusBridge site**
- **No lending or debt products on the CEM site**
- The CEM Credit Fund (Asset-Backed, GAP, Micro-Lending) belongs to NexusBridge -- it must not appear on capitaledgeinvest.com
- Each site cross-references the other: NexusBridge footer references CEM as manager; CEM references NexusBridge for lending services
- See `docs/Entity_Separation_Strategy.md` for full detail

### Corporate structure:
```
Capital Edge Management, Inc. (CEM)
    └── Obsidian & Co. Holdings, LLC
            ├── NexusBridge Capital LP   ← private credit fund (Reg D / 506(c))
            └── NexusBridge Lending LLC  ← lending platform
```

---

## Tech Stack

- **Frontend**: Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Realtime)
- **ORM**: Drizzle ORM (type-safe, Supabase Transaction Pooler on port 6543)
- **Rate Limiting**: Upstash Redis (serverless, Edge-compatible)
- **Email**: Resend SDK
- **Hosting**: Vercel (frontend)
- **Monorepo**: Turborepo (planned)
- **Integrations**: Plaid, PostHog, Sentry, n8n (automation)

---

## Build & Dev Commands

### Marketing site (`apps/web-marketing`) -- live on Vercel
```bash
cd apps/web-marketing
npm run dev       # Start dev server (localhost:3000)
npm run build     # Production build
npm run lint      # ESLint
```

Requires `apps/web-marketing/.env.local` with:
```
RESEND_API_KEY=your_key_here
```

### Portal (`apps/portal`) -- Phase 3 complete
```bash
cd apps/portal
npm run dev       # Start dev server (localhost:3001)
npm run build     # Production build
npm run lint      # ESLint
```

Requires `apps/portal/.env.local` with Supabase, Upstash credentials, and Phase 4 integrations:
```
N8N_WEBHOOK_SECRET=your_shared_hmac_secret_here
```

### Supabase local development
```bash
supabase start           # Start local Supabase stack
supabase db reset        # Reset and re-apply migrations
supabase functions serve # Serve Edge Functions locally
```

---

## Architecture

### Monorepo Structure

```
apps/
  web-marketing/   # Marketing site -- live on Vercel (localhost:3000)
  portal/          # Unified portal -- Phase 3 complete (localhost:3001)
services/          # Backend domain services (scaffolding only)
core/              # Shared libraries (scaffolding only)
infrastructure/    # Docker, Terraform, CI/CD (scaffolding only)
compliance/        # SOC2, Reg A, Reg D artifacts
docs/              # Architecture documentation
```

### Security Architecture -- Request Enforcement Order

Every request passes through these layers in order. **Do not skip or reorder them.**

```
1. Middleware (proxy.ts)       — IP rate limit (Upstash) → auth check → role route guard
2. API Route: validateBody()   — Zod schema → 400 if invalid
3. API Route: applyRateLimit() — Upstash user-ID counter → 429 if exceeded
4. API Route: getUser()        — Supabase session → 401 if not authenticated
5. API Route: getUserRole()    — user_roles table lookup → 403 if wrong role
6. DB operation                — Supabase RLS enforces row-level access
```

**Key files:**
- Middleware: `apps/portal/src/middleware.ts`
- Zod schemas: `apps/portal/src/lib/validation/schemas.ts`
- Rate limiters: `apps/portal/src/lib/rate-limit/index.ts`
- Auth helpers: `apps/portal/src/lib/supabase/admin.ts` (server-only, service role)
- Audit events: `apps/portal/src/lib/audit/emit.ts` (fire-and-forget, server-only)
- Notifications: `apps/portal/src/lib/notifications/emit.ts` (fire-and-forget, server-only)

**Rules:**
- All role checks must use `getUserRole(supabase, user.id)` -- never `user.user_metadata?.role`
- `SUPABASE_SERVICE_ROLE_KEY` and `DATABASE_URL` must only be imported in server-only files -- add `import 'server-only'` to any file that uses them
- Rate limiter instances live in `src/lib/rate-limit/index.ts` -- reuse them, do not create ad-hoc limiters
- Zod schemas live in `src/lib/validation/schemas.ts` -- add new schemas here when adding new routes
- Audit events: use `emitAuditEvent()` from `src/lib/audit/emit.ts` for all sensitive actions (fire-and-forget, server-only)
- Admin client: use `createAdminClient()` from `src/lib/supabase/admin.ts` for service-role operations (server-only)
- Notifications: use `emitNotification()` from `src/lib/notifications/emit.ts` for in-app notifications (fire-and-forget, server-only)

### Auth Callback Routes

Two server-side routes handle all post-auth redirects. Never expose raw JWTs in URLs.

| Route | Flow | Method |
|---|---|---|
| `/auth/confirm` | Invite, password reset | `verifyOtp(token_hash)` -- hashed token in query param, no raw JWT |
| `/auth/callback` | Magic link, OAuth | `exchangeCodeForSession(code)` -- PKCE, code verifier in cookies |

**Rules:**
- Do not add a third auth redirect route -- extend these two
- Invite `redirectTo` must point to `${NEXT_PUBLIC_APP_URL}/auth/confirm`
- The browser client (`src/lib/supabase/client.ts`) has `flowType: 'pkce'` -- do not remove it
- Supabase invite email template must use `{{ .TokenHash }}` -- not `{{ .ConfirmationURL }}`

### Roles (6 roles, all implemented)

| Role | Access | Navigation Links |
|---|---|---|
| `borrower` | Apply for loans, upload documents, view application status and detail, receive notifications | Dashboard, My Applications, Documents, Notifications |
| `investor` | View portfolio, fund subscriptions, statements, receive notifications | Dashboard, Portfolio, Statements, Notifications |
| `admin` | Full CRUD: applications, investors, users, documents, underwriting, tasks, workflows, audit log, invite users | Dashboard, Applications, Investors, Documents, Underwriting, Users, Tasks, Workflows, Audit Log, Invite User |
| `manager` | Same as admin minus user management and investor delete | Dashboard, Applications, Investors, Documents, Tasks, Audit Log, Invite User |
| `underwriter` | Underwriting cases assigned to them, record decisions, add conditions, own tasks | Dashboard, Cases, Tasks |
| `servicing` | Loan management, record payments, manage draws, own tasks | Dashboard, Loans, Tasks |

### State Machines

State transitions are enforced in `src/lib/loan/state-machine.ts`:

**Application states:**
```
ApplicationSubmitted → DocumentsPending → UnderwritingReview →
Approved → FundingScheduled → Funded → Active → [PaidOff | Defaulted]
```

**Loan states:**
```
Funded → Active → [PaidOff | Defaulted]
```

Use `canTransitionApplication(currentState, targetState)` and `canTransitionLoan(currentState, targetState)` to validate transitions before executing them.

See `docs/05_Loan_State_Machine.md` for valid transitions and guards.

### Domain Boundaries

Services map strictly to domains -- **do not mix domain logic across service boundaries**:

- **Loan Domain** -- borrower onboarding, underwriting, approval, funding
- **Servicing Domain** -- payments, amortization, delinquency, payoff
- **Investor Domain** -- onboarding, accreditation, subscriptions, capital accounts
- **Fund Domain** -- NAV calculations, capital calls, distributions, investor ledger
- **Compliance Domain** -- KYC, AML, accreditation verification, audit logs

### Event-Driven Communication

Services communicate via events, not direct DB access. Key events:

```
BorrowerApplicationSubmitted → LoanApproved → LoanFunded
CapitalCallIssued → DistributionProcessed → DocumentVerified
```

Events drive: notifications, accounting updates, audit records, workflow transitions.

---

## Database Rules

- All tables require: `id` (UUID), `created_at`, `updated_at`, `created_by`
- Financial records are **append-only** -- never silently mutate financial history
- Use fixed-precision decimals for all financial calculations (no floating point)
- Canonical schema is in `docs/Database_Schema.md` -- migrations must match it
- Each service owns its own data model; avoid cross-service DB access
- Partitioned tables (pg_partman): `audit_events` (monthly), `activity_logs` (weekly)
- All other tables are standard PostgreSQL with RLS

### Tables implemented (Phase 3 Steps 1-5):

| Step | Tables |
|---|---|
| Step 1 (Foundation) | `audit_events`, `activity_logs`, `notifications`, `tasks` |
| Step 2 (Documents) | `documents` + Supabase Storage buckets |
| Step 3 (Underwriting) | `underwriting_cases`, `underwriting_decisions`, `conditions`, `risk_flags` |
| Step 4 (Loan Lifecycle) | `loans`, `payment_schedule`, `payments`, `draws` |
| Step 5 (Fund Operations) | `funds`, `fund_subscriptions`, `fund_allocations`, `nav_snapshots` |
| Phase 4 Step 1 (Workflows) | `workflow_triggers`, `workflow_executions` |

---

## Financial Calculation Integrity

- All financial logic (amortization, NAV, waterfalls, capital balances) must use fixed-precision decimals
- Calculations must be deterministic and reproducible
- Every financial calculation path must have unit test coverage

---

## Testing Expectations

- **Unit**: financial calculations, workflow/state machine transitions
- **Integration**: service interactions, API behavior, Supabase RLS policies
- **E2E**: investor onboarding, borrower loan lifecycle, capital call execution

Tests must verify **state transitions**, not only return values.

---

## Security & Compliance

- All services enforce authentication, RBAC, and audit logging
- Sensitive actions (capital movement, loan approval, subscription approval) must emit audit events via `emitAuditEvent()`
- Row-level security (RLS) must be implemented for all Supabase tables
- Platform must support SOC2 controls, Reg A investor limits, and Reg D accredited investor verification
- Compliance systems must remain observable and data-exportable

---

## API Route Patterns

All API routes follow this pattern:
```typescript
// 1. Validate request body
const body = validateBody(req, zodSchema);
// 2. Rate limit by user ID
await applyRateLimit(req, rateLimiterInstance);
// 3. Authenticate
const user = await getUser(supabase);
// 4. Authorize
const role = await getUserRole(supabase, user.id);
// 5. Execute DB operation
// 6. Emit audit event (fire-and-forget)
emitAuditEvent({ ... });
```

### Implemented API routes:

| Domain | Routes |
|---|---|
| Documents | Upload (signed URL), admin review queue |
| Underwriting | 7 routes: cases list, case detail, assign, decision, conditions CRUD, risk flags |
| Loan Lifecycle | 6 routes: loans list, loan detail, create loan, record payment, manage draws, state transitions |
| Fund Operations | Fund subscriptions (FCFS locking), fund allocations, NAV snapshots |
| Notifications | GET /api/notifications, PATCH /api/notifications (mark all read), PATCH /api/notifications/[id] (mark single read) |
| Tasks | POST /api/tasks (create), PATCH /api/tasks/[id] (update status/fields), DELETE /api/tasks/[id] |
| Admin -- Users | PATCH /api/admin/users/[id] (update role/status) |
| Admin -- Investors | PATCH /api/admin/investors/[id] (update statuses), DELETE /api/admin/investors/[id] (with subscription guard) |
| Applications | PATCH /api/applications/[id]/fields (edit loan purpose, amount, term, exit strategy, property fields) |

---

## Implementation Phasing

| Phase | Scope | Status |
|---|---|---|
| **Phase 1** | Marketing site -- all 8 pages live, lead capture forms, email routing | ✅ Complete |
| **Phase 2** | Supabase auth + RBAC, all role dashboards, borrower portal, investor portal, admin console, underwriter workspace, servicing dashboard | ✅ Complete |
| **Phase 3** | Loan lifecycle + underwriting + document management + fund operations | ✅ Complete |
| **Phase 4** | Workflow automation (n8n) + e-signatures + OCR (Ocrolus/Argyle) + compliance hardening (KYC/AML, Reg A/D enforcement) | 🔄 In Progress |
| **Phase 5** | Tokenization layer (Base/Ethereum L2) -- HyFi vision | ⚪ Optional |

### Phase 3 Progress:

| Step | Scope | Status |
|---|---|---|
| Step 1 | Foundation: audit_events, activity_logs, notifications, tasks + pg_partman + pg_cron + state machine + Zod schemas + rate limiters | ✅ Complete |
| Step 2 | Document Management: documents table, Supabase Storage buckets, upload API (signed URLs), admin review queue, borrower upload UI | ✅ Complete |
| Step 3 | Underwriting Engine: underwriting_cases, decisions, conditions, risk_flags + pure-function rules engine + 7 API routes + underwriter UI | ✅ Complete |
| Step 4 | Loan Lifecycle: loans, payment_schedule, payments, draws tables + 6 API routes + servicing UI + loan detail + record payment + admin create-loan | ✅ Complete |
| Step 5 | Fund Operations: funds, fund_subscriptions, fund_allocations, nav_snapshots + FCFS locking + investor portfolio/statements + admin fund dashboard | ✅ Complete |

### Phase 4 Progress:

| Step | Scope | Status |
|---|---|---|
| Step 1 | Workflow Automation: workflow_triggers, workflow_executions tables + fireWorkflowTrigger engine + 6 API routes + /dashboard/admin/workflows UI + n8n inbound webhook + 5 seeded triggers wired to application/document/payment/loan events | 🔄 Partial — platform engine complete; n8n self-hosted instance not yet deployed |
| Step 2 | E-Signatures: BoldSign integration (Dropbox Sign preserved for future upgrade), signature_requests table, gate loan closing + subscription on signed docs | ✅ Complete |
| Step 3 | OCR / Document Intelligence: Ocrolus + Argyle, document_extractions table, auto-populate application fields | ⚪ Planned |
| Step 4 | Compliance Hardening: KYC (Persona), AML (OFAC SDN), Reg A investor limits, accreditation tracking | ⚪ Planned |

### Post-Phase 3 Improvements (all complete):

- **RBAC per operation**: all API routes enforce role-specific access (admin=full CRUD, manager=CRUD minus user management/investor delete, underwriter=underwriting+read, servicing=loans/payments/draws+read)
- **Admin CRUD -- Users**: PATCH /api/admin/users/[id] (role/status), EditUserRoleButton component
- **Admin CRUD -- Investors**: PATCH + DELETE /api/admin/investors/[id], fund subscription guard on delete, EditInvestorStatusButton + DeleteInvestorButton components
- **Admin CRUD -- Applications**: PATCH /api/applications/[id]/fields (loan purpose, amount, term, exit strategy, property fields), EditApplicationFieldsForm component
- **Borrower application pages**: /dashboard/borrower/applications (real list), /dashboard/borrower/applications/[id] (full detail with conditions, documents, review status), ownership-gated
- **Notifications system**: NotificationBell (nav, all roles), GET/PATCH /api/notifications, /dashboard/notifications inbox, emitNotification() helper, wired to document review + application status changes
- **Audit log viewer**: /dashboard/admin/audit (paginated, filterable by event type/entity type/date range, color-coded badges, collapsible payload)
- **Tasks system**: POST/PATCH/DELETE /api/tasks, /dashboard/admin/tasks (status tabs, priority badges, due date warnings, assignee), CreateTaskForm, TaskStatusButton, role-scoped visibility
- **New audit event types**: user_updated, investor_updated, investor_deleted; new entity type: investor
- **Updated nav**: admin/manager +Tasks +Audit Log; underwriter/servicing +Tasks
