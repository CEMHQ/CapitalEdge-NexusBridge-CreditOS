# NexusBridge CreditOS

**NexusBridge CreditOS** is the core technology platform powering NexusBridge Lending and NexusBridge Capital LP — a hybrid private credit infrastructure connecting real estate borrowers with institutional private capital.

> Managed by **Capital Edge Management** through **Obsidian & Co. Holdings, LLC**

---

## Corporate Structure

```
Capital Edge Management, Inc. (CEM)
└── Obsidian & Co. Holdings, LLC
    ├── NexusBridge Capital LP      — Reg D / 506(c) private credit fund
    └── NexusBridge Lending LLC     — Lending origination & servicing platform
```

---

## Entity Separation — Debt vs. Equity

Two brands. Two licenses. Two regulatory lanes.

| Entity | Lane | License | Website |
|---|---|---|---|
| Capital Edge Management, Inc. | **Equity** | Real Estate License | capitaledgeinvest.com |
| NexusBridge Lending LLC | **Debt** | Lending License | nexusbridgelending.com |

**Capital Edge Management owns (equity):**
- Real Estate Fund — income-producing, value-add, distressed properties (Reg A / Reg D)
- Crowdfund — startups and growth-stage companies (Reg CF)
- Advisory and financial education

**NexusBridge Lending owns (debt):**
- Bridge Loans, Renovation Financing, Asset-Backed Lending, GAP Funding, Micro-Lending
- NexusBridge Capital LP — private credit fund giving accredited investors exposure to the loan portfolio (Reg D / 506(c))

> See `docs/Entity_Separation_Strategy.md` for the full separation policy, migration rules, and cross-reference guidelines.

---

## What This Platform Does

NexusBridge addresses a common inefficiency in private credit markets: the gap between the speed that real estate investors require and what traditional financial institutions can provide.

**For Borrowers**
- Short-term bridge loans (6–12 months) secured by real property
- Renovation / fix-and-flip financing with draw schedules
- Asset-backed lending, GAP funding, and micro-lending products
- Fast underwriting and funding — 7 to 14 business days from approval

**For Investors**
- Structured exposure to short-duration, asset-backed credit via NexusBridge Capital LP
- Reg D / Rule 506(c) offering — accredited investors only
- Capital deployed across Asset-Backed Lending, GAP Funding, and Micro-Lending strategies
- Investor portal with capital account tracking, distributions, and reporting (Phase 2)

**Long-Term Vision**
A hybrid "HyFi" layer introducing blockchain-based settlement and tokenized investor participation on top of the centralized lending platform — without compromising regulatory compliance.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router, Turbopack), TypeScript, Tailwind CSS v4, shadcn/ui v4 |
| Database | Supabase (PostgreSQL 17 + pg_partman extension) |
| ORM | Drizzle ORM — type-safe, FCFS locking, Supabase Transaction Pooler (port 6543) |
| Auth & Storage | Supabase Auth, Supabase Storage |
| Real-time | Supabase Realtime (WebSocket subscriptions) |
| Background Jobs | Supabase Edge Functions |
| Email | Resend SDK |
| Monorepo | Turborepo (planned) |
| Hosting | Vercel (frontend) |
| Integrations | Plaid, DocuSign/HelloSign, PostHog, Sentry, n8n |
| Compliance | Reg D / 506(c), Reg CF, KYC/AML, SOC 2 alignment |

### Database Architecture

The platform uses a **hybrid relational + time-series architecture** within a single Supabase instance:

| Layer | Purpose | Implementation |
|---|---|---|
| Relational (ACID) | Loans, investors, subscriptions, KYC/AML — source of truth | PostgreSQL with RLS |
| Time-series | Payments, audit logs, fund ticks, onboarding events — high-frequency streams | pg_partman partitioned tables |
| FCFS Locking | Capital contribution reservation — prevents fund oversubscription | `SELECT ... FOR UPDATE` via Drizzle transactions |
| Real-time | Live onboarding dashboard, fund fill rate, investor alerts | Supabase Realtime (WebSockets) |

**7 tables partitioned via pg_partman:**
`payments` · `audit_events` · `activity_logs` · `loan_draws` · `distributions` · `fund_ticks` · `onboarding_events`

> See `docs/15_Database_Infrastructure.md` for full configuration, partition SQL, pg_partman setup, FCFS locking patterns, and the QuestDB upgrade path.

---

## Repository Structure

```
apps/
  web-marketing/        ← Marketing website (Phase 1 — live)
  borrower-portal/      ← Borrower dashboard (Phase 2)
  investor-portal/      ← Investor dashboard (Phase 2)
  underwriting-console/ ← Internal underwriting tools (Phase 2)
  admin-console/        ← Platform admin (Phase 2)

services/               ← Backend domain services (Phase 2)
  loan-origination/
  servicing/
  investor/
  fund-accounting/
  compliance/
  notifications/

core/                   ← Shared libraries (Phase 2)
  database/
  auth/
  event-bus/
  ui-components/

infrastructure/         ← Docker, Terraform, CI/CD (Phase 2)
compliance/             ← SOC2, Reg A/D artifacts
docs/                   ← Architecture documentation
images/                 ← Brand assets
```

---

## Implementation Phases

| Phase | Scope | Status |
|---|---|---|
| **Phase 1** | Marketing site — all 8 pages live, lead capture forms, email routing | ✅ Complete |
| **Phase 2** | Supabase auth + RBAC, borrower portal, investor portal, domain migration | 🔵 Next |
| **Phase 3** | Full loan lifecycle + underwriting + document management + fund operations | ⚪ Planned |
| **Phase 4** | Workflow automation + OCR (Ocrolus/Argyle) + compliance hardening | ⚪ Planned |
| **Phase 5** | Tokenization layer (Base/Ethereum L2) — HyFi vision | ⚪ Optional |

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+
- Supabase CLI (for backend development)

### Marketing Website (Phase 1)

```bash
cd apps/web-marketing
npm install
npm run dev
# → http://localhost:3000
```

### Supabase Local Development

```bash
supabase start           # Start local Supabase stack
supabase db reset        # Reset and re-apply migrations
supabase functions serve # Serve Edge Functions locally
```

---

## Documentation

| Topic | File |
|---|---|
| Platform vision & goals | `docs/01_Platform_Overview.md` |
| Architecture & tech stack | `docs/02_System_Architecture.md` |
| Workflows & user journeys | `docs/03_Platform_Workflows.md` |
| Implementation phasing | `docs/04_Developer_Guide.md` |
| Loan state machine | `docs/05_Loan_State_Machine.md` |
| Capital waterfall logic | `docs/06_Capital_Waterfall_Logic.md` |
| Underwriting rules engine | `docs/07_Underwriting_Rules_Engine.md` |
| Servicing & ledger model | `docs/08_Servicing_Ledger_Model.md` |
| SOC2 implementation | `docs/09_SOC2_Implementation_Protocol.md` |
| Document management | `docs/10_Document_Management.md` |
| Data security & audit | `docs/11_Data_Security_Audit_Framework.md` |
| Institutional ledger | `docs/12_Institutional_Ledger_Architecture.md` |
| Event-driven workflow engine | `docs/13_Event_Driven_Workflow_Engine.md` |
| Reg A / Reg D compliance | `docs/14_RegA_RegD_Compliance_System.md` |
| Database schema (canonical) | `docs/Database_Schema.md` |
| **Entity separation (debt vs. equity)** | **`docs/Entity_Separation_Strategy.md`** |

---

## Key Engineering Rules

- **Financial calculations** — fixed-precision decimals only, no floating point
- **Financial records** — append-only; never silently mutate history
- **Service boundaries** — services communicate via events, not direct DB access
- **Security** — RLS on all Supabase tables; RBAC enforced at every service layer
- **Compliance** — all sensitive actions emit audit events

---

## License

Proprietary. All rights reserved. © NexusBridge Lending / Capital Edge Management.
