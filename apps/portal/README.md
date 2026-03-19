# NexusBridge CreditOS -- Portal

The unified portal application for NexusBridge CreditOS. Serves all six roles (borrower, investor, admin, manager, underwriter, servicing) from a single Next.js app with role-based routing and dashboards.

## Status

Phase 3 complete. Post-Phase 3 improvements (RBAC per operation, notifications, audit log, tasks, admin CRUD) complete.

## Getting Started

```bash
npm install
npm run dev
# -> http://localhost:3001
```

Requires `.env.local` with Supabase and Upstash credentials.

## Tech Stack

- Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- Supabase (PostgreSQL, Auth, Storage, Realtime)
- Drizzle ORM (Transaction Pooler, port 6543)
- Upstash Redis (rate limiting)
- Resend (email)

## Key Directories

```
src/
  app/
    (protected)/dashboard/   # Role-based dashboards
      admin/                 # Applications, investors, documents, underwriting, tasks, audit log, invite user, fund dashboard
      borrower/              # Dashboard, applications list + detail, documents
      investor/              # Dashboard, portfolio, statements
      underwriter/           # Cases, tasks
      servicing/             # Loans, tasks
      notifications/         # Notification inbox (all roles)
    api/                     # API routes
      admin/                 # /admin/investors, /admin/users, /admin/funds
      applications/          # /applications/[id], /applications/[id]/fields
      documents/             # Upload (signed URL), review queue
      underwriting/          # Cases, decisions, conditions, risk flags
      loans/                 # List, detail, create, payments, draws, transitions
      notifications/         # GET, PATCH (mark read), /[id] PATCH
      tasks/                 # POST (create), /[id] PATCH + DELETE
    auth/                    # /auth/confirm, /auth/callback
  lib/
    audit/emit.ts            # emitAuditEvent() -- fire-and-forget
    notifications/emit.ts    # emitNotification() -- fire-and-forget
    loan/state-machine.ts    # Application + loan state transitions
    rate-limit/index.ts      # Upstash rate limiter instances
    validation/schemas.ts    # Zod schemas for all API routes
    supabase/                # Client, server, admin helpers
  components/                # Shared UI components
  middleware.ts              # IP rate limit, auth check, role route guard
```

## Implemented Pages

| Role | Pages |
|---|---|
| **borrower** | Dashboard, /applications (list), /applications/[id] (detail), /documents, /notifications |
| **investor** | Dashboard, /portfolio, /statements, /notifications |
| **admin** | Dashboard, /applications, /investors, /documents, /underwriting, /tasks, /audit, /invite-user, /funds |
| **manager** | Dashboard, /applications, /investors, /documents, /tasks, /audit, /invite-user |
| **underwriter** | Dashboard, /cases, /tasks |
| **servicing** | Dashboard, /loans, /tasks |

## API Routes

| Domain | Endpoints |
|---|---|
| Documents | Upload (signed URL), admin review queue |
| Underwriting | 7 routes: cases list, case detail, assign, decision, conditions CRUD, risk flags |
| Loan Lifecycle | 6 routes: loans list, loan detail, create, record payment, draws, state transitions |
| Fund Operations | Subscriptions (FCFS), allocations, NAV snapshots |
| Notifications | GET /api/notifications, PATCH /api/notifications, PATCH /api/notifications/[id] |
| Tasks | POST /api/tasks, PATCH /api/tasks/[id], DELETE /api/tasks/[id] |
| Admin -- Users | PATCH /api/admin/users/[id] |
| Admin -- Investors | PATCH /api/admin/investors/[id], DELETE /api/admin/investors/[id] |
| Applications | PATCH /api/applications/[id]/fields |

## Security

Every request passes through 6 enforcement layers in order:

1. Middleware -- IP rate limit (Upstash), auth check, role route guard
2. API Route -- Zod validation, per-user rate limit, authentication, role authorization
3. Supabase RLS -- row-level security on all tables
4. Drizzle ORM -- parameterized queries (SQL injection prevention)
5. Budget monitoring -- Vercel + Supabase + Upstash spend caps

See `CLAUDE.md` in the repo root for full architecture details.
