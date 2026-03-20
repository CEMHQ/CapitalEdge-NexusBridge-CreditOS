# NexusBridge CreditOS

A hybrid lending and investor platform for originating, managing, and funding short-term asset-backed bridge loans and real estate financing.

---

## What is NexusBridge CreditOS?

NexusBridge CreditOS connects **borrowers** seeking short-term asset-backed financing (bridge loans, renovation financing, GAP funding) with **investors** seeking yield-generating private credit exposure through NexusBridge Capital LP.

The platform handles the full lifecycle: borrower applications, document management, underwriting, loan servicing, fund operations, investor onboarding, Reg A/D compliance, e-signatures, and workflow automation.

**Marketing site**: Live on Vercel at [nexusbridgelending.com](https://nexusbridgelending.com) (Phase 1 complete)
**Portal**: Live on Vercel (Phase 4 in progress -- workflow automation + e-signatures complete)

---

## Corporate Structure

```
Capital Edge Management, Inc. (CEM)
    └── Obsidian & Co. Holdings, LLC
            ├── NexusBridge Capital LP   ← private credit fund (Reg D / 506(c))
            └── NexusBridge Lending LLC  ← lending platform
```

---

## Entity Separation -- Debt vs. Equity

Two brands. Two licenses. Two regulatory lanes. **They must never be crossed.**

| Entity | Lane | License | Website |
|---|---|---|---|
| Capital Edge Management, Inc. (CEM) | **Equity** | Real Estate License | capitaledgeinvest.com |
| NexusBridge Lending LLC | **Debt** | Lending License | nexusbridgelending.com |

**CEM owns (equity side):**
- Real Estate Fund (Reg A / Reg D) -- income-producing, value-add, distressed properties
- Crowdfund (Reg CF) -- startups and growth-stage companies
- Advisory / Education

**NexusBridge owns (debt side):**
- Bridge Loans, Renovation Financing, Asset-Backed Lending, GAP Funding, Micro-Lending
- NexusBridge Capital LP -- private credit fund (Reg D / 506(c)), investor access to loan portfolio

> See `docs/Entity_Separation_Strategy.md` for the full separation policy and cross-reference guidelines.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui |
| Backend | Supabase (PostgreSQL, Auth, Storage, Realtime) |
| ORM | Drizzle ORM (type-safe, Supabase Transaction Pooler on port 6543) |
| Rate Limiting | Upstash Redis (serverless, Edge-compatible) |
| Email | Resend SDK |
| Hosting | Vercel (frontend) |
| Monorepo | Turborepo (planned) |
| Integrations | Plaid, PostHog, Sentry, n8n (automation), BoldSign (e-signatures) |

---

## Monorepo Structure

```
apps/
  web-marketing/   # Marketing site -- live on Vercel (localhost:3000)
  portal/          # Unified portal -- Phase 4 in progress (localhost:3001)
services/          # Backend domain services (scaffolding only)
core/              # Shared libraries (scaffolding only)
infrastructure/    # Docker, Terraform, CI/CD (scaffolding only)
compliance/        # SOC2, Reg A, Reg D artifacts
docs/              # Architecture documentation
```

---

## Implementation Phases

| Phase | Scope | Status |
|---|---|---|
| **Phase 1** | Marketing site -- 8 pages, lead capture forms, email routing | Completed |
| **Phase 2** | Supabase auth + RBAC, all role dashboards, borrower portal, investor portal, admin console, underwriter workspace, servicing dashboard | Completed |
| **Phase 3** | Loan lifecycle + underwriting + document management + fund operations | Completed |
| **Phase 4** | Workflow automation (n8n -- engine complete, n8n not yet deployed) + e-signatures (BoldSign -- complete) + OCR (Ocrolus/Argyle -- planned) + compliance hardening (KYC/AML -- planned) | In Progress |
| **Phase 5** | Tokenization layer (Base/Ethereum L2) -- HyFi vision | Optional / Future |

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

## Security Architecture

Every request passes through six enforcement layers in order:

```
1. Middleware          -- IP rate limit (Upstash) -> auth check -> role route guard
2. validateBody()     -- Zod schema validation -> 400 if invalid
3. applyRateLimit()   -- Upstash user-ID counter -> 429 if exceeded
4. getUser()          -- Supabase session -> 401 if not authenticated
5. getUserRole()      -- user_roles table lookup -> 403 if wrong role
6. DB operation       -- Supabase RLS enforces row-level access
```

All sensitive actions emit audit events. Row-level security (RLS) is enforced on all Supabase tables. The platform supports SOC2 controls, Reg A investor limits, and Reg D accredited investor verification.

---

## Roles

Six roles are implemented, each with scoped access:

| Role | Access | Navigation Links |
|---|---|---|
| `borrower` | Apply for loans, upload documents, view application status and detail, receive notifications | Dashboard, My Applications, Documents, Notifications |
| `investor` | View portfolio, fund subscriptions, statements, receive notifications | Dashboard, Portfolio, Statements, Notifications |
| `admin` | Full CRUD: applications, investors, users, documents, underwriting, tasks, workflows, audit log, invite users | Dashboard, Applications, Investors, Documents, Underwriting, Users, Tasks, Workflows, Audit Log, Invite User |
| `manager` | Same as admin minus user management and investor delete | Dashboard, Applications, Investors, Documents, Tasks, Audit Log, Invite User |
| `underwriter` | Underwriting cases assigned to them, record decisions, add conditions, own tasks | Dashboard, Cases, Tasks |
| `servicing` | Loan management, record payments, manage draws, own tasks | Dashboard, Loans, Tasks |

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

## AI Assistant Guidance

This repository includes a `CLAUDE.md` file with comprehensive instructions for Claude Code and other AI assistants. It covers architecture rules, security enforcement order, entity separation constraints, API route patterns, database rules, and implementation phasing. Consult it before making changes to the codebase.

---

## License

Proprietary. All rights reserved. NexusBridge Lending LLC / Capital Edge Management, Inc.
