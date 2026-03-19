# NexusBridge System Architecture

This document defines the technical architecture for the NexusBridge Lending platform. The system is designed as a modular fintech infrastructure supporting centralized lending operations, Reg A/D investor management, and an optional decentralized protocol layer in later phases.

---

## 1. Architecture Overview

The platform is organized into four primary layers:

1. **Frontend Layer** — Next.js portals for borrowers, investors, and internal staff
2. **Backend Layer** — Server Actions, API routes, and Edge Functions
3. **Data Infrastructure Layer** — Supabase (PostgreSQL + pg_partman) with Drizzle ORM
4. **Optional Protocol Layer** — Blockchain settlement and tokenized participation (Phase 5)

---

## 2. Frontend Layer

| App | Audience | Status |
|---|---|---|
| `apps/web-marketing` | Public — borrowers and investors | ✅ Live |
| `apps/portal` | Unified portal: borrower, investor, admin, underwriting, servicing | 🔵 Phase 2 |

**Stack**: Next.js 16 (App Router, Turbopack), TypeScript, Tailwind CSS v4, shadcn/ui v4

`apps/portal` uses RBAC route guards enforced at the middleware layer. All six roles (`borrower`, `investor`, `admin`, `manager`, `underwriter`, `servicing`) are served from a single app with per-role dashboard routes.

Frontend communicates with the backend exclusively through:
- Next.js **API Routes** for all form submissions and data mutations
- **Supabase Client** for auth operations only (sign in, sign out, sign up)
- Server Components query Supabase server-side via the session-aware server client — never the browser client

---

## 3. Backend Layer

### Server Actions (Transactional Logic)
Server Actions handle all high-stakes financial operations. These run server-side and must never be replicated client-side:
- Capital commitment reservation (FCFS locking)
- Loan approval and funding state transitions
- Distribution processing
- KYC/AML status updates

### API Routes
Standard Next.js API routes handle:
- Form submissions (contact, apply, newsletter)
- Incoming webhooks (Plaid, DocuSign, n8n)
- Notification dispatch

### Supabase Edge Functions
Long-running or scheduled background operations:
- Capital call issuance
- Delinquency detection and escalation
- Investor statement generation
- Reg A investor limit checks

---

## 4. Data Infrastructure Layer

See `docs/15_Database_Infrastructure.md` for full detail. Summary:

### Primary Database — Supabase (PostgreSQL)
Stores all regulated, relational "source of truth" data:
- User profiles, organizations, RBAC roles
- Loan applications, underwriting decisions, funded loans
- Investor subscriptions, capital calls, allocations
- Compliance records, KYC/AML status

### Time-Series Performance — pg_partman Extension
Enabled within Supabase. High-frequency append-only tables are declared as `PARTITION BY RANGE` and managed by **pg_partman** for consistent write performance and automatic time-based partitioning. TimescaleDB is not used — it does not support PostgreSQL 17, which Supabase provisions by default.

| Table | Why Partitioned |
|---|---|
| `payments` | Every loan repayment event |
| `audit_events` | Immutable compliance/security log |
| `activity_logs` | High-frequency user-facing events |
| `loan_draws` | Draw disbursement events |
| `distributions` | Investor distribution events |
| `fund_ticks` | Real-time investor activity stream |
| `onboarding_events` | Investor onboarding funnel tracking |

Partition maintenance runs hourly via `pg_cron`: `SELECT partman.run_maintenance_proc()`

### ORM — Drizzle ORM
Drizzle is used for all backend data access requiring:
- Transactional integrity (FCFS locking, capital reservation)
- Complex joins and aggregations
- Raw SQL escape hatches for recursive CTEs and amortization logic

Connected via Supabase **Transaction Pooler** (port 6543) for full transaction support.

Supabase JS client is used for:
- Authentication and session management
- File storage (documents, agreements)
- Real-time subscriptions

### FCFS Concurrency Control
Capital contributions use **pessimistic locking** to prevent oversubscription:
```sql
SELECT * FROM funds WHERE id = $1 FOR UPDATE
```
This locks the fund row for the duration of the transaction. No two investors can claim the last available capacity simultaneously.

### Real-Time — Supabase Realtime
WebSocket subscriptions power live dashboard updates:
- Onboarding heatmap (KYC progress, document signing status)
- Fund fill rate (remaining capacity updated as commitments land)
- Internal team alerts for high-value Reg D investor activity

---

## 5. Service Domains

Services communicate via events — no direct cross-service database access.

| Service | Responsibility |
|---|---|
| Identity Service | Auth, RBAC, profile management |
| Borrower Service | Onboarding, applications, KYC/AML |
| Underwriting Engine | Case management, decisions, conditions |
| Loan Servicing Engine | Payments, draws, delinquency, payoff |
| Investor Portal | Onboarding, accreditation, subscriptions |
| Fund Accounting Engine | NAV, capital calls, distributions, ledger |
| Compliance Engine | Reg A limits, Reg D verification, audit |
| Document Processing | Upload, OCR extraction, review flags |
| Audit & Security Service | Immutable event log, access records |

### Event Bus

Initial deployment uses **PostgreSQL LISTEN/NOTIFY** via Supabase. Migrate to Kafka, NATS, or Redis Streams when event volume warrants it.

Key events:

```
ApplicationSubmitted → UnderwritingCaseCreated → DocumentVerified
LoanApproved → FundingScheduled → LoanFunded → PaymentReceived
CapitalCallIssued → CommitmentReserved → CommitmentFunded
DistributionPosted → InvestorStatementGenerated
```

---

## 6. Loan State Machine

```
ApplicationSubmitted → DocumentsPending → UnderwritingReview →
ConditionallyApproved → Approved → FundingScheduled →
Funded → Active → [PaidOff | Defaulted | ChargedOff]
```

See `docs/05_Loan_State_Machine.md` for valid transitions and guards.

---

## 7. Security Architecture

### Defense-in-Depth Layers

Requests pass through six sequential enforcement layers. A breach at any one layer is contained by the layers below it.

| Layer | Where | What it enforces |
|---|---|---|
| **1. Vercel WAF / Spend Cap** | Infrastructure | DDoS mitigation, hard billing cap to prevent runaway costs |
| **2. Middleware (proxy.ts)** | Next.js Edge | IP-based rate limiting for public endpoints, auth presence, role-based route access |
| **3. API Route** | Next.js Server | Zod input validation, per-user rate limiting (Upstash), role authorization (DB lookup) |
| **4. Supabase RLS** | PostgreSQL | Row-level enforcement — prevents data access even if layers above are bypassed |
| **5. Drizzle ORM** | Server | Parameterized queries — SQL injection prevention by construction |
| **6. Budget Alerts** | Vercel + Supabase + Upstash | Detects and caps volumetric billing attacks |

### Rate Limiting

Upstash Redis serves as the rate-limit counter store — serverless-native, Edge-compatible, sub-millisecond.

| Endpoint | Identifier | Limit | Window |
|---|---|---|---|
| Signup | IP | 5 requests | 10 min |
| Forgot password | IP | 3 requests | 15 min |
| Submit application | User ID | 5 requests | 1 hour |
| Invite user | User ID | 20 requests | 1 hour |
| Status / metrics update | User ID | 60 requests | 1 hour |

### Role-Based Access Control

Roles are stored in the `user_roles` table — not in JWT metadata. All role checks (middleware, API routes, RLS `is_admin()` function) query this table.

Public signups are forced to `borrower` at the database trigger level regardless of what the client sends. Invite-only roles (`investor`, `admin`, `manager`, `underwriter`, `servicing`) are seeded by the invite API route using the service role key.

### Environment Variable Classification

| Variable | Exposed to browser | Safe |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | ✅ — public URL by design |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | ✅ — security comes from RLS, not hiding this key |
| `NEXT_PUBLIC_APP_URL` | Yes | ✅ — not a secret |
| `SUPABASE_SERVICE_ROLE_KEY` | No | ✅ — server-only, guarded with `import 'server-only'` |
| `DATABASE_URL` | No | ✅ — server-only |
| `NEXUSBRIDGE_PORTAL_KEY` | No | ✅ — Resend API key, server-only |
| `UPSTASH_REDIS_REST_URL` | No | ✅ — server-only |
| `UPSTASH_REDIS_REST_TOKEN` | No | ✅ — server-only |

### Authentication Flows

Two server-side routes handle all post-auth redirects. Raw JWTs are never exposed in the URL.

| Flow | Route | Method | Detail |
|---|---|---|---|
| Invite (email) | `/auth/confirm` | `verifyOtp(token_hash)` | Supabase email template sends `{{ .TokenHash }}` as a query param — hashed, not the raw JWT. Verified server-side, then redirected to `/set-password`. |
| Password reset | `/auth/confirm` | `verifyOtp(token_hash)` | Same token_hash flow as invite. |
| Magic link | `/auth/callback` | `exchangeCodeForSession(code)` | PKCE — browser client generates a code verifier stored in cookies. Auth server returns a one-time `code`, exchanged server-side. |
| OAuth (future) | `/auth/callback` | `exchangeCodeForSession(code)` | Same PKCE flow as magic link. |

**PKCE** (`flowType: 'pkce'`) is configured on the browser Supabase client. It prevents authorization code interception — even if someone intercepts the redirect URL, they cannot exchange the code without the code verifier stored in the user's cookies.

**Invite flow does not use PKCE** because invites are server-initiated (no browser session exists when the admin sends the invite). `verifyOtp(token_hash)` is the correct server-side equivalent for this case.

### Controls Summary

| Control | Implementation |
|---|---|
| Authentication | Supabase Auth — password, invite (token_hash), magic link + OAuth (PKCE) |
| Authorization | `user_roles` table — DB-verified RBAC |
| Row-level security | Supabase RLS on every table |
| Rate limiting | Upstash Redis — IP and user-based |
| Input validation | Zod schemas on every API route |
| Auth token safety | Invite/reset: hashed token in query param · Magic link/OAuth: PKCE code flow |
| Audit logging | Immutable `audit_events` table (Phase 3) |
| Secrets management | Vercel environment variables + `server-only` imports |
| Transport security | TLS everywhere |
| Financial integrity | Fixed-precision decimals (`numeric(18,2)`) throughout |

---

## 8. Infrastructure and Deployment

| Component | Service |
|---|---|
| Frontend hosting | Vercel (auto-deploy from `main`) |
| Database | Supabase (managed PostgreSQL 17 + pg_partman) |
| Rate limit store | Upstash Redis — serverless, Edge-compatible |
| File storage | Supabase Storage |
| Background jobs | Supabase Edge Functions |
| Email delivery | Resend |
| Source control | GitHub — `CEMHQ/CapitalEdge-NexusBridge-CreditOS` |
| CI/CD | GitHub Actions → Vercel (Phase 2) |
| Staging environment | Separate Supabase project + Vercel preview (Phase 2) |

---

## 9. Optional Protocol Layer (Phase 5)

Blockchain infrastructure remains fully independent of core lending operations.

Potential components:
- Smart contract lending pools
- Tokenized investor participation (ERC-1400 or similar)
- Blockchain event indexing (The Graph)
- Proof-of-reserve transparency

This layer connects to the platform via events — it does not have direct database access.

---

## 10. Phase Delivery Map

| Phase | Data Infrastructure Additions |
|---|---|
| Phase 1 | Marketing site, Resend email — **complete** |
| Phase 2 | Supabase setup, pg_partman, Drizzle ORM, Auth, RBAC, borrower + investor portals |
| Phase 3 | Full loan lifecycle, underwriting engine, document OCR, fund accounting |
| Phase 4 | Workflow automation (n8n), compliance hardening, SOC 2 controls |
| Phase 5 | Tokenization layer (Base/Ethereum L2) |
