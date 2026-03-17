# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

NexusBridge CreditOS is a hybrid financial infrastructure platform connecting borrowers seeking short-term asset-backed financing (bridge loans, real estate) with investors seeking yield-generating private credit exposure. It handles Reg A/D offerings, investor management, fund accounting, and borrower workflows.

**Business model**: Originate and manage short-duration loans (6–12 months), secured by real assets, with conservative LTV ratios. Investors participate through NexusBridge Capital LP. Long-term vision includes a hybrid "HyFi" layer — blockchain-based tokenized participation on top of the centralized lending platform.

The marketing site (`apps/web-marketing`) is **live on Vercel**. All other `apps/`, `services/`, `core/`, and `infrastructure/` directories are scaffolding pending Phase 2.

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
| **Entity separation (debt vs. equity)** | **`docs/Entity_Separation_Strategy.md`** |

UI/UX rules are in `CLAUDE_Web_Design.md` (marketing site) and `CLAUDE_App_UI.md` (application portals).

---

## Entity Separation — Critical Rule

Two brands. Two licenses. Two regulatory lanes. **Never cross them.**

| Entity | Lane | License | Website |
|---|---|---|---|
| Capital Edge Management, Inc. (CEM) | **Equity** | Real Estate License | capitaledgeinvest.com |
| NexusBridge Lending LLC | **Debt** | Lending License | nexusbridgelending.com |

### CEM owns (equity side):
- Real Estate Fund (Reg A / Reg D) — income-producing, value-add, distressed properties
- Crowdfund (Reg CF) — startups and growth-stage companies
- Advisory / Education

### NexusBridge owns (debt side):
- Bridge Loans, Renovation Financing, Asset-Backed Lending, GAP Funding, Micro-Lending
- NexusBridge Capital LP — private credit fund (Reg D / 506(c)), investor access to loan portfolio

### Rules for all code and content decisions:
- **No equity investment products on the NexusBridge site**
- **No lending or debt products on the CEM site**
- The CEM Credit Fund (Asset-Backed, GAP, Micro-Lending) belongs to NexusBridge — it must not appear on capitaledgeinvest.com
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

- **Frontend**: Next.js + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Edge Functions)
- **Monorepo tooling**: TBD (Turborepo or Nx expected)
- **Infrastructure**: Vercel (frontend), Docker, Terraform
- **Integrations**: Plaid, PostHog, Sentry, n8n (automation)

---

## Build & Dev Commands

### Marketing site (`apps/web-marketing`) — live
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

### Monorepo (Phase 2 — not yet scaffolded)
```bash
# Root-level commands once Turborepo/Nx is configured
npm run dev              # Start all apps
npm run build            # Build all packages
npm run lint             # Lint all packages
npm run test             # Run all tests
```

### Supabase local development (Phase 2)
```bash
supabase start           # Start local Supabase stack
supabase db reset        # Reset and re-apply migrations
supabase functions serve # Serve Edge Functions locally
```

---

## Architecture

### Monorepo Structure

```
apps/          # Next.js frontends (borrower-portal, investor-portal, underwriting-console, admin-console, web-marketing)
services/      # Backend domain services (loan-origination, servicing, investor, fund-accounting, compliance, notifications)
core/          # Shared: database schema, auth, event-bus, shared-models, ui-components, design-tokens
infrastructure/ # Docker, Terraform, Kubernetes, CI/CD
compliance/    # SOC2, Reg A, Reg D artifacts
docs/          # Architecture documentation
```

### Domain Boundaries

Services map strictly to domains — **do not mix domain logic across service boundaries**:

- **Loan Domain** — borrower onboarding, underwriting, approval, funding
- **Servicing Domain** — payments, amortization, delinquency, payoff
- **Investor Domain** — onboarding, accreditation, subscriptions, capital accounts
- **Fund Domain** — NAV calculations, capital calls, distributions, investor ledger
- **Compliance Domain** — KYC, AML, accreditation verification, audit logs

### Event-Driven Communication

Services communicate via events, not direct DB access. Key events:

```
BorrowerApplicationSubmitted → LoanApproved → LoanFunded
CapitalCallIssued → DistributionProcessed → DocumentVerified
```

Events drive: notifications, accounting updates, audit records, workflow transitions.

### Loan State Machine

```
ApplicationSubmitted → DocumentsPending → UnderwritingReview →
Approved → FundingScheduled → Funded → Active → [PaidOff | Defaulted]
```

See `docs/05_Loan_State_Machine.md` for valid transitions and guards.

---

## Database Rules

- All tables require: `id` (UUID), `created_at`, `updated_at`, `created_by`
- Financial records are **append-only** — never silently mutate financial history
- Use fixed-precision decimals for all financial calculations (no floating point)
- Canonical schema is in `docs/Database_Schema.md` — migrations must match it
- Each service owns its own data model; avoid cross-service DB access

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
- Sensitive actions (capital movement, loan approval, subscription approval) must emit audit events
- Row-level security (RLS) must be implemented for all Supabase tables
- Platform must support SOC2 controls, Reg A investor limits, and Reg D accredited investor verification
- Compliance systems must remain observable and data-exportable

---

## Implementation Phasing

1. **Phase 1** — Marketing site + borrower/investor dashboards + auth + RBAC
2. **Phase 2** — Full loan lifecycle + underwriting + document management + fund operations
3. **Phase 3** — Workflow automation + OCR (Ocrolus/Argyle) + compliance hardening
4. **Phase 4** — Tokenization layer (Base/Ethereum L2, optional)
