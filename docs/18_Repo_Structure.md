# Repository Structure

This document reflects the actual repository structure as of Phase 3 completion.

```
NexusBridge CreditOS/
│
├── apps/
│   ├── web-marketing/              # Public marketing website (Phase 1 -- live on Vercel)
│   │   ├── src/
│   │   │   ├── app/                # Next.js App Router pages
│   │   │   ├── components/         # UI components
│   │   │   └── lib/                # Utilities
│   │   └── public/                 # Static assets
│   │
│   └── portal/                     # Unified portal (Phase 3 complete)
│       └── src/
│           ├── app/
│           │   ├── (protected)/dashboard/
│           │   │   ├── admin/      # Admin pages: applications, investors, documents,
│           │   │   │               #   underwriting, tasks, audit, invite-user, funds
│           │   │   ├── borrower/   # Borrower pages: dashboard, applications (list + detail),
│           │   │   │               #   documents
│           │   │   ├── investor/   # Investor pages: dashboard, portfolio, statements
│           │   │   ├── underwriter/# Underwriter pages: cases, tasks
│           │   │   ├── servicing/  # Servicing pages: loans, tasks
│           │   │   └── notifications/ # Notification inbox (all roles)
│           │   ├── api/
│           │   │   ├── admin/      # /admin/investors, /admin/users, /admin/funds
│           │   │   ├── applications/ # /applications/[id], /applications/[id]/fields
│           │   │   ├── documents/  # Upload (signed URL), review queue
│           │   │   ├── underwriting/ # Cases, decisions, conditions, risk flags
│           │   │   ├── loans/      # List, detail, create, payments, draws, transitions
│           │   │   ├── notifications/ # GET, PATCH (mark read), /[id] PATCH
│           │   │   └── tasks/      # POST (create), /[id] PATCH + DELETE
│           │   └── auth/           # /auth/confirm, /auth/callback
│           ├── components/         # Shared UI components (NotificationBell, EditUserRoleButton,
│           │                       #   EditInvestorStatusButton, DeleteInvestorButton,
│           │                       #   EditApplicationFieldsForm, CreateTaskForm, TaskStatusButton, etc.)
│           ├── lib/
│           │   ├── audit/          # emitAuditEvent() fire-and-forget helper
│           │   ├── notifications/  # emitNotification() fire-and-forget helper
│           │   ├── loan/           # State machine (canTransitionApplication, canTransitionLoan)
│           │   ├── rate-limit/     # Upstash rate limiter instances
│           │   ├── validation/     # Zod schemas for all API routes
│           │   └── supabase/       # Client, server, admin helpers
│           └── middleware.ts       # IP rate limit, auth check, role route guard
│
├── services/                       # Backend domain services (scaffolding only)
├── core/                           # Shared libraries (scaffolding only)
├── infrastructure/                 # Docker, Terraform, CI/CD (scaffolding only)
├── compliance/                     # SOC2, Reg A/D artifacts
│
├── docs/                           # Architecture documentation
│   ├── 01_Platform_Overview.md
│   ├── 02_System_Architecture.md
│   ├── 03_Platform_Workflows.md
│   ├── 04_Developer_Guide.md
│   ├── 05_Loan_State_Machine.md
│   ├── 06_Capital_Waterfall_Logic.md
│   ├── 07_Underwriting_Rules_Engine.md
│   ├── 08_Servicing_Ledger_Model.md
│   ├── 09_SOC2_Implementation_Protocol.md
│   ├── 10_Document_Management.md
│   ├── 11_Data_Security_Audit_Framework.md
│   ├── 12_Institutional_Ledger_Architecture.md
│   ├── 13_Event_Driven_Workflow_Engine.md
│   ├── 14_RegA_RegD_Compliance_System.md
│   ├── 15_Database_Infrastructure.md
│   ├── Database_Schema.md
│   ├── SQL_Reference.md
│   ├── SQL_Reference_Phase1_2.md
│   ├── SQL_Reference_Phase3.md
│   ├── Entity_Separation_Strategy.md
│   └── repo_structure.md
│
├── images/                         # Brand assets
│
├── CLAUDE.md                       # Claude Code project instructions
├── CLAUDE_Web_Design.md            # Marketing site UI/UX rules
├── CLAUDE_App_UI.md                # Portal UI/UX rules
├── package.json
└── README.md
```

## Notes

- `services/`, `core/`, and `infrastructure/` directories are scaffolding -- not yet built. All backend logic currently lives in `apps/portal/src/app/api/` as Next.js API routes and in `apps/portal/src/lib/` as shared utilities.
- The portal serves all six roles from a single Next.js app with RBAC middleware and per-role dashboard routes.
- Database migrations are managed through Supabase CLI (`supabase/migrations/`).
