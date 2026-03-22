# NexusBridge CreditOS -- Portal

The unified portal application for NexusBridge CreditOS. Serves all six roles (borrower, investor, admin, manager, underwriter, servicing) from a single Next.js app with role-based routing and dashboards.

## Status

Phase 3 complete. Post-Phase 3 improvements (RBAC per operation, notifications, audit log, tasks, admin CRUD) complete.
Phase 4 Step 1 (workflow automation) complete — platform engine live; n8n self-hosted instance not yet deployed.
Phase 4 Step 2 (e-signatures via BoldSign) complete.
Phase 4 Step 3 (OCR / document intelligence) in progress.

## Getting Started

```bash
npm install
npm run dev
# -> http://localhost:3001
```

Requires `.env.local` with the following credentials:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=
NEXUSBRIDGE_PORTAL_KEY=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
# Phase 4 Step 1 — Workflow Automation
N8N_WEBHOOK_SECRET=
# Phase 4 Step 2 — E-Signatures
BOLDSIGN_API_KEY=
BOLDSIGN_WEBHOOK_SECRET=
BOLDSIGN_TEMPLATE_PROMISSORY_NOTE=
BOLDSIGN_TEMPLATE_DEED_OF_TRUST=
BOLDSIGN_TEMPLATE_LOAN_AGREEMENT=
BOLDSIGN_TEMPLATE_SUBSCRIPTION_AGREEMENT=
# Phase 4 Step 3 — OCR / Document Intelligence
OCROLUS_API_KEY=
OCROLUS_CLIENT_SECRET=
OCROLUS_WEBHOOK_SECRET=
ARGYLE_API_KEY=
ARGYLE_PLUGIN_KEY=
ARGYLE_WEBHOOK_SECRET=
```

## Tech Stack

- Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- Supabase (PostgreSQL, Auth, Storage, Realtime)
- Drizzle ORM (Transaction Pooler, port 6543)
- Upstash Redis (rate limiting)
- Resend (email)
- BoldSign (e-signatures)
- Ocrolus + Argyle (OCR / document intelligence)

## Key Directories

```
src/
  app/
    (protected)/dashboard/   # Role-based dashboards
      admin/                 # Applications, investors, documents, underwriting, tasks, audit log, invite user, fund dashboard, workflows
      borrower/              # Dashboard, applications list + detail, documents
      investor/              # Dashboard, portfolio, statements
      underwriter/           # Cases, tasks
      servicing/             # Loans, tasks
      notifications/         # Notification inbox (all roles)
    api/                     # API routes
      admin/                 # /admin/investors, /admin/users, /admin/funds, /admin/workflows
      applications/          # /applications/[id], /applications/[id]/fields
      documents/             # Upload (signed URL), review queue, /[id]/extract
      underwriting/          # Cases, decisions, conditions, risk flags
      loans/                 # List, detail, create, payments, draws, transitions
      notifications/         # GET, PATCH (mark read), /[id] PATCH
      tasks/                 # POST (create), /[id] PATCH + DELETE
      signatures/            # POST (request), GET /[id], PATCH /[id]/cancel
      webhooks/              # /webhooks/boldsign, /webhooks/n8n, /webhooks/ocr
    auth/                    # /auth/confirm, /auth/callback
  lib/
    audit/emit.ts            # emitAuditEvent() -- fire-and-forget
    notifications/emit.ts    # emitNotification() -- fire-and-forget
    loan/state-machine.ts    # Application + loan state transitions
    rate-limit/index.ts      # Upstash rate limiter instances
    validation/schemas.ts    # Zod schemas for all API routes
    supabase/                # Client, server, admin helpers
    ocr/                     # Ocrolus + Argyle provider clients (Phase 4 Step 3)
  components/                # Shared UI components
  middleware.ts              # IP rate limit, auth check, role route guard
```

## Implemented Pages

| Role | Pages |
|---|---|
| **borrower** | Dashboard, /applications (list), /applications/[id] (detail), /documents, /notifications |
| **investor** | Dashboard, /portfolio, /statements, /notifications |
| **admin** | Dashboard, /applications, /investors, /documents, /underwriting, /tasks, /audit, /invite-user, /funds, /workflows |
| **manager** | Dashboard, /applications, /investors, /documents, /tasks, /audit, /invite-user |
| **underwriter** | Dashboard, /cases, /tasks |
| **servicing** | Dashboard, /loans, /tasks |

## API Routes

| Domain | Endpoints |
|---|---|
| Documents | Upload (signed URL), admin review queue, POST /documents/[id]/extract |
| Underwriting | 7 routes: cases list, case detail, assign, decision, conditions CRUD, risk flags |
| Loan Lifecycle | 6 routes: loans list, loan detail, create, record payment, draws, state transitions |
| Fund Operations | Subscriptions (FCFS), allocations, NAV snapshots |
| Notifications | GET /api/notifications, PATCH /api/notifications, PATCH /api/notifications/[id] |
| Tasks | POST /api/tasks, PATCH /api/tasks/[id], DELETE /api/tasks/[id] |
| Admin -- Users | PATCH /api/admin/users/[id] |
| Admin -- Investors | PATCH /api/admin/investors/[id], DELETE /api/admin/investors/[id] |
| Admin -- Workflows | GET /api/admin/workflows, POST /api/admin/workflows/[id]/toggle |
| Applications | PATCH /api/applications/[id]/fields |
| Signatures | POST /api/signatures, GET /api/signatures/[id], PATCH /api/signatures/[id]/cancel |
| Webhooks | POST /api/webhooks/boldsign, POST /api/webhooks/n8n, POST /api/webhooks/ocr |

## Security

Every request passes through 6 enforcement layers in order:

1. Middleware -- IP rate limit (Upstash), auth check, role route guard
2. API Route -- Zod validation, per-user rate limit, authentication, role authorization
3. Supabase RLS -- row-level security on all tables
4. Drizzle ORM -- parameterized queries (SQL injection prevention)
5. Budget monitoring -- Vercel + Supabase + Upstash spend caps

See `CLAUDE.md` in the repo root for full architecture details.
