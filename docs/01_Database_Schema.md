# NexusBridge Lending
## Database Schema

This document defines the core relational database schema for the NexusBridge Lending platform.

The schema is designed to support:

- borrower onboarding and applications
- document management
- underwriting workflows
- loan funding and servicing
- investor commitments and allocations
- auditability and operational controls

The database should be implemented in PostgreSQL and aligned with Supabase conventions where appropriate.

---

# 1. Design Principles

The schema must follow these principles:

- Normalize core operational data
- Separate borrower, investor, and loan servicing domains
- Support audit logging and compliance review
- Avoid overloading a single `loans` table with unrelated data
- Support future extensibility for tokenization and protocol integration
- High-frequency append-only tables are **pg_partman partitioned tables** — marked with `⚡ PARTITIONED`
- All financial calculations use `numeric(18,2)` — never floating point
- Financial records are append-only — corrections use reversing entries, not silent mutations

## pg_partman Partitioned Table Summary

| Table | Partition Key | Interval |
|---|---|---|
| `payments` ⚡ | `payment_date` | 1 month |
| `audit_events` ⚡ | `created_at` | 1 month |
| `activity_logs` ⚡ | `created_at` | 1 week |
| `loan_draws` ⚡ | `created_at` | 1 month |
| `distributions` ⚡ | `distribution_date` | 1 month |
| `fund_ticks` ⚡ | `ts` | 1 day |
| `onboarding_events` ⚡ | `ts` | 1 day |

See `docs/15_Database_Infrastructure.md` for partitioned table SQL, pg_partman setup, maintenance scheduling, and FCFS locking patterns.

---

# 2. Core Identity Tables

## `profiles`

Stores authenticated user profile information linked to the auth provider.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key; should match auth user ID where possible |
| email | text | Unique email address |
| full_name | text | User full legal name |
| phone | text | Optional phone number |
| status | text | active, pending, suspended |
| created_at | timestamptz | Default now() |
| updated_at | timestamptz | Default now() |

## `organizations`

Stores legal entities participating in the platform.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| legal_name | text | Legal entity name |
| entity_type | text | individual, llc, corporation, trust, fund |
| tax_id | text | Encrypted or separately protected |
| address_line_1 | text | Address |
| address_line_2 | text | Optional |
| city | text | City |
| state | text | State |
| postal_code | text | ZIP / postal |
| country | text | Country |
| created_at | timestamptz | Default now() |
| updated_at | timestamptz | Default now() |

## `roles`

Defines application roles.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| role_name | text | borrower, investor, admin, underwriter, servicing, manager |
| description | text | Optional |
| created_at | timestamptz | Default now() |

## `organization_members`

Maps users to organizations and roles.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| organization_id | uuid | FK -> organizations.id |
| profile_id | uuid | FK -> profiles.id |
| role_id | uuid | FK -> roles.id |
| is_primary_contact | boolean | Default false |
| created_at | timestamptz | Default now() |

---

# 3. Borrower Domain Tables

## `borrowers`

Represents borrower accounts.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| organization_id | uuid | FK -> organizations.id |
| profile_id | uuid | FK -> profiles.id; nullable for entity-led borrowers |
| borrower_type | text | individual, entity |
| onboarding_status | text | pending, active, blocked |
| kyc_status | text | not_started, pending, verified, rejected |
| aml_status | text | not_started, pending, cleared, flagged |
| created_at | timestamptz | Default now() |
| updated_at | timestamptz | Default now() |

## `borrower_entities`

Stores additional details about borrower-controlled entities.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| borrower_id | uuid | FK -> borrowers.id |
| organization_id | uuid | FK -> organizations.id |
| entity_role | text | borrower, guarantor, sponsor |
| ownership_percent | numeric(5,2) | Optional |
| created_at | timestamptz | Default now() |

## `applications`

Stores loan application records.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| borrower_id | uuid | FK -> borrowers.id |
| application_number | text | Unique business identifier |
| loan_purpose | text | bridge, renovation, contingency, other |
| requested_amount | numeric(18,2) | Requested loan amount |
| requested_term_months | integer | Requested term |
| exit_strategy | text | sale, refinance, repayment |
| application_status | text | draft, submitted, under_review, conditionally_approved, approved, declined, funded, closed |
| submitted_at | timestamptz | Nullable |
| created_at | timestamptz | Default now() |
| updated_at | timestamptz | Default now() |

## `properties`

Stores property collateral details tied to applications.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| application_id | uuid | FK -> applications.id |
| address_line_1 | text | Property address |
| address_line_2 | text | Optional |
| city | text | City |
| state | text | State |
| postal_code | text | ZIP |
| property_type | text | sfh, multifamily, condo, land, mixed_use, commercial |
| occupancy_type | text | owner_occupied, rental, vacant |
| current_value | numeric(18,2) | Optional |
| arv_value | numeric(18,2) | After repair value |
| purchase_price | numeric(18,2) | Optional |
| created_at | timestamptz | Default now() |
| updated_at | timestamptz | Default now() |

## `loan_requests`

Detailed requested loan terms.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| application_id | uuid | FK -> applications.id |
| requested_principal | numeric(18,2) | Requested principal |
| requested_interest_rate | numeric(8,4) | Optional |
| requested_points | numeric(8,4) | Optional |
| requested_ltv | numeric(8,4) | Optional |
| requested_ltc | numeric(8,4) | Optional |
| requested_dscr | numeric(8,4) | Optional |
| created_at | timestamptz | Default now() |
| updated_at | timestamptz | Default now() |

## `collateral`

Tracks collateral items beyond the main property record if needed.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| application_id | uuid | FK -> applications.id |
| collateral_type | text | real_estate, receivable, equipment, other |
| description | text | Description |
| estimated_value | numeric(18,2) | Estimated value |
| lien_position | text | first, second, junior |
| created_at | timestamptz | Default now() |

## `guarantors`

Stores guarantor information.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| application_id | uuid | FK -> applications.id |
| organization_id | uuid | FK -> organizations.id; nullable if natural person |
| full_name | text | Guarantor name |
| guarantor_type | text | individual, entity |
| email | text | Optional |
| phone | text | Optional |
| created_at | timestamptz | Default now() |

## `income_sources`

Borrower income and financial capacity records.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| borrower_id | uuid | FK -> borrowers.id |
| source_type | text | employment, rental, business, other |
| description | text | Description |
| annual_amount | numeric(18,2) | Amount |
| verified | boolean | Default false |
| created_at | timestamptz | Default now() |

## `bank_accounts`

Stores linked bank account metadata.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| organization_id | uuid | FK -> organizations.id |
| account_holder_name | text | Name |
| bank_name | text | Bank |
| account_type | text | checking, savings |
| masked_account_number | text | Last 4 only |
| plaid_item_id | text | Optional external ID |
| is_verified | boolean | Default false |
| created_at | timestamptz | Default now() |

---

# 4. Document Management Tables

## `documents`

Stores high-level document metadata.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| owner_type | text | borrower, investor, application, loan |
| owner_id | uuid | Related domain entity |
| document_type | text | id, tax_return, bank_statement, appraisal, agreement, k1, statement |
| file_name | text | Original file name |
| file_path | text | Storage path |
| mime_type | text | File MIME type |
| file_size_bytes | bigint | File size |
| upload_status | text | pending, uploaded, failed |
| review_status | text | pending_review, verified, rejected |
| uploaded_by | uuid | FK -> profiles.id |
| created_at | timestamptz | Default now() |
| updated_at | timestamptz | Default now() |

## `document_versions`

Tracks version history.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| document_id | uuid | FK -> documents.id |
| version_number | integer | Starts at 1 |
| file_path | text | Versioned file path |
| checksum | text | Optional integrity hash |
| created_by | uuid | FK -> profiles.id |
| created_at | timestamptz | Default now() |

## `document_requests`

Requested documents tied to applications or investor onboarding.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| request_owner_type | text | application, borrower, investor |
| request_owner_id | uuid | Related entity |
| document_type | text | Requested document type |
| request_status | text | open, fulfilled, waived, expired |
| due_date | date | Optional |
| notes | text | Optional |
| created_at | timestamptz | Default now() |

## `document_extractions`

OCR and structured extraction results.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| document_id | uuid | FK -> documents.id |
| provider_name | text | Ocrolus, Argyle, etc. |
| extraction_status | text | pending, completed, failed |
| extracted_json | jsonb | Parsed structured data |
| raw_text | text | Optional controlled access |
| confidence_score | numeric(5,2) | Optional |
| created_at | timestamptz | Default now() |

## `document_review_flags`

Manual or automated review flags.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| document_id | uuid | FK -> documents.id |
| flag_type | text | mismatch, fraud_risk, incomplete, unreadable |
| severity | text | low, medium, high |
| notes | text | Optional |
| resolved | boolean | Default false |
| resolved_by | uuid | FK -> profiles.id; nullable |
| created_at | timestamptz | Default now() |
| resolved_at | timestamptz | Nullable |

---

# 5. Underwriting Tables

## `underwriting_cases`

Represents a formal underwriting file.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| application_id | uuid | FK -> applications.id |
| assigned_to | uuid | FK -> profiles.id |
| case_status | text | open, pending_conditions, approved, declined, funded |
| risk_grade | text | Optional internal grade |
| notes | text | Optional |
| created_at | timestamptz | Default now() |
| updated_at | timestamptz | Default now() |

## `underwriting_decisions`

Captures decisions over time.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| underwriting_case_id | uuid | FK -> underwriting_cases.id |
| decision_type | text | conditional_approval, approval, decline, hold |
| approved_amount | numeric(18,2) | Nullable |
| approved_rate | numeric(8,4) | Nullable |
| approved_term_months | integer | Nullable |
| decision_notes | text | Optional |
| decided_by | uuid | FK -> profiles.id |
| created_at | timestamptz | Default now() |

## `conditions`

Tracks approval conditions.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| underwriting_case_id | uuid | FK -> underwriting_cases.id |
| condition_type | text | appraisal, insurance, title, document, compliance |
| description | text | Condition detail |
| status | text | open, satisfied, waived |
| satisfied_at | timestamptz | Nullable |
| created_at | timestamptz | Default now() |

## `risk_flags`

Risk markers for underwriting and servicing.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| application_id | uuid | FK -> applications.id |
| flag_type | text | high_ltv, income_mismatch, aml_flag, collateral_issue |
| severity | text | low, medium, high |
| notes | text | Optional |
| status | text | open, reviewed, resolved |
| created_at | timestamptz | Default now() |
| updated_at | timestamptz | Default now() |

## `valuation_reports`

Collateral valuation records.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| property_id | uuid | FK -> properties.id |
| provider_name | text | Appraiser / AVM source |
| valuation_type | text | appraisal, broker_opinion, avm |
| as_is_value | numeric(18,2) | Optional |
| arv_value | numeric(18,2) | Optional |
| valuation_date | date | Report date |
| report_document_id | uuid | FK -> documents.id; nullable |
| created_at | timestamptz | Default now() |

---

# 6. Funding and Servicing Tables

## `loans`

Primary funded loan table.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| application_id | uuid | FK -> applications.id |
| loan_number | text | Unique business identifier |
| principal_amount | numeric(18,2) | Funded principal |
| interest_rate | numeric(8,4) | Contract rate |
| origination_fee | numeric(18,2) | Optional |
| term_months | integer | Contract term |
| funding_date | date | Funding date |
| maturity_date | date | Maturity date |
| loan_status | text | active, matured, delinquent, defaulted, paid_off, charged_off |
| created_at | timestamptz | Default now() |
| updated_at | timestamptz | Default now() |

## `loan_draws` ⚡ PARTITIONED (partition: `created_at`, interval: 1 month)

For staged funding or draw schedules.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| loan_id | uuid | FK -> loans.id |
| draw_number | integer | Sequential draw |
| draw_amount | numeric(18,2) | Amount |
| draw_status | text | requested, approved, funded, cancelled |
| requested_at | timestamptz | Nullable |
| funded_at | timestamptz | Nullable |
| created_at | timestamptz | Default now() — partition key |

## `payment_schedules`

Expected payment schedule.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| loan_id | uuid | FK -> loans.id |
| due_date | date | Scheduled due date |
| principal_due | numeric(18,2) | Scheduled principal |
| interest_due | numeric(18,2) | Scheduled interest |
| fees_due | numeric(18,2) | Scheduled fees |
| total_due | numeric(18,2) | Total due |
| schedule_status | text | upcoming, due, paid, late |
| created_at | timestamptz | Default now() |

## `payments` ⚡ PARTITIONED (partition: `payment_date`, interval: 1 month)

Actual payment records.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| loan_id | uuid | FK -> loans.id |
| payment_date | date | Payment date — partition key |
| payment_amount | numeric(18,2) | Amount received |
| principal_applied | numeric(18,2) | Principal portion |
| interest_applied | numeric(18,2) | Interest portion |
| fees_applied | numeric(18,2) | Fees portion |
| payment_method | text | ach, wire, check, other |
| external_reference | text | Payment processor reference |
| created_at | timestamptz | Default now() |

## `fees`

Additional fees assessed to loans.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| loan_id | uuid | FK -> loans.id |
| fee_type | text | late_fee, extension_fee, servicing_fee, legal_fee |
| amount | numeric(18,2) | Fee amount |
| assessed_date | date | Date assessed |
| status | text | pending, paid, waived |
| created_at | timestamptz | Default now() |

## `delinquencies`

Delinquency records.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| loan_id | uuid | FK -> loans.id |
| delinquency_start_date | date | Date delinquency began |
| days_past_due | integer | Current days past due |
| delinquency_status | text | active, cured, escalated |
| notes | text | Optional |
| created_at | timestamptz | Default now() |
| updated_at | timestamptz | Default now() |

## `payoffs`

Loan payoff events.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| loan_id | uuid | FK -> loans.id |
| payoff_date | date | Date paid off |
| payoff_amount | numeric(18,2) | Total payoff |
| principal_balance | numeric(18,2) | Principal at payoff |
| interest_due | numeric(18,2) | Interest due |
| fees_due | numeric(18,2) | Fees due |
| created_at | timestamptz | Default now() |

---

# 7. Investor and Fund Tables

## `investors`

Investor account records.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| organization_id | uuid | FK -> organizations.id |
| profile_id | uuid | FK -> profiles.id; nullable for entity-led investors |
| investor_type | text | individual, entity, family_office, institution |
| onboarding_status | text | pending, active, blocked |
| accreditation_status | text | not_started, pending, verified, expired, rejected |
| kyc_status | text | not_started, pending, verified, rejected |
| created_at | timestamptz | Default now() |
| updated_at | timestamptz | Default now() |

## `funds`

Investment vehicles.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| fund_name | text | e.g. NexusBridge Capital, LP |
| fund_type | text | lp, spv, pool |
| fund_status | text | open, closed, fundraising |
| inception_date | date | Optional |
| created_at | timestamptz | Default now() |

## `subscriptions`

Subscription and commitment records. Includes FCFS reservation fields to support atomic slot reservation during capital contributions — prevents oversubscription at the database level via pessimistic locking.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| investor_id | uuid | FK -> investors.id |
| fund_id | uuid | FK -> funds.id |
| commitment_amount | numeric(18,2) | Amount committed |
| funded_amount | numeric(18,2) | Amount funded so far |
| subscription_status | text | draft, submitted, approved, rejected, active |
| subscription_document_id | uuid | FK -> documents.id; nullable |
| reservation_status | text | reserved, confirmed, expired, cancelled |
| reservation_expires_at | timestamptz | Slot hold window — typically 30 minutes |
| fcfs_position | integer | Queue position at time of reservation |
| reserved_at | timestamptz | When the slot was reserved |
| confirmed_at | timestamptz | When the commitment was fully funded |
| created_at | timestamptz | Default now() |
| updated_at | timestamptz | Default now() |

## `capital_calls`

Capital calls against subscriptions.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| fund_id | uuid | FK -> funds.id |
| call_name | text | Capital call identifier |
| call_date | date | Call date |
| due_date | date | Due date |
| total_amount | numeric(18,2) | Total call amount |
| call_status | text | draft, issued, closed |
| created_at | timestamptz | Default now() |

## `allocations`

Maps investor capital to loans or pools.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| subscription_id | uuid | FK -> subscriptions.id |
| loan_id | uuid | FK -> loans.id |
| allocation_amount | numeric(18,2) | Allocated capital |
| allocation_date | date | Date allocated |
| allocation_status | text | active, exited, reduced |
| created_at | timestamptz | Default now() |

## `distributions` ⚡ PARTITIONED (partition: `distribution_date`, interval: 1 month)

Investor distribution records.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| subscription_id | uuid | FK -> subscriptions.id |
| distribution_date | date | Distribution date — partition key |
| principal_amount | numeric(18,2) | Principal distributed |
| interest_amount | numeric(18,2) | Interest distributed |
| fee_amount | numeric(18,2) | Fee offsets if applicable |
| total_amount | numeric(18,2) | Total distribution |
| created_at | timestamptz | Default now() |

## `investor_statements`

Periodic reporting statements.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| investor_id | uuid | FK -> investors.id |
| fund_id | uuid | FK -> funds.id |
| statement_period_start | date | Statement period start |
| statement_period_end | date | Statement period end |
| document_id | uuid | FK -> documents.id |
| created_at | timestamptz | Default now() |

## `tax_documents`

Investor tax form records.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| investor_id | uuid | FK -> investors.id |
| fund_id | uuid | FK -> funds.id |
| tax_year | integer | Tax year |
| document_type | text | k1, 1099, other |
| document_id | uuid | FK -> documents.id |
| created_at | timestamptz | Default now() |

---

# 8. Operations and Control Tables

## `activity_logs` ⚡ PARTITIONED (partition: `created_at`, interval: 1 week)

User-facing or operational events.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| actor_profile_id | uuid | FK -> profiles.id; nullable |
| entity_type | text | application, loan, investor, document |
| entity_id | uuid | Related record |
| action | text | created, updated, viewed, uploaded, approved |
| metadata | jsonb | Optional event metadata |
| created_at | timestamptz | Default now() — partition key |

## `audit_events` ⚡ PARTITIONED (partition: `created_at`, interval: 1 month)

Immutable administrative and security events. Append-only — never update or delete rows.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| actor_profile_id | uuid | FK -> profiles.id; nullable |
| event_type | text | permission_change, login, export, delete, override |
| entity_type | text | Optional |
| entity_id | uuid | Optional |
| ip_address | inet | Optional |
| user_agent | text | Optional |
| event_payload | jsonb | Optional |
| created_at | timestamptz | Default now() — partition key |

## `webhook_events`

Incoming or outgoing webhook logs.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| source_system | text | plaid, ocrolus, n8n, internal |
| event_type | text | Event type |
| payload | jsonb | Webhook payload |
| processing_status | text | pending, processed, failed |
| created_at | timestamptz | Default now() |
| processed_at | timestamptz | Nullable |

## `notifications`

Notification queue and history.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| recipient_profile_id | uuid | FK -> profiles.id |
| notification_type | text | email, sms, in_app |
| subject | text | Optional |
| message | text | Notification content |
| delivery_status | text | pending, sent, failed, read |
| created_at | timestamptz | Default now() |
| sent_at | timestamptz | Nullable |

## `tasks`

Actionable task tracking.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| task_owner_type | text | application, loan, investor, underwriting_case |
| task_owner_id | uuid | Related entity |
| assigned_to | uuid | FK -> profiles.id |
| title | text | Task title |
| description | text | Optional |
| task_status | text | open, in_progress, completed, cancelled |
| due_date | date | Optional |
| created_at | timestamptz | Default now() |
| completed_at | timestamptz | Nullable |

---

# 9. Recommended Indexes

Create indexes on:

- `applications.borrower_id`
- `applications.application_status`
- `properties.application_id`
- `documents.owner_type, documents.owner_id`
- `underwriting_cases.application_id`
- `loans.application_id`
- `payments.loan_id`
- `allocations.loan_id`
- `subscriptions.investor_id`
- `tasks.assigned_to`
- `activity_logs.entity_type, activity_logs.entity_id`
- `audit_events.event_type`

---

# 10. Security and Access Notes

The schema should be paired with row-level security policies that enforce:

- borrowers can only view their own applications, documents, and loans
- investors can only view their own subscriptions, allocations, distributions, and tax documents
- underwriters can access borrower and application data required for review
- servicing users can access active loans and payment records
- admins and managers can access broad operational records subject to audit logging

Sensitive fields such as tax IDs, raw extraction text, and certain financial data should be additionally protected through encryption and limited query access.

---

# 11. Real-Time and Analytics Tables

## `fund_ticks` ⚡ PARTITIONED (partition: `ts`, interval: 1 day)

Real-time investor activity stream. Links to the relational `investors` and `funds` tables via UUID foreign keys. Powers real-time fund fill rate dashboards and contribution velocity charts.

| Column | Type | Notes |
|---|---|---|
| ts | timestamptz | **Hypertable partition key** — designated timestamp |
| investor_id | uuid | FK → investors.id |
| fund_id | uuid | FK → funds.id |
| action | text | `COMMITMENT_RESERVED`, `COMMITMENT_FUNDED`, `WITHDRAWAL`, `DIVIDEND_POSTED`, `KYC_PASSED`, `ACCREDITATION_VERIFIED` |
| amount | numeric(18,2) | Nullable — not all events carry amounts |
| metadata | jsonb | Optional event context |

## `onboarding_events` ⚡ PARTITIONED (partition: `ts`, interval: 1 day)

Investor onboarding funnel tracking for the real-time internal dashboard. Enables contribution velocity analysis, dropout detection, and out-of-order event handling.

| Column | Type | Notes |
|---|---|---|
| ts | timestamptz | **Hypertable partition key** |
| investor_id | uuid | FK → investors.id |
| fund_id | uuid | FK → funds.id; nullable |
| event_type | text | `FUNNEL_STARTED`, `KYC_SUBMITTED`, `KYC_PASSED`, `KYC_FAILED`, `DOCS_SENT`, `DOCS_SIGNED`, `ACCREDITATION_SUBMITTED`, `ACCREDITATION_VERIFIED`, `COMMITMENT_STARTED`, `COMMITMENT_FUNDED`, `DROPPED_OFF` |
| metadata | jsonb | Optional — source, browser, referrer |

---

# 12. Future Expansion Tables

Later phases may add:

- `wallets`
- `onchain_transactions`
- `pool_positions`
- `tokenized_interests`
- `reserve_attestations`
- `protocol_events`

These should remain separate from the core lending schema until the centralized platform is fully operational.


---
# Institutional Ledger Additions

To support institutional accounting standards the platform introduces a **double‑entry accounting system**.

## New Tables

ledger_accounts
ledger_transactions
ledger_entries

Example transaction:

Borrower payment

Debit: Borrower cash account  
Credit: Investor receivable account

Ledger entries are immutable and corrections require reversing entries.

## Reg A Support Tables

offerings  
offering_documents  
offering_updates  
reg_a_investor_limits  

## Tokenization Layer (Future)

wallets  
onchain_transactions  
tokenized_interests  
protocol_events  

