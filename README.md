# NexusBridge CreditOS

A hybrid lending and investor platform for originating, managing, and funding short-term asset-backed bridge loans and real estate financing.

---

## Platform Vision

NexusBridge Lending addresses a persistent inefficiency in private credit markets: the gap between traditional bank financing and private capital availability. Borrowers requiring rapid access to capital — for property acquisitions, renovation funding, or closing contingencies — are frequently underserved by institutions that cannot meet their timelines. Private capital, meanwhile, is fragmented and difficult to access.

NexusBridge CreditOS is the technology infrastructure built to close that gap. It connects **borrowers** seeking short-term asset-backed financing with **investors** seeking structured, yield-generating exposure to real estate and private credit through NexusBridge Capital LP.

**Key investment characteristics of the platform:**
- Asset-backed lending strategies secured by real assets
- Short-duration loans (typically 6–12 months)
- Conservative loan-to-value ratios with diversified portfolio exposure
- Structured investor reporting and full transparency into loan performance

### HyFi — Hybrid Finance Layer

The platform is architected in two layers:

**Centralized layer (current):** Handles all regulated operations — borrower onboarding, KYC/AML compliance, document management, underwriting, loan servicing, fund accounting, and investor reporting. This layer operates under institutional-grade cloud infrastructure with full audit trails.

**Decentralized layer (Phase 5 — future):** Introduces a blockchain protocol on top of the centralized platform for transparent capital pool accounting, tokenized investor participation, on-chain distribution logic, and verifiable lending pool balances. Identity and compliance remain centralized; capital settlement infrastructure becomes programmable and transparent.

```
Off-chain lending platform  (Phases 1–4)
        ↓
NAV & accounting mirror
        ↓
Tokenization smart contracts  (Phase 5 — optional)
```

This separation ensures regulatory alignment while enabling optional DeFi integration — without disrupting core lending operations.

---

## Corporate Structure

```
Capital Edge Management, Inc. (CEM)
    └── Obsidian & Co. Holdings, LLC
            ├── NexusBridge Capital LP   ← private credit fund (Reg D / 506(c))
            └── NexusBridge Lending LLC  ← lending platform
```

---

## Entity Separation — Debt vs. Equity

Two brands. Two licenses. Two regulatory lanes. **They must never be crossed.**

| Entity | Lane | License | Website |
|---|---|---|---|
| Capital Edge Management, Inc. (CEM) | **Equity** | Real Estate License | capitaledgeinvest.com |
| NexusBridge Lending LLC | **Debt** | Lending License | nexusbridgelending.com |

**CEM owns (equity side):** Real Estate Fund (Reg A / Reg D), Crowdfund (Reg CF), Advisory / Education

**NexusBridge owns (debt side):** Bridge Loans, Renovation Financing, Asset-Backed Lending, GAP Funding, Micro-Lending, NexusBridge Capital LP (Reg D / 506(c))

> See `docs/Entity_Separation_Strategy.md` for the full separation policy and cross-reference guidelines.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser / Client                         │
│         nexusbridgelending.com  |  portal.vercel.app            │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTPS
┌────────────────────────▼────────────────────────────────────────┐
│                    Next.js App Router (Vercel)                   │
│                                                                  │
│  apps/web-marketing      apps/portal                            │
│  (marketing site)        (unified portal — all roles)           │
│                          ┌───────────────────────────────┐      │
│                          │  Middleware (IP rate limit +   │      │
│                          │  auth check + role guard)      │      │
│                          │  API Routes (Zod + RBAC + RLS) │      │
│                          └───────────────────────────────┘      │
└──────────┬──────────────────────────┬───────────────────────────┘
           │                          │
┌──────────▼──────────┐   ┌───────────▼──────────────────────────┐
│  Supabase (hosted)  │   │           Third-Party Integrations    │
│                     │   │                                       │
│  PostgreSQL + RLS   │   │  BoldSign       — e-signatures        │
│  Auth (PKCE/OTP)    │   │  n8n            — workflow automation │
│  Storage (docs)     │   │  Resend         — transactional email │
│  Realtime           │   │  Upstash Redis  — rate limiting       │
│  pg_partman         │   │  Plaid          — bank verification   │
│  pg_cron            │   │  PostHog        — analytics           │
└─────────────────────┘   │  Sentry         — error monitoring    │
                          └───────────────────────────────────────┘
```

### Core Engines

| Engine | Description |
|---|---|
| Underwriting Rules Engine | Pure-function risk scoring, LTV checks, condition generation |
| Loan State Machine | Enforces valid application and loan state transitions |
| Workflow Automation Engine | Event-driven triggers → n8n webhooks → automated actions |
| Fund Accounting Engine | FCFS subscriptions, NAV snapshots, capital allocations |
| Audit & Compliance Engine | Append-only audit events, partitioned by month (pg_partman) |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui |
| Backend | Supabase (PostgreSQL, Auth, Storage, Realtime) |
| ORM | Drizzle ORM (type-safe, Supabase Transaction Pooler on port 6543) |
| Rate Limiting | Upstash Redis (serverless, Edge-compatible) |
| Email | Resend SDK |
| E-Signatures | BoldSign (Dropbox Sign preserved for future upgrade) |
| Workflow Automation | n8n (self-hosted, platform engine complete) |
| Hosting | Vercel (frontend) |
| Monorepo | Turborepo (planned) |
| Integrations | Plaid, PostHog, Sentry |

---

## Monorepo Structure

```
apps/
  web-marketing/   # Marketing site — live on Vercel (localhost:3000)
  portal/          # Unified portal — Phase 4 in progress (localhost:3001)
services/          # Backend domain services (scaffolding only)
core/              # Shared libraries (scaffolding only)
infrastructure/    # Docker, Terraform, CI/CD (scaffolding only)
compliance/        # SOC2, Reg A, Reg D artifacts
docs/              # Architecture and implementation documentation
```

---

## Security Architecture

Every request passes through six enforcement layers in order:

```
1. Middleware          — IP rate limit (Upstash) → auth check → role route guard
2. validateBody()      — Zod schema validation → 400 if invalid
3. applyRateLimit()    — Upstash user-ID counter → 429 if exceeded
4. getUser()           — Supabase session → 401 if not authenticated
5. getUserRole()       — user_roles table lookup → 403 if wrong role
6. DB operation        — Supabase RLS enforces row-level access
```

All sensitive actions emit append-only audit events. Row-level security (RLS) is enforced on every Supabase table. The platform is designed to support SOC2 controls, Reg A investor limits, and Reg D accredited investor verification.

---

## Roles

Six roles are implemented with scoped access and navigation:

| Role | Access | Navigation |
|---|---|---|
| `borrower` | Apply for loans, upload documents, view application status, receive notifications | Dashboard, My Applications, Documents, Notifications |
| `investor` | View portfolio, fund subscriptions, statements, receive notifications | Dashboard, Portfolio, Statements, Notifications |
| `admin` | Full CRUD: applications, investors, users, documents, underwriting, tasks, workflows, audit log, invite users | Dashboard, Applications, Investors, Documents, Underwriting, Users, Tasks, Workflows, Audit Log, Invite User |
| `manager` | Same as admin minus user management and investor delete | Dashboard, Applications, Investors, Documents, Tasks, Audit Log, Invite User |
| `underwriter` | Underwriting cases assigned to them, record decisions, add conditions, own tasks | Dashboard, Cases, Tasks |
| `servicing` | Loan management, record payments, manage draws, own tasks | Dashboard, Loans, Tasks |

---

## Roadmap

### Phase 1 — Marketing Site ✅ Complete
- 8-page marketing site live on Vercel at nexusbridgelending.com
- Lead capture forms with email routing via Resend
- Entity-separated content (debt products only)

### Phase 2 — Auth + Portals ✅ Complete
- Supabase auth (magic link, invite, PKCE flow)
- All 6 role dashboards: borrower, investor, admin, manager, underwriter, servicing
- RBAC middleware + route guards

### Phase 3 — Loan Lifecycle + Fund Operations ✅ Complete
- **Step 1:** Foundation — audit events (partitioned), activity logs, notifications, tasks, pg_partman, state machine, Zod schemas, rate limiters
- **Step 2:** Document Management — documents table, Supabase Storage, signed upload URLs, admin review queue
- **Step 3:** Underwriting Engine — underwriting cases, decisions, conditions, risk flags, pure-function rules engine, 7 API routes
- **Step 4:** Loan Lifecycle — loans, payment schedule, payments, draws, 6 API routes, servicing UI
- **Step 5:** Fund Operations — funds, subscriptions (FCFS locking), allocations, NAV snapshots, investor portfolio/statements

### Phase 4 — Workflow Automation + E-Signatures 🔄 In Progress
- **Step 1:** Workflow Automation — `workflow_triggers`, `workflow_executions` tables, `fireWorkflowTrigger` engine, 6 API routes, admin workflows UI, 5 seeded triggers wired to application/document/payment/loan events
  - Platform engine: ✅ Complete
  - n8n self-hosted instance: ⚪ Not yet deployed
- **Step 2:** E-Signatures (BoldSign) — `signature_requests` table, BoldSign REST integration, send/void/resend API routes, webhook handler, auto-transition application to funded on loan doc signing, auto-activate subscription on agreement signing ✅ Complete
- **Step 3:** OCR / Document Intelligence — Ocrolus + Argyle, `document_extractions` table, auto-populate application fields ⚪ Planned
- **Step 4:** Compliance Hardening — KYC (Persona), AML (OFAC SDN), Reg A investor limits, accreditation tracking ⚪ Planned

### Phase 5 — Tokenization Layer ⚪ Optional / Future
- Blockchain protocol layer on Base / Ethereum L2
- Tokenized investor participation (ERC-20 or ERC-1400)
- On-chain NAV mirror, distribution logic, verifiable pool balances
- Smart contract bridge between off-chain lending records and on-chain positions
- Designed as an additive layer — core lending platform is unaffected

---

## Running Locally

### Prerequisites

- Node.js 18+
- npm 9+
- Supabase CLI (for local backend development)

### Marketing Site (port 3000)

```bash
cd apps/web-marketing
npm install
npm run dev
```

Requires `apps/web-marketing/.env.local`:
```
RESEND_API_KEY=your_key_here
```

### Portal (port 3001)

```bash
cd apps/portal
npm install
npm run dev
```

Requires `apps/portal/.env.local` with Supabase and Upstash credentials, plus:
```
N8N_WEBHOOK_SECRET=your_shared_hmac_secret_here
BOLDSIGN_API_KEY=your_boldsign_api_key_here
BOLDSIGN_WEBHOOK_SECRET=your_boldsign_webhook_secret_here
BOLDSIGN_TEMPLATE_PROMISSORY_NOTE=your_template_id_here
BOLDSIGN_TEMPLATE_DEED_OF_TRUST=your_template_id_here
BOLDSIGN_TEMPLATE_LOAN_AGREEMENT=your_template_id_here
BOLDSIGN_TEMPLATE_SUBSCRIPTION_AGREEMENT=your_template_id_here
```

### Supabase (local)

```bash
supabase start           # Start local Supabase stack
supabase db reset        # Reset and re-apply migrations
supabase functions serve # Serve Edge Functions locally
```

---

## Key Documentation

| Topic | File |
|---|---|
| Platform vision and goals | `docs/01_Platform_Overview.md` |
| Architecture and tech stack | `docs/02_System_Architecture.md` |
| Workflows and user journeys | `docs/03_Platform_Workflows.md` |
| Developer guide | `docs/04_Developer_Guide.md` |
| Loan state machine | `docs/05_Loan_State_Machine.md` |
| Capital waterfall logic | `docs/06_Capital_Waterfall_Logic.md` |
| Underwriting rules engine | `docs/07_Underwriting_Rules_Engine.md` |
| Servicing and ledger model | `docs/08_Servicing_Ledger_Model.md` |
| SOC2 implementation | `docs/09_SOC2_Implementation_Protocol.md` |
| Document management | `docs/10_Document_Management.md` |
| Data security and audit | `docs/11_Data_Security_Audit_Framework.md` |
| Institutional ledger | `docs/12_Institutional_Ledger_Architecture.md` |
| Event-driven workflow engine | `docs/13_Event_Driven_Workflow_Engine.md` |
| Reg A / Reg D compliance | `docs/14_RegA_RegD_Compliance_System.md` |
| Database infrastructure | `docs/15_Database_Infrastructure.md` |
| Database schema (canonical) | `docs/Database_Schema.md` |
| Entity separation strategy | `docs/Entity_Separation_Strategy.md` |

---

## License

Proprietary. All rights reserved. NexusBridge Lending LLC / Capital Edge Management, Inc.
