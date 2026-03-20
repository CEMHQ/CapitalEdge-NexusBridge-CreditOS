# NexusBridge CreditOS — SQL Reference Index

All Supabase SQL queries are organized by phase and domain. Run each statement individually in the Supabase SQL Editor.

---

## File Index

| File | Phase / Step | Related Docs | Domain |
|---|---|---|---|
| [`01_SQL_CoreSchema.md`](./01_SQL_CoreSchema.md) | Phase 1 & 2 — DDL only | `01_Database_Schema`, `02_System_Architecture` | CREATE TABLE: profiles, borrowers, applications, properties, loan_requests, user_roles, investors, foreign keys |
| [`02_SQL_Phase2_AuthRoles.md`](./02_SQL_Phase2_AuthRoles.md) | Phase 2 — Auth & Roles | `02_System_Architecture`, `05_Entity_Separation_Strategy` | Auth functions, handle_new_user trigger, RLS policies, user management queries |
| [`03_SQL_Phase3-Step1_AuditFoundation.md`](./03_SQL_Phase3-Step1_AuditFoundation.md) | Phase 3, Step 1 | `15_Data_Security_Audit_Framework` | pg_partman, audit_events, activity_logs, notifications, tasks |
| [`04_SQL_Phase3-Step2_Documents.md`](./04_SQL_Phase3-Step2_Documents.md) | Phase 3, Step 2 | `13_Document_Management` | documents, document_requests, Storage buckets |
| [`05_SQL_Phase3-Step3_Underwriting.md`](./05_SQL_Phase3-Step3_Underwriting.md) | Phase 3, Step 3 | `08_Underwriting_Rules_Engine` | underwriting_cases, underwriting_decisions, conditions, risk_flags |
| [`06_SQL_Phase3-Step4_LoanLifecycle.md`](./06_SQL_Phase3-Step4_LoanLifecycle.md) | Phase 3, Step 4 | `06_Loan_State_Machine`, `10_Servicing_Ledger_Model` | loans, payment_schedule, payments, draws |
| [`07_SQL_Phase3-Step5_FundOperations.md`](./07_SQL_Phase3-Step5_FundOperations.md) | Phase 3, Step 5 | `09_Fund_Accounting_NAV_Engine` | funds, fund_subscriptions, fund_allocations, nav_snapshots |
| [`08_SQL_Phase4-Step1_Workflow.md`](./08_SQL_Phase4-Step1_Workflow.md) | Phase 4, Step 1 | `11_Event_Driven_Workflow_Engine` | workflow_triggers, workflow_executions |
| [`09_SQL_Phase4-Step2_ESignatures.md`](./09_SQL_Phase4-Step2_ESignatures.md) | Phase 4, Step 2 | Phase 4 implementation plan | signature_requests, fund_subscriptions constraint update |
| [`10_SQL_Phase5_Tokenization.md`](./10_SQL_Phase5_Tokenization.md) | Phase 5 | `17_DeFi_Tokenization_RWA_Architecture` | token_issuances, on_chain_positions, bridge_events |
| [`11_SQL_Admin_Queries.md`](./11_SQL_Admin_Queries.md) | Operational | `01_Database_Schema`, `15_Data_Security_Audit_Framework` | User deletion, audit verification, admin utilities |

---

## Table Coverage by Phase

| Step | Tables | Migration |
|---|---|---|
| Phase 1 — Core DDL | `profiles`, `borrowers`, `applications`, `properties`, `loan_requests` | `0001_initial_borrower_schema` |
| Phase 2 — Auth & Roles | `user_roles`, `investors` + auth functions + RLS policies | `0005_user_roles`, `0007_investors`, `0008_cascade_deletes` |
| Phase 3 Step 1 — Foundation | `audit_events` (partitioned monthly), `activity_logs` (partitioned weekly), `notifications`, `tasks` | `0009_extensions`, `0014_audit_operations` |
| Phase 3 Step 2 — Documents | `documents`, `document_requests` | `0011_documents` |
| Phase 3 Step 3 — Underwriting | `underwriting_cases`, `underwriting_decisions`, `conditions`, `risk_flags` | `0010_underwriting` |
| Phase 3 Step 4 — Loan Lifecycle | `loans`, `payment_schedule`, `payments`, `draws` | `0012_loans` |
| Phase 3 Step 5 — Fund Operations | `funds`, `fund_subscriptions`, `fund_allocations`, `nav_snapshots` | `0013_fund_operations` |
| Phase 4 Step 1 — Workflow Automation | `workflow_triggers`, `workflow_executions` | `0015_workflow_automation` |
| Phase 4 Step 2 — E-Signatures | `signature_requests` | `0016_esignatures` |
| Phase 5 — Tokenization | `token_issuances`, `on_chain_positions`, `bridge_events` | `0019_tokenization` (planned) |

---

## Indexes Quick Reference — Phase 3

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

## Triggers Quick Reference — Phase 3

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
