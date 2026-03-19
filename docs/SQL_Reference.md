# NexusBridge CreditOS — SQL Reference Index

All Supabase SQL queries are organized by phase. Run each statement individually in the Supabase SQL Editor.

---

## Phase Files

| File | Covers |
|---|---|
| [`SQL_Reference_Phase1_2.md`](./SQL_Reference_Phase1_2.md) | Core schema (profiles, borrowers, applications, properties, loan_requests, investors, user_roles), RLS policies, cascade deletes, user management queries, audit/verification queries |
| [`SQL_Reference_Phase3.md`](./SQL_Reference_Phase3.md) | Foundation (pg_partman, audit_events, activity_logs, notifications, tasks), Documents, Underwriting Engine, Loan Lifecycle, Fund Operations (placeholder), Cross-phase verification queries |

---

## Quick Reference — Phase 3 Table Coverage

| Step | Tables | Migration |
|---|---|---|
| Step 1 — Foundation | `audit_events` (partitioned monthly), `activity_logs` (partitioned weekly), `notifications`, `tasks` | `0009_extensions`, `0014_audit_operations` |
| Step 2 — Documents | `documents`, `document_requests` | `0011_documents` |
| Step 3 — Underwriting | `underwriting_cases`, `underwriting_decisions`, `conditions`, `risk_flags` | `0010_underwriting` |
| Step 4 — Loan Lifecycle | `loans`, `payment_schedule`, `payments`, `draws` | `0012_loans` |
| Step 5 — Fund Operations | `fund_subscriptions`, `fund_allocations`, `nav_snapshots` | `0013_fund_operations` (pending) |

---

## Quick Reference — Phase 3 Indexes

| Table | Indexes |
|---|---|
| `underwriting_cases` | `idx_underwriting_cases_application_id`, `idx_underwriting_cases_assigned_to`, `idx_underwriting_cases_case_status` |
| `underwriting_decisions` | `idx_underwriting_decisions_case_id` |
| `conditions` | `idx_conditions_case_id`, `idx_conditions_status` |
| `risk_flags` | `idx_risk_flags_case_id`, `idx_risk_flags_severity` |
| `loans` | `idx_loans_application_id`, `idx_loans_loan_status`, `idx_loans_funding_date` |
| `payment_schedule` | `idx_payment_schedule_loan_id`, `idx_payment_schedule_due_date` |
| `payments` | `idx_payments_loan_id`, `idx_payments_payment_date` |
| `draws` | `idx_draws_loan_id`, `idx_draws_draw_status` |

---

## Quick Reference — Phase 3 Triggers

| Trigger | Table |
|---|---|
| `set_underwriting_cases_updated_at` | `underwriting_cases` |
| `set_underwriting_decisions_updated_at` | `underwriting_decisions` |
| `set_conditions_updated_at` | `conditions` |
| `set_risk_flags_updated_at` | `risk_flags` |
| `set_loan_number` | `loans` (auto-generates `LN-YYYYMMDD-XXXX`) |
| `set_loans_updated_at` | `loans` |
| `set_payment_schedule_updated_at` | `payment_schedule` |
| `set_payments_updated_at` | `payments` |
| `set_draws_updated_at` | `draws` |
