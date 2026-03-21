# NexusBridge CreditOS — SQL Reference Index

All Supabase SQL queries are organized by phase and domain. Run each statement individually in the Supabase SQL Editor.

---

## File Index

| File | Phase / Step | Related Docs | Domain |
|---|---|---|---|
| [`01_SQL_CoreSchema.md`](./01_SQL_CoreSchema.md) | Phase 1 & 2 — DDL only | `01_Database_Schema`, `02_System_Architecture` | CREATE TABLE: profiles, borrowers, applications, properties, loan_requests, user_roles, investors, foreign keys |
| [`02_SQL_Phase2_AuthRoles.md`](./02_SQL_Phase2_AuthRoles.md) | Phase 2 — Auth & Roles | `02_System_Architecture`, `05_Entity_Separation_Strategy` | Auth functions, handle_new_user trigger, RLS policies, user management queries |
| [`03_SQL_Phase3.md`](./03_SQL_Phase3.md) | Phase 3 (Steps 1–5) | `15_Data_Security_Audit_Framework`, `13_Document_Management`, `08_Underwriting_Rules_Engine`, `06_Loan_State_Machine`, `10_Servicing_Ledger_Model`, `09_Fund_Accounting_NAV_Engine` | audit_events, activity_logs, notifications, tasks, documents, underwriting, loans, payments, funds, subscriptions, NAV |
| [`04_SQL_Phase4.md`](./04_SQL_Phase4.md) | Phase 4 (Steps 1–2) | `11_Event_Driven_Workflow_Engine`, Phase 4 implementation plan | workflow_triggers, workflow_executions, signature_requests |
| [`05_SQL_Phase5_Tokenization.md`](./05_SQL_Phase5_Tokenization.md) | Phase 5 | `17_DeFi_Tokenization_RWA_Architecture` | token_issuances, on_chain_positions, bridge_events |
| [`06_SQL_Admin_Queries.md`](./06_SQL_Admin_Queries.md) | Operational | `01_Database_Schema`, `15_Data_Security_Audit_Framework` | User deletion, audit verification, admin utilities |

---

## Table Coverage by Phase

| Step | Tables | Migration |
|---|---|---|
| Phase 1 — Core DDL | `profiles`, `borrowers`, `applications`, `properties`, `loan_requests` | `0001_initial_borrower_schema` |
| Phase 2 — Auth & Roles | `user_roles`, `investors` + auth functions + RLS policies | `0005_user_roles`, `0007_investors`, `0008_cascade_deletes` |
| Phase 3 — Foundation | `audit_events` (partitioned monthly), `activity_logs` (partitioned weekly), `notifications`, `tasks` | `0009_extensions`, `0014_audit_operations`, `0019_partition_rls_policies` |
| Phase 3 — Documents | `documents`, `document_requests` | `0011_documents` |
| Phase 3 — Underwriting | `underwriting_cases`, `underwriting_decisions`, `conditions`, `risk_flags` | `0010_underwriting` |
| Phase 3 — Loan Lifecycle | `loans`, `payment_schedule`, `payments`, `draws` | `0012_loans` |
| Phase 3 — Fund Operations | `funds`, `fund_subscriptions`, `fund_allocations`, `nav_snapshots` | `0013_fund_operations` |
| Phase 4 — Workflow Automation | `workflow_triggers`, `workflow_executions` | `0015_workflow_automation` |
| Phase 4 — E-Signatures | `signature_requests` | `0016_esignatures` |
| Phase 4 — Compliance Hardening | `accreditation_records`, `kyc_verifications`, `aml_screenings` + alters `fund_subscriptions` | `0017_compliance_hardening` |
| Phase 4 — Reg A Limits | alters `funds` (offering_type), alters `investors` (annual_income, net_worth) | `0018_reg_a_limits` |
| Phase 3 — Partition RLS | `apply_partition_rls_policies()` function + pg_cron job | `0019_partition_rls_policies` |
| Phase 4 — OCR / Document Intelligence | `document_extractions` | `0020_document_intelligence` (planned) |
| Phase 5 — Tokenization | `token_issuances`, `on_chain_positions`, `bridge_events` | `0021_tokenization` (planned) |

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
