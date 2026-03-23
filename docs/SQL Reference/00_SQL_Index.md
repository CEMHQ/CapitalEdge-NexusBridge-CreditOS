# NexusBridge CreditOS — SQL Reference Index

All Supabase SQL queries are organized by phase and domain. Run each statement individually in the Supabase SQL Editor.

---

## File Index

| File | Phase / Step | Related Docs | Domain |
|---|---|---|---|
| [`01_SQL_CoreSchema.md`](./01_SQL_CoreSchema.md) | Phase 1 & 2 — DDL only | `01_Database_Schema`, `02_System_Architecture` | CREATE TABLE: profiles, borrowers, applications, properties, loan_requests, user_roles, investors, foreign keys |
| [`02_SQL_Phase2_AuthRoles.md`](./02_SQL_Phase2_AuthRoles.md) | Phase 2 — Auth & Roles | `02_System_Architecture`, `05_Entity_Separation_Strategy` | Auth functions, handle_new_user trigger, RLS policies, user management queries |
| [`03_SQL_Phase3.md`](./03_SQL_Phase3.md) | Phase 3 (Steps 1–5) | `15_Data_Security_Audit_Framework`, `13_Document_Management`, `08_Underwriting_Rules_Engine`, `06_Loan_State_Machine`, `10_Servicing_Ledger_Model`, `09_Fund_Accounting_NAV_Engine` | audit_events, activity_logs, notifications, tasks, documents, underwriting, loans, payments, funds, subscriptions, NAV |
| [`04_SQL_Phase4.md`](./04_SQL_Phase4.md) | Phase 4 (Steps 1–5) | `11_Event_Driven_Workflow_Engine`, `13_Document_Management`, `12_Investor_Portal_RegA_UX_Flow`, Phase 4 implementation plan | workflow_triggers, workflow_executions, signature_requests, document_extractions, extraction_field_mappings, offerings, offering_documents |
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
| Security Hardening — RLS Audit Fixes | Updated policies: profiles, borrowers, applications, investors, notifications, document_requests, documents, payment_schedule, draws, user_roles, accreditation_records; patched `reserve_fund_subscription()` | `0020_rls_audit_fixes` |
| Security Hardening — RLS Continuous Audit | `rls_audit_log` + `notify_rls_findings()` + `run_rls_audit()` (12 inline checks) + 3 pg_cron jobs (nightly, weekly, partition sync) | `0021_rls_audit_infrastructure` |
| Security Hardening — UPDATE WITH CHECK | WITH CHECK added to 19 admin/servicing/underwriter UPDATE policies; `SET search_path` added to `is_admin()`, `is_internal_user()`, `get_user_role()`, `handle_new_user()` | `0022_rls_update_with_check` |
| Phase 4 — OCR / Document Intelligence | `document_extractions`, `extraction_field_mappings` | `0023_document_intelligence` |
| Phase 4 — Reg A Offerings Schema | `offerings`, `offering_documents` + alters `investors` (jurisdiction) | `0024_reg_a_offerings` |
| Security Hardening — RLS Infinite Recursion Fix | Fixed `user_roles_select_admin` policy — replaced self-referencing subquery with `get_user_role()` | `0025_fix_user_roles_rls` |
| Security Hardening — RLS Self-Referential Policy Fix | Fixed `profiles_update_own` and `notifications_update_own` — removed self-referential subqueries that caused recursion on UPDATE | `0026_fix_self_referential_rls` |
| Phase 4 — Offering Documents Storage Bucket | `offering-documents` Supabase Storage bucket + storage RLS policies (admin CRUD, authenticated read) | `0027_offering_documents_bucket` |
| Phase 4 — Document Acknowledgment Gate | alters `fund_subscriptions` (offering_circular_acknowledged_at); alters `investors` (aiq_self_certified_at, aiq_accreditation_basis) | `0028_document_acknowledgment_gate` |
| Phase 5 — Tokenization | `token_issuances`, `on_chain_positions`, `bridge_events` | `0029_tokenization` (planned) |

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
| `rls_audit_log` | `idx_rls_audit_log_run_at`, `idx_rls_audit_log_severity`, `idx_rls_audit_log_check_id`, `idx_rls_audit_log_resolved` (partial: WHERE resolved_at IS NULL) |

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
