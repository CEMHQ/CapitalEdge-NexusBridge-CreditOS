# NexusBridge System Architecture

This document defines the technical architecture for the NexusBridge Lending platform. The system is designed as a modular fintech infrastructure supporting centralized lending operations, Reg A/D investor management, and an optional decentralized protocol layer in later phases.

---

## 1. Architecture Overview

The platform is organized into four primary layers:

1. **Frontend Layer** — Next.js portals for borrowers, investors, and internal staff
2. **Backend Layer** — Server Actions, API routes, and Edge Functions
3. **Data Infrastructure Layer** — Supabase (PostgreSQL + TimescaleDB) with Drizzle ORM
4. **Optional Protocol Layer** — Blockchain settlement and tokenized participation (Phase 5)

---

## 2. Frontend Layer

| App | Audience | Status |
|---|---|---|
| `apps/web-marketing` | Public — borrowers and investors | ✅ Live |
| `apps/borrower-portal` | Authenticated borrowers | Phase 2 |
| `apps/investor-portal` | Authenticated accredited investors | Phase 2 |
| `apps/underwriting-console` | Internal underwriting team | Phase 2 |
| `apps/admin-console` | Platform administrators | Phase 3 |

**Stack**: Next.js 16 (App Router, Turbopack), TypeScript, Tailwind CSS v4, shadcn/ui v4

Frontend communicates with the backend exclusively through:
- Next.js **Server Actions** for transactional/financial operations (FCFS locking, capital commitments)
- Next.js **API Routes** for form handling and webhook ingestion
- **Supabase Client** for auth, real-time subscriptions, and file storage

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

### Time-Series Performance — TimescaleDB Extension
Enabled within Supabase. High-frequency append-only tables are converted to **hypertables** for consistent write performance and automatic time-based partitioning:

| Table | Why Hypertable |
|---|---|
| `payments` | Every loan repayment event |
| `audit_events` | Immutable compliance/security log |
| `activity_logs` | High-frequency user-facing events |
| `loan_draws` | Draw disbursement events |
| `distributions` | Investor distribution events |
| `fund_ticks` | Real-time investor activity stream |
| `onboarding_events` | Investor onboarding funnel tracking |

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

| Control | Implementation |
|---|---|
| Authentication | Supabase Auth (email/password, magic link, MFA) |
| Authorization | RBAC via `roles` + `organization_members` tables |
| Row-level security | Supabase RLS policies on every table |
| Audit logging | Immutable `audit_events` hypertable |
| Document access | Supabase Storage + RLS policies |
| Secrets management | Vercel environment variables |
| Transport security | TLS everywhere; no plaintext credentials |
| Financial integrity | Fixed-precision decimals (`numeric(18,2)`) throughout |

---

## 8. Infrastructure and Deployment

| Component | Service |
|---|---|
| Frontend hosting | Vercel (auto-deploy from `main`) |
| Database | Supabase (managed PostgreSQL + TimescaleDB) |
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
| Phase 2 | Supabase setup, TimescaleDB, Drizzle ORM, Auth, RBAC, borrower + investor portals |
| Phase 3 | Full loan lifecycle, underwriting engine, document OCR, fund accounting |
| Phase 4 | Workflow automation (n8n), compliance hardening, SOC 2 controls |
| Phase 5 | Tokenization layer (Base/Ethereum L2) |
