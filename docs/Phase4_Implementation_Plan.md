# Phase 4 Implementation Plan

Workflow Automation, E-Signatures, OCR / Document Intelligence, Compliance Hardening

---

## 1. Phase 4 Overview

### Goals

Phase 4 transforms the platform from a manually operated lending system into an automation-first infrastructure with regulatory-grade compliance controls. Phase 3 delivered the core loan lifecycle, underwriting, document management, and fund operations. Phase 4 adds the operational muscle:

1. **Workflow automation** -- eliminate manual bottlenecks by auto-creating tasks, auto-assigning cases, and triggering notifications on state changes
2. **E-signatures** -- gate loan closing and investor subscription on legally binding digital signatures
3. **OCR / document intelligence** -- extract structured data from uploaded financial documents and auto-populate application fields
4. **Compliance hardening** -- enforce KYC/AML verification, Reg A investor limits, Reg D accreditation workflows, and OFAC screening

### What success looks like

- An application moving to `under_review` automatically creates an underwriting case, assigns it, creates a task, and notifies the underwriter -- zero manual steps
- A loan cannot move from `approved` to `funded` without signed closing documents (promissory note, deed of trust, loan agreement)
- An investor subscription cannot be activated without a signed subscription agreement
- Uploaded bank statements are parsed, and extracted balances pre-populate the application -- with human review before acceptance
- No investor can exceed Reg A investment limits; accredited investor status is verified and tracked with expiry dates
- Every new integration (e-sign, OCR, KYC) emits audit events and has webhook signature verification

### Connection to Phase 3 and Phase 5

Phase 4 depends on Phase 3 infrastructure:
- `notifications` table + `emitNotification()` -- wired in Phase 3
- `tasks` table + full CRUD -- wired in Phase 3
- `audit_events` table + `emitAuditEvent()` -- wired in Phase 3
- `documents` table + Supabase Storage buckets -- wired in Phase 3
- `underwriting_cases`, `conditions`, `risk_flags` -- wired in Phase 3
- Loan state machine (`src/lib/loan/state-machine.ts`) -- wired in Phase 3
- `fund_subscriptions` with FCFS locking -- wired in Phase 3

Phase 4 produces infrastructure Phase 5 will need:
- Signed subscription agreements (required before tokenized interests can be issued)
- KYC/AML verification status (required for on-chain identity attestations)
- Accreditation verification records (required for Reg D token offerings)
- Webhook event infrastructure (reusable for blockchain event indexing)
- `document_extractions` table (reusable for on-chain proof-of-reserve data feeds)

---

## 2. Step Breakdown

Phase 4 is divided into four steps, executed in order.

---

### Step 1 -- Workflow Automation (n8n)

**Goal**: Automate task creation, case assignment, notifications, and status-driven triggers across the loan lifecycle and investor onboarding. Eliminate the need for admin/manager to manually create tasks and notify staff after every state change.

**Dependencies**: Phase 3 complete (tasks, notifications, underwriting_cases, audit_events, state machine)

**New database tables or schema changes**:

| Table | Change |
|---|---|
| `workflow_triggers` (new) | Stores trigger definitions: event type, conditions, actions |
| `workflow_executions` (new) | Logs every workflow execution for auditability |
| `webhook_events` (existing) | Already defined in schema -- begin writing to it for n8n events |

#### `workflow_triggers`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| name | text | Human-readable trigger name |
| event_type | text | e.g. `application_status_changed`, `document_uploaded`, `payment_received` |
| conditions | jsonb | Optional filter (e.g. `{"new_status": "under_review"}`) |
| actions | jsonb | Array of actions: `create_task`, `assign_case`, `send_notification`, `send_email` |
| is_active | boolean | Default true |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| created_by | uuid | |

#### `workflow_executions`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| trigger_id | uuid | FK -> workflow_triggers.id |
| event_payload | jsonb | The event that fired the trigger |
| execution_status | text | `success`, `partial_failure`, `failed` |
| actions_executed | jsonb | Results of each action |
| executed_at | timestamptz | |
| duration_ms | integer | Execution time |
| created_at | timestamptz | |

**New API routes**:

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/api/admin/workflows` | admin, manager | List all workflow triggers |
| POST | `/api/admin/workflows` | admin | Create a workflow trigger |
| PATCH | `/api/admin/workflows/[id]` | admin | Update a workflow trigger (enable/disable, change actions) |
| DELETE | `/api/admin/workflows/[id]` | admin | Delete a workflow trigger |
| GET | `/api/admin/workflows/[id]/executions` | admin, manager | View execution history for a trigger |
| POST | `/api/webhooks/n8n` | n8n (API key auth) | Inbound webhook from n8n to trigger platform actions |

**New UI pages/components**:

- `/dashboard/admin/workflows` -- list triggers, toggle active/inactive, view execution counts
- `CreateWorkflowForm` -- select event type, define conditions, choose actions
- `WorkflowExecutionLog` -- expandable execution history per trigger

**Integration points**:

- n8n connects to Supabase via **database triggers firing webhooks** (preferred) or **polling the `audit_events` table**
- n8n self-hosted instance (recommended -- see Section 4 below) receives events and orchestrates multi-step workflows
- Existing `emitAuditEvent()` calls become the event source -- n8n subscribes to new audit events
- Existing `emitNotification()` is called by workflow actions
- Existing task CRUD API is called by workflow actions

**Key implementation notes**:

- Start with five high-value workflows (see Section 4 for prioritized list)
- n8n webhook endpoint requires HMAC signature verification (shared secret in env)
- Workflow executions must be logged for SOC2 audit trail
- Workflow triggers are admin-only; managers can view but not create/modify
- Rate limit the n8n webhook endpoint: 100 requests/minute by API key

**Risks**:
- n8n self-hosted requires a persistent host (not serverless) -- use a small Render/Railway/Fly.io instance or Docker on a VPS
- Webhook delivery is at-least-once -- actions must be idempotent (check if task/case already exists before creating)

---

### Step 2 -- E-Signatures

**Goal**: Require legally binding digital signatures on loan closing documents and investor subscription agreements before state transitions proceed. Signed documents are stored in Supabase Storage and linked to the `documents` table.

**Dependencies**: Step 1 (workflow automation triggers signature requests automatically), Phase 3 documents table

**New database tables or schema changes**:

#### `signature_requests`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| entity_type | text | `application`, `subscription` |
| entity_id | uuid | FK to application or subscription |
| provider | text | `docusign`, `dropbox_sign`, `boldsign` |
| provider_request_id | text | External envelope/request ID |
| template_id | text | Provider template ID |
| status | text | `draft`, `sent`, `viewed`, `signed`, `declined`, `expired`, `voided` |
| signers | jsonb | Array of signer objects: `{name, email, role, signed_at}` |
| sent_at | timestamptz | |
| completed_at | timestamptz | |
| declined_at | timestamptz | |
| decline_reason | text | Nullable |
| signed_document_id | uuid | FK -> documents.id; populated after completion |
| callback_url | text | Webhook URL registered with provider |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| created_by | uuid | |

#### Application state machine changes

Add an intermediate state `pending_closing` between `approved` and `funded`:

```
approved → pending_closing → funded
```

The `pending_closing` state is entered when closing documents are sent for signature. The transition to `funded` is blocked until the `signature_requests` record for that application has `status = 'signed'`.

Update `APPLICATION_TRANSITIONS` in `src/lib/loan/state-machine.ts`:
```
approved: ['pending_closing', 'declined']
pending_closing: ['funded', 'declined']
```

Update `getRequiredDocumentsForApplication('funded')` to also check `signature_requests.status === 'signed'`.

**New API routes**:

| Method | Path | Roles | Description |
|---|---|---|---|
| POST | `/api/signatures/request` | admin, manager | Create and send a signature request |
| GET | `/api/signatures/[id]` | admin, manager, borrower, investor | Get signature request status |
| GET | `/api/signatures` | admin, manager | List all signature requests (filterable by entity) |
| POST | `/api/webhooks/esign` | e-sign provider (signature verified) | Inbound webhook for sign/decline/expire events |
| POST | `/api/signatures/[id]/void` | admin | Void an active signature request |
| POST | `/api/signatures/[id]/resend` | admin, manager | Resend signature request to signers |

**New UI pages/components**:

- `SignatureStatusBadge` -- shows current signing status on application detail and subscription detail
- `SendForSignatureButton` -- on admin application detail (when status = `approved`) and subscription detail
- `SignatureRequestDetail` -- modal/panel showing signers, status, timestamps
- Borrower application detail: "Sign Documents" CTA when a signature request is pending for them
- Investor subscription detail: "Sign Subscription Agreement" CTA

**Integration points**:

- E-sign provider SDK called from server-only API routes
- Webhook endpoint receives completion/decline events
- On `signed` event: download signed PDF from provider, upload to Supabase Storage, create `documents` record, update `signature_requests.signed_document_id`
- On `signed` event for loan closing: auto-transition application from `pending_closing` to `funded` (via workflow trigger from Step 1)
- On `signed` event for subscription: update `fund_subscriptions.subscription_status` to `active`
- `emitAuditEvent()` for every signature lifecycle event

**Key implementation notes**:

- See Section 3 for e-sign provider recommendation
- All provider API keys stored in env vars, server-only
- Webhook signature verification is mandatory -- reject unsigned payloads with 401
- Signed PDFs stored in `loans/{loan_id}/closing/` or `investors/{investor_id}/agreements/` paths
- Template IDs are stored in env vars per document type
- Support multiple signers per envelope (e.g. borrower + guarantor on promissory note)

**Risks**:
- Provider rate limits on sandbox environments may slow testing
- Webhook delivery order is not guaranteed -- handle out-of-order events gracefully
- Provider downtime blocks closing -- implement retry with exponential backoff on send failures

---

### Step 3 -- OCR / Document Intelligence

**Goal**: Automatically extract structured data from uploaded financial documents (bank statements, pay stubs, tax returns) and pre-populate application fields. A human review step ensures accuracy before data is committed.

**Dependencies**: Phase 3 documents table, document upload flow, `document_extractions` table (already in canonical schema)

**New database tables or schema changes**:

The `document_extractions` table is already defined in `docs/Database_Schema.md`. No new table needed -- use the existing schema:

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| document_id | uuid | FK -> documents.id |
| provider_name | text | `ocrolus`, `argyle`, `manual` |
| extraction_status | text | `pending`, `processing`, `completed`, `failed`, `reviewed`, `accepted`, `rejected` |
| extracted_json | jsonb | Parsed structured data |
| raw_text | text | Optional, access-controlled |
| confidence_score | numeric(5,2) | 0.00 - 100.00 |
| reviewed_by | uuid | FK -> profiles.id; nullable -- set when human reviews |
| reviewed_at | timestamptz | |
| created_at | timestamptz | |

Add two new status values beyond the original schema: `reviewed` (human looked at it), `accepted` (data committed to application fields), `rejected` (human rejected extraction).

#### `extraction_field_mappings`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| extraction_id | uuid | FK -> document_extractions.id |
| source_field | text | Field name from OCR JSON (e.g. `average_daily_balance`) |
| target_entity | text | `application`, `borrower`, `property` |
| target_field | text | Field in the target entity (e.g. `bank_balance_avg_3mo`) |
| extracted_value | text | The value extracted |
| confidence | numeric(5,2) | Per-field confidence |
| status | text | `pending`, `accepted`, `rejected`, `overridden` |
| override_value | text | Nullable -- human-entered correction |
| reviewed_by | uuid | Nullable |
| created_at | timestamptz | |

**New API routes**:

| Method | Path | Roles | Description |
|---|---|---|---|
| POST | `/api/documents/[id]/extract` | admin, manager, underwriter | Trigger OCR extraction for a document |
| GET | `/api/documents/[id]/extraction` | admin, manager, underwriter | Get extraction results and field mappings |
| PATCH | `/api/documents/[id]/extraction` | admin, manager, underwriter | Review extraction: accept/reject fields, override values |
| POST | `/api/documents/[id]/extraction/apply` | admin, manager | Apply accepted fields to the application record |
| POST | `/api/webhooks/ocr` | OCR provider (API key auth) | Inbound webhook for extraction completion |

**New UI pages/components**:

- `ExtractionReviewPanel` -- side-by-side view: original document (PDF viewer) on left, extracted fields on right
- Per-field accept/reject/override controls with confidence indicators
- `ExtractionStatusBadge` -- shows extraction progress on document list
- "Extract Data" button on admin document detail (when document type is extractable)
- "Apply to Application" button after review -- commits accepted values

**Integration points**:

- Ocrolus API called server-side on extraction trigger
- Argyle API called server-side for employment/income documents
- Webhook receives extraction completion, updates `document_extractions.extraction_status`
- Accepted extractions update application fields via existing `/api/applications/[id]/fields` PATCH route
- Workflow trigger (Step 1): when document status becomes `verified`, auto-trigger extraction if document type is extractable
- `emitAuditEvent()` for extraction trigger, review, and field application

**Key implementation notes**:

- See Section 5 for OCR provider recommendation
- Only auto-extract for these document types: `bank_statement`, `tax_return`, `pay_stub`, `appraisal`
- Confidence threshold: fields below 85% confidence are auto-flagged for manual review
- PII in `raw_text` must be treated as Restricted data -- access-logged and encrypted at rest
- Never auto-apply extracted data without human review -- always require the "Apply to Application" step
- Extraction results are immutable; corrections go in `override_value`

**Risks**:
- OCR accuracy varies by document quality -- scanned PDFs vs native PDFs have very different extraction rates
- Provider costs scale per document -- implement budget alerts
- Large documents (50+ page bank statements) may timeout -- implement async processing with status polling

---

### Step 4 -- Compliance Hardening

**Goal**: Implement enforced compliance workflows for KYC/AML verification, Reg A investor investment limits, Reg D accredited investor verification, OFAC screening, and accreditation expiry monitoring.

**Dependencies**: Steps 1-3 (workflows trigger compliance checks, e-signatures gate subscription activation, OCR extracts verification data)

**New database tables or schema changes**:

#### `kyc_verifications`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| entity_type | text | `borrower`, `investor` |
| entity_id | uuid | FK to borrower or investor |
| provider | text | `persona`, `jumio`, `plaid_identity`, `manual` |
| provider_reference_id | text | External verification ID |
| verification_type | text | `identity`, `address`, `document` |
| status | text | `pending`, `in_progress`, `verified`, `failed`, `expired` |
| result_json | jsonb | Provider result payload |
| failure_reason | text | Nullable |
| verified_at | timestamptz | |
| expires_at | timestamptz | Nullable -- some verifications expire |
| retry_count | integer | Default 0 |
| max_retries | integer | Default 3 |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| created_by | uuid | |

#### `aml_screenings`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| entity_type | text | `borrower`, `investor` |
| entity_id | uuid | FK to borrower or investor |
| provider | text | `ofac_sdn`, `dow_jones`, `lexisnexis`, `manual` |
| provider_reference_id | text | External screening ID |
| screening_type | text | `ofac`, `pep`, `sanctions`, `adverse_media` |
| status | text | `pending`, `clear`, `match`, `false_positive`, `confirmed_match` |
| result_json | jsonb | Provider result payload |
| match_details | text | Nullable -- description of match if found |
| reviewed_by | uuid | Nullable -- required if status is `false_positive` or `confirmed_match` |
| reviewed_at | timestamptz | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### `accreditation_records`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| investor_id | uuid | FK -> investors.id |
| verification_method | text | `income`, `net_worth`, `professional_certification`, `entity_assets`, `third_party_letter` |
| provider | text | `verify_investor`, `parallel_markets`, `manual` |
| provider_reference_id | text | Nullable |
| status | text | `pending`, `verified`, `expired`, `rejected` |
| verified_at | timestamptz | |
| expires_at | timestamptz | Accreditation valid for 90 days per SEC guidance |
| evidence_document_id | uuid | FK -> documents.id |
| reviewed_by | uuid | Nullable |
| notes | text | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### `investor_limit_tracking`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| investor_id | uuid | FK -> investors.id |
| offering_type | text | `reg_a`, `reg_d`, `reg_cf` |
| period_start | date | Rolling 12-month period start |
| period_end | date | Rolling 12-month period end |
| invested_amount | numeric(18,2) | Total invested in period |
| limit_amount | numeric(18,2) | Max allowed (e.g. $2,500 for non-accredited Reg A) |
| remaining_capacity | numeric(18,2) | Computed: limit - invested |
| last_calculated_at | timestamptz | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**New API routes**:

| Method | Path | Roles | Description |
|---|---|---|---|
| POST | `/api/compliance/kyc/initiate` | admin, manager | Initiate KYC verification for borrower or investor |
| GET | `/api/compliance/kyc/[id]` | admin, manager | Get KYC verification status |
| POST | `/api/compliance/kyc/[id]/retry` | admin | Retry a failed KYC verification |
| POST | `/api/compliance/aml/screen` | admin, manager | Initiate AML/OFAC screening |
| GET | `/api/compliance/aml/[id]` | admin, manager | Get screening result |
| PATCH | `/api/compliance/aml/[id]` | admin | Resolve a match (false_positive or confirmed_match) |
| POST | `/api/compliance/accreditation/verify` | admin, manager | Initiate accreditation verification |
| GET | `/api/compliance/accreditation/[investor_id]` | admin, manager, investor | Get accreditation status |
| PATCH | `/api/compliance/accreditation/[id]` | admin | Update accreditation record (manual review) |
| GET | `/api/compliance/investor-limits/[investor_id]` | admin, manager, investor | Get current investment limits and usage |
| POST | `/api/compliance/investor-limits/check` | admin, manager | Pre-flight check: can this investor invest $X in offering Y? |
| POST | `/api/webhooks/kyc` | KYC provider (signature verified) | Inbound webhook for verification completion |
| GET | `/api/admin/compliance/dashboard` | admin, manager | Compliance overview: pending KYC, expiring accreditations, limit breaches |

**New UI pages/components**:

- `/dashboard/admin/compliance` -- compliance dashboard with tabs: KYC Queue, AML Alerts, Accreditation Tracker, Investor Limits
- `KYCStatusBadge` -- on borrower and investor detail pages
- `AMLScreeningResult` -- expandable panel showing match details
- `AccreditationStatusCard` -- on investor detail, shows status, expiry, renewal CTA
- `InvestorLimitGauge` -- visual indicator of remaining investment capacity
- `ComplianceAlertBanner` -- shown on investor subscription flow when limits are near or exceeded
- Investor-facing: `/dashboard/investor/compliance` -- view own KYC status, accreditation status, investment limits

**Integration points**:

- KYC provider (Persona recommended -- see Section 6) called on borrower/investor onboarding
- OFAC SDN list check called before every subscription approval and loan funding
- Accreditation verification called during investor onboarding (Reg D path)
- `investor_limit_tracking` checked before every subscription creation (FCFS reservation step)
- Workflow trigger (Step 1): when investor onboarding starts, auto-initiate KYC + AML screening
- Workflow trigger: 30 days before accreditation expires, create task + send notification
- Workflow trigger: when AML screening returns `match`, create high-priority task for compliance officer
- `emitAuditEvent()` for all compliance actions

**Key implementation notes**:

- Reg A non-accredited investor limit: **max($2,500, 10% of annual income or net worth)** per 12-month rolling period -- not a flat $2,500 cap; the greater of the two applies
- Reg D 506(c) requires **reasonable steps to verify** accredited investor status -- self-certification is not sufficient
- Accreditation expires after 90 days per SEC guidance -- must track and re-verify
- OFAC screening must occur at subscription approval and periodically (quarterly recommended)
- KYC failures allow up to 3 retries before requiring manual review
- AML match resolution requires two-person review (maker-checker pattern) -- enforce via role check
- All compliance data is Restricted classification -- access-logged, encrypted at rest
- Data retention: KYC/AML records must be retained for 5 years after relationship termination (BSA requirement)
- CCPA right-to-deletion: compliance records are exempt from deletion under regulatory retention requirements -- document this in privacy policy

**Risks**:
- KYC provider outages can block onboarding -- implement graceful degradation (allow provisional status with time-boxed resolution)
- False positive AML matches are common -- build efficient review workflows to avoid bottlenecking subscriptions
- Reg A limit calculation across multiple offerings is complex -- ensure the rolling 12-month window accounts for all offerings, not just the current fund

---

## 3. E-Signature Integration

### Recommended service: Dropbox Sign (HelloSign)

**Rationale**:

| Criteria | DocuSign | Dropbox Sign (HelloSign) | BoldSign |
|---|---|---|---|
| API quality | Excellent but complex | Excellent, clean REST API | Good, simpler |
| Embedded signing | Yes | Yes -- best-in-class UX | Yes |
| Template management | Yes | Yes | Yes |
| Webhook reliability | Good | Good | Good |
| Sandbox environment | Free | Free | Free |
| Pricing (production) | $25-65/user/month | $20-50/user/month | $12-36/user/month |
| Compliance (ESIGN, UETA) | Yes | Yes | Yes |
| Audit trail | Built-in | Built-in | Built-in |
| API rate limits | 1000 req/hr (production) | 500 req/hr (production) | 200 req/hr |
| Setup complexity | High | Medium | Low |

**Recommendation**: Dropbox Sign offers the best balance of API ergonomics, embedded signing UX, compliance, and cost. DocuSign is over-engineered for this stage. BoldSign is cheaper but has lower rate limits and a smaller ecosystem. Switch to DocuSign later if enterprise clients require it.

### How it slots into the loan state machine

Current flow:
```
approved → funded → closed
```

Updated flow with e-signatures:
```
approved → pending_closing → funded → closed
```

Transition guards:
- `approved → pending_closing`: Admin triggers "Send for Signature" which creates a `signature_requests` record and sends the envelope
- `pending_closing → funded`: Blocked until `signature_requests.status === 'signed'` for all required closing documents
- The webhook handler for `signed` events auto-transitions the application if all documents are signed

### How it slots into the investor subscription flow

Current flow:
```
fund_subscriptions: draft → submitted → approved → active
```

Updated flow:
```
fund_subscriptions: draft → submitted → approved → pending_signature → active
```

- `approved → pending_signature`: Subscription agreement sent for signature
- `pending_signature → active`: Blocked until signature request is completed
- On `signed` webhook: update subscription status, create `documents` record for signed agreement

### Document templates needed

| Template | Signers | Trigger Point |
|---|---|---|
| Promissory Note | Borrower (+ guarantor if applicable) | Application reaches `approved` |
| Deed of Trust / Mortgage | Borrower | Application reaches `approved` |
| Loan Agreement | Borrower, NexusBridge (counter-sign) | Application reaches `approved` |
| Subscription Agreement | Investor | Subscription reaches `approved` |
| PPM Acknowledgment | Investor | Subscription reaches `approved` (Reg D only) |
| Condition Satisfaction Acknowledgment | Borrower | All conditions marked `satisfied` |

Templates are maintained in the e-sign provider dashboard. Template IDs stored in env vars:
```
ESIGN_TEMPLATE_PROMISSORY_NOTE=xxx
ESIGN_TEMPLATE_DEED_OF_TRUST=xxx
ESIGN_TEMPLATE_LOAN_AGREEMENT=xxx
ESIGN_TEMPLATE_SUBSCRIPTION_AGREEMENT=xxx
ESIGN_TEMPLATE_PPM_ACKNOWLEDGMENT=xxx
```

### Webhook handling

The `/api/webhooks/esign` endpoint must:

1. Verify the webhook signature using the provider's shared secret (reject unsigned requests with 401)
2. Parse the event type: `signature_request_signed`, `signature_request_declined`, `signature_request_expired`
3. Look up the `signature_requests` record by `provider_request_id`
4. Update the record status
5. For `signed`: download the completed PDF from the provider API, upload to Supabase Storage, create a `documents` record, link via `signed_document_id`
6. For `declined`: set `decline_reason`, create a task for admin review, notify the counterparty
7. For `expired`: update status, create a task for admin to resend or void
8. Emit audit event for every webhook event
9. Write to `webhook_events` table for full payload retention

### Storage of signed documents

Signed documents are stored in Supabase Storage under:
```
loans/{loan_id}/closing/signed_promissory_note.pdf
loans/{loan_id}/closing/signed_deed_of_trust.pdf
loans/{loan_id}/closing/signed_loan_agreement.pdf
investors/{investor_id}/agreements/signed_subscription_agreement.pdf
```

Each signed document gets a `documents` table record with:
- `owner_type`: `loan` or `investor`
- `document_type`: `signed_promissory_note`, `signed_deed_of_trust`, etc.
- `review_status`: `verified` (auto-set -- provider-signed documents are inherently verified)

### Audit trail requirements

Every signature lifecycle event must produce:
- An `audit_events` record with `event_type`: `signature_requested`, `signature_viewed`, `signature_signed`, `signature_declined`, `signature_expired`, `signature_voided`
- The audit event must include: `entity_type` (application/subscription), `entity_id`, signer info, provider reference ID
- The e-sign provider's built-in audit trail (certificate of completion) is downloaded and stored alongside the signed document

---

## 4. Workflow Automation (n8n)

### Prioritized workflows

Implement in this order:

| Priority | Workflow | Trigger | Actions |
|---|---|---|---|
| 1 | **Auto-assign underwriting** | Application status → `under_review` | Create underwriting case, assign to available underwriter (round-robin or least-loaded), create task "Review application {number}", notify underwriter |
| 2 | **Document upload notification** | New document uploaded | Notify assigned reviewer/underwriter, create task "Review document {type} for {application}" |
| 3 | **Condition satisfaction check** | All conditions on a case → `satisfied` | Notify admin/manager "All conditions met for {application}", auto-transition to `approved` if configured |
| 4 | **Payment received alerts** | New payment recorded | Notify borrower (receipt), update loan balance, check if loan is paid off |
| 5 | **Delinquency detection** | pg_cron daily scan: payment_schedule where due_date < today AND status = 'due' | Create delinquency record, notify servicing team, create task "Follow up on delinquent loan {number}" |
| 6 | **Accreditation expiry warning** | pg_cron daily scan: accreditation_records where expires_at < today + 30 days | Notify investor, create task for admin "Investor {name} accreditation expiring" |
| 7 | **Closing document trigger** | Application status → `approved` | Send closing documents for e-signature (Step 2 integration) |
| 8 | **Investor subscription signing** | Subscription status → `approved` | Send subscription agreement for e-signature |
| 9 | **Task overdue escalation** | pg_cron daily scan: tasks where due_date < today AND status IN ('open', 'in_progress') | Notify task assignee, notify their manager, add "OVERDUE" flag |
| 10 | **Application status notifications** | Any application status change | Notify borrower (in-app + email) -- this already exists but should move to n8n for consistency |

### n8n self-hosted vs cloud

**Recommendation: Self-hosted**

| Factor | Self-hosted | Cloud |
|---|---|---|
| Cost | $5-20/month (small VPS) | $20-50/month (starter plan) |
| Data residency | Full control -- financial data stays in your infra | Data transits n8n cloud servers |
| Compliance | Easier SOC2 narrative -- "all data stays in controlled infrastructure" | Requires vendor risk assessment |
| Scaling | Manual | Automatic |
| Setup complexity | Medium (Docker compose) | Low |

For a regulated financial platform, self-hosted is the right call. Deploy via Docker on Railway, Render, or a $10/month DigitalOcean droplet. Use a persistent PostgreSQL database for n8n's internal state (not the Supabase database -- keep it separate).

### How n8n connects to Supabase

**Primary method: Webhook triggers**

1. Platform API routes (e.g. application status change) make an HTTP POST to the n8n webhook URL after the primary DB operation succeeds
2. n8n receives the event payload and executes the workflow
3. n8n calls back into the platform's API routes to create tasks, send notifications, etc.

```
API Route (status change) → POST to n8n webhook → n8n workflow executes
                                                  → POST /api/tasks (create task)
                                                  → POST /api/notifications (internal helper)
                                                  → emitAuditEvent (via API)
```

**Secondary method: Scheduled polling (for pg_cron-equivalent jobs)**

For workflows triggered by time (delinquency detection, accreditation expiry), n8n uses a Cron trigger node that:
1. Queries the Supabase database directly via the Supabase REST API (using the service role key)
2. Processes results and triggers actions

**Tertiary method: Supabase Database Webhooks**

Supabase supports database webhooks (pg_net) that fire HTTP requests on INSERT/UPDATE/DELETE. This is the most real-time option but requires careful configuration:
- Enable `pg_net` extension
- Create webhook triggers on relevant tables
- Point to n8n webhook URLs

### Security considerations for n8n webhooks

1. **Inbound (platform → n8n)**: Authenticate with a shared API key in the `Authorization` header. Store as `N8N_WEBHOOK_SECRET` in env.
2. **Outbound (n8n → platform)**: n8n authenticates to platform API routes using a dedicated service account API key. Store as `PLATFORM_SERVICE_KEY` in n8n credentials.
3. **Webhook URLs**: Use HTTPS only. Never expose n8n webhook URLs publicly without authentication.
4. **n8n access**: Restrict n8n admin UI access to VPN or IP allowlist. Enable n8n's built-in basic auth at minimum; SSO if available.
5. **Credential storage**: n8n encrypts credentials at rest. Use a strong `N8N_ENCRYPTION_KEY`.
6. **Execution logging**: Enable n8n execution logging for SOC2 audit trail. Export logs periodically to the platform's audit system.

---

## 5. OCR / Document Intelligence

### Recommendation: Ocrolus (primary) + Argyle (secondary)

| Factor | Ocrolus | Argyle |
|---|---|---|
| Specialization | Financial document parsing (bank statements, tax returns, pay stubs) | Employment and income verification (payroll data, employment history) |
| Document types | Bank statements (all formats), tax returns (1040, K-1, W-2), pay stubs, profit/loss | Pay stubs, W-2s, employment letters (via payroll provider connections) |
| Accuracy | 99%+ for supported document types | 99%+ for connected payroll providers |
| Pricing model | Per document ($2-5/document depending on type and volume) | Per verification ($5-15/verification) |
| Integration | REST API + webhooks | REST API + webhooks + embedded widget |
| PII handling | SOC2 Type II certified, data encrypted at rest and in transit | SOC2 Type II certified |
| Turnaround | 1-30 minutes depending on document complexity | Real-time for connected providers, minutes for document upload |

**Implementation approach**:
1. **Ocrolus first** -- covers the highest-volume document types in lending (bank statements and tax returns)
2. **Argyle second** -- adds employment/income verification for borrowers with supported payroll providers
3. **Manual fallback** -- for documents neither provider supports, mark extraction as `manual` and route to human reviewer

### Document types to parse first (in priority order)

1. **Bank statements** (3-6 months) -- extract average daily balance, ending balance, deposit totals, NSF/overdraft flags, large deposit identification
2. **Tax returns (1040)** -- extract adjusted gross income, filing status, business income/loss
3. **Pay stubs** -- extract gross pay, net pay, YTD totals, employer name
4. **Property appraisals** -- extract as-is value, ARV, comparable sales (lower accuracy expected -- flag for human review)

### Data extraction to application field population flow

```
1. Document uploaded → status: pending_review
2. Admin/underwriter reviews and verifies document → status: verified
3. Workflow trigger fires → calls Ocrolus/Argyle API with document file
4. Provider processes document → webhook fires → extraction record created
5. Extraction results displayed in ExtractionReviewPanel
6. Reviewer accepts/rejects/overrides individual fields
7. "Apply to Application" commits accepted values to application record
8. Audit event logged: extraction_applied with before/after values
```

### Human review step

Human review is **mandatory** before any extracted data modifies application records. The system must never auto-apply OCR results. The review interface shows:

- Side-by-side: original document (embedded PDF viewer) and extracted data table
- Each extracted field has: value, confidence score, accept/reject/override controls
- Fields below 85% confidence are pre-flagged with a warning indicator
- Reviewer can override any value (stored in `extraction_field_mappings.override_value`)
- "Apply All Accepted" button commits the batch

### Confidence scoring and exception handling

| Confidence Range | Behavior |
|---|---|
| 95-100% | Green indicator, auto-accepted (still requires human confirmation) |
| 85-94% | Yellow indicator, human review required |
| Below 85% | Red indicator, flagged as low confidence, likely requires manual entry |
| Extraction failed | Create task "Manual data entry required for {document_type}", route to underwriter |

Exception scenarios:
- **Password-protected PDFs**: Reject at upload with clear error message
- **Image-only scans (no OCR layer)**: Route through Ocrolus's image processing pipeline (slower, lower accuracy)
- **Multi-account bank statements**: Extract all accounts, let reviewer select which to use
- **Foreign currency amounts**: Flag for manual review -- do not auto-convert

---

## 6. Compliance Hardening

### KYC/AML verification workflow

**Recommended KYC provider: Persona**

Persona offers identity verification (document + selfie), database checks, and watchlist screening in a single platform. Alternative: Jumio (higher cost, enterprise-focused) or Plaid Identity Verification (if already using Plaid for bank connections).

**Workflow**:
```
1. Borrower/investor completes onboarding form
2. Workflow trigger → initiate KYC verification via Persona API
3. User receives a Persona verification link (embedded or redirect)
4. User submits ID document + selfie
5. Persona processes → webhook fires with result
6. If verified: update borrower/investor kyc_status → 'verified'
7. If failed: increment retry_count; if < max_retries, allow retry; else flag for manual review
8. Auto-trigger AML/OFAC screening on KYC success
```

**Retry logic**: Up to 3 automated retries. After 3 failures, create a task for admin manual review. Common failure reasons: blurry photo, expired ID, name mismatch. Allow admin to manually override with documented reason (audit event required).

### Reg A investor limits enforcement

Per SEC Regulation A (Tier 2), non-accredited investors are limited to investing **the greater of**:
- 10% of their annual income, **or**
- 10% of their net worth

...in a rolling 12-month period across all Reg A offerings. If both income and net worth are unknown, the fallback limit is $2,500.

**Enforcement points**:
1. **Pre-flight check**: Before creating a fund subscription, query `investor_limit_tracking` for the investor's remaining capacity
2. **Subscription creation**: If `commitment_amount > remaining_capacity`, reject with 400 and clear error message
3. **Accredited investors**: Exempt from Reg A limits -- skip the check if `accreditation_status === 'verified'` and not expired
4. **Self-reported income/net worth**: Collected during investor onboarding, stored on the investor profile
5. **Recalculation**: `remaining_capacity` is recalculated on every subscription creation and daily via pg_cron

### Reg D accredited investor verification

Per SEC Rule 506(c), the issuer must take **reasonable steps to verify** accredited investor status. Self-certification alone is insufficient.

**Verification methods** (in order of preference):
1. **Third-party verification letter** -- CPA, attorney, registered broker-dealer, or investment adviser confirms accredited status
2. **Income verification** -- Tax returns (W-2, 1040) for the past two years showing income > $200K ($300K joint)
3. **Net worth verification** -- Bank/brokerage statements showing net worth > $1M (excluding primary residence)
4. **Professional certification** -- Series 7, 65, or 82 license holders are deemed accredited
5. **Entity verification** -- entities with > $5M in assets, or all equity owners are individually accredited

**Workflow**:
```
1. Investor selects verification method during onboarding
2. Investor uploads evidence document(s)
3. If using third-party provider (VerifyInvestor, Parallel Markets): API call initiates verification
4. Provider reviews documentation → webhook fires
5. If verified: create accreditation_record, set expires_at = verified_at + 90 days
6. If rejected: notify investor with reason, allow re-submission
7. On expiry (90 days): workflow trigger creates task, sends notification, blocks new subscriptions until re-verified
```

### Accreditation expiry monitoring

- pg_cron job (daily): scan `accreditation_records WHERE expires_at < NOW() + INTERVAL '30 days' AND status = 'verified'`
- 30 days before expiry: notification to investor + task for admin
- 7 days before expiry: reminder notification
- On expiry: update status to `expired`, block new subscriptions, notify admin
- Re-verification: investor submits new documentation, same workflow as initial verification

### OFAC screening integration

**Provider options**:
1. **Direct OFAC SDN list** -- free, updated daily by Treasury. Parse the CSV/XML list and match against investor names. Cheap but requires maintaining the matching logic.
2. **Dow Jones Risk & Compliance** -- comprehensive (OFAC + PEP + sanctions + adverse media). $500-2000/month. Best for institutional-grade compliance.
3. **LexisNexis Bridger** -- similar to Dow Jones. Enterprise pricing.
4. **ComplyAdvantage** -- API-first, developer-friendly. $200-800/month.

**Recommendation**: Start with direct OFAC SDN list matching (free) for MVP compliance. Upgrade to ComplyAdvantage when investor volume justifies the cost.

**Screening triggers**:
- Investor onboarding (after KYC verification)
- Before every subscription approval
- Quarterly re-screening of all active investors (pg_cron)
- Name change on any entity record

### Data retention and right-to-deletion

| Data Type | Retention Period | Deletion Rights |
|---|---|---|
| KYC verification records | 5 years after relationship ends (BSA/AML requirement) | Exempt from CCPA deletion |
| AML screening results | 5 years after relationship ends | Exempt from CCPA deletion |
| Accreditation records | 5 years after relationship ends | Exempt from CCPA deletion |
| Investor limit tracking | 7 years (SEC recordkeeping) | Exempt from CCPA deletion |
| Signed documents | Permanent (or per document retention policy) | Exempt -- legal agreements |
| OCR raw text | Delete after extraction is reviewed and accepted | Subject to CCPA deletion |
| Identity documents (uploaded) | 5 years after relationship ends | Exempt from CCPA deletion |

CCPA response: When a user requests deletion, compliance-exempt records are retained but marked as "retention-held". Non-exempt PII (marketing data, contact preferences) is deleted.

---

## 7. Security & SOC2 Impact

### New audit event types

| Event Type | Trigger | Phase 4 Step |
|---|---|---|
| `workflow_executed` | Any workflow trigger fires | Step 1 |
| `workflow_created` | Admin creates a workflow trigger | Step 1 |
| `workflow_updated` | Admin modifies a workflow trigger | Step 1 |
| `signature_requested` | Closing docs or subscription agreement sent | Step 2 |
| `signature_signed` | Document signed by all parties | Step 2 |
| `signature_declined` | Signer declines | Step 2 |
| `signature_voided` | Admin voids a signature request | Step 2 |
| `extraction_triggered` | OCR extraction initiated | Step 3 |
| `extraction_reviewed` | Human reviews extraction results | Step 3 |
| `extraction_applied` | Extracted data committed to application | Step 3 |
| `kyc_initiated` | KYC verification started | Step 4 |
| `kyc_completed` | KYC verification result received | Step 4 |
| `kyc_manual_override` | Admin overrides KYC result | Step 4 |
| `aml_screening_initiated` | AML/OFAC screening started | Step 4 |
| `aml_screening_completed` | Screening result received | Step 4 |
| `aml_match_resolved` | Admin resolves AML match | Step 4 |
| `accreditation_verified` | Investor accreditation confirmed | Step 4 |
| `accreditation_expired` | Accreditation expiry triggered | Step 4 |
| `investor_limit_exceeded` | Subscription blocked by investment limit | Step 4 |

### New rate limiters

| Endpoint | Identifier | Limit | Window |
|---|---|---|---|
| POST /api/webhooks/n8n | API key | 100 requests | 1 minute |
| POST /api/webhooks/esign | Provider IP | 50 requests | 1 minute |
| POST /api/webhooks/ocr | Provider IP | 50 requests | 1 minute |
| POST /api/webhooks/kyc | Provider IP | 50 requests | 1 minute |
| POST /api/signatures/request | User ID | 20 requests | 1 hour |
| POST /api/documents/[id]/extract | User ID | 30 requests | 1 hour |
| POST /api/compliance/kyc/initiate | User ID | 10 requests | 1 hour |
| POST /api/compliance/aml/screen | User ID | 20 requests | 1 hour |

### PII handling for OCR-extracted data

- `document_extractions.raw_text` is classified as **Restricted** data
- Access to raw_text requires `admin` or `manager` role -- underwriters see extracted_json (structured) only
- raw_text should be deleted after the extraction is reviewed and accepted (set to NULL)
- extraction_json may contain PII (SSN, account numbers) -- log access to this field via audit events
- Do not cache extraction results in browser localStorage or sessionStorage

### Webhook signature verification requirements

Every inbound webhook endpoint must verify the request signature before processing:

| Provider | Verification Method |
|---|---|
| n8n | HMAC-SHA256 of request body using shared secret |
| Dropbox Sign | HMAC-SHA256 using API app secret in `X-HelloSign-Signature` header |
| Ocrolus | API key in `Authorization` header |
| Persona (KYC) | HMAC-SHA256 using webhook secret in `Persona-Signature` header |

Unsigned or incorrectly signed requests must be rejected with 401 and logged as a security audit event.

---

## 8. Database Changes Summary

All new tables and columns introduced in Phase 4:

### New tables

| Table | Step | Purpose |
|---|---|---|
| `workflow_triggers` | 1 | Workflow automation trigger definitions |
| `workflow_executions` | 1 | Workflow execution audit log |
| `signature_requests` | 2 | E-signature envelope tracking |
| `extraction_field_mappings` | 3 | Per-field OCR extraction results and review status |
| `kyc_verifications` | 4 | KYC identity verification records |
| `aml_screenings` | 4 | AML/OFAC screening records |
| `accreditation_records` | 4 | Investor accreditation verification and expiry tracking |
| `investor_limit_tracking` | 4 | Reg A/D investment limit enforcement |

### Existing tables modified

| Table | Change | Step |
|---|---|---|
| `document_extractions` (canonical schema) | Add `reviewed_by`, `reviewed_at` columns; add `reviewed`, `accepted`, `rejected` status values | 3 |
| `applications` | Add `pending_closing` as valid `application_status` value | 2 |
| `fund_subscriptions` | Add `pending_signature` as valid `subscription_status` value | 2 |
| `webhook_events` | Begin writing to this table (already in schema, not yet populated) | 1 |
| `borrowers` | `kyc_status` and `aml_status` now written by automated providers (not just manual) | 4 |
| `investors` | `kyc_status` and `accreditation_status` now written by automated providers | 4 |

### RLS policies needed

All new tables require RLS policies:
- `workflow_triggers` / `workflow_executions`: admin read/write, manager read-only
- `signature_requests`: admin/manager full access, borrower/investor read own
- `extraction_field_mappings`: admin/manager/underwriter read/write
- `kyc_verifications`: admin/manager read/write, borrower/investor read own
- `aml_screenings`: admin/manager only (sensitive)
- `accreditation_records`: admin/manager read/write, investor read own
- `investor_limit_tracking`: admin/manager read/write, investor read own

---

## 9. External Service Dependencies

| Service | Step | Purpose | Credentials Needed | Sandbox | Est. Cost (Monthly) | Complexity |
|---|---|---|---|---|---|---|
| **n8n** (self-hosted) | 1 | Workflow automation | N8N_ENCRYPTION_KEY, platform webhook secret | N/A (self-hosted) | $5-20 (VPS hosting) | Medium |
| **Dropbox Sign** (HelloSign) | 2 | E-signatures | DROPBOX_SIGN_API_KEY, DROPBOX_SIGN_CLIENT_ID | Free sandbox | $20-50 | Medium |
| **Ocrolus** | 3 | Financial document OCR | OCROLUS_API_KEY, OCROLUS_CLIENT_SECRET | Free sandbox (limited) | $100-500 (volume-dependent) | Medium |
| **Argyle** | 3 | Employment/income verification | ARGYLE_API_KEY, ARGYLE_PLUGIN_KEY | Free sandbox | $100-400 (volume-dependent) | Medium |
| **Persona** | 4 | KYC identity verification | PERSONA_API_KEY, PERSONA_TEMPLATE_ID | Free sandbox | $100-500 (volume-dependent) | Medium |
| **OFAC SDN List** | 4 | Sanctions screening | None (public data) | N/A | $0 | Low |
| **ComplyAdvantage** (optional upgrade) | 4 | Comprehensive AML screening | COMPLY_ADVANTAGE_API_KEY | Free sandbox | $200-800 | Medium |
| **VerifyInvestor** (optional) | 4 | Third-party accreditation verification | VERIFY_INVESTOR_API_KEY | Free sandbox | $50-200 | Low |

### Environment variables to add

```
# Step 1 — n8n
N8N_WEBHOOK_URL=https://n8n.yourdomain.com/webhook/xxx
N8N_WEBHOOK_SECRET=your_shared_secret
PLATFORM_SERVICE_API_KEY=your_service_key_for_n8n

# Step 2 — E-signatures
DROPBOX_SIGN_API_KEY=xxx
DROPBOX_SIGN_CLIENT_ID=xxx
DROPBOX_SIGN_WEBHOOK_SECRET=xxx
ESIGN_TEMPLATE_PROMISSORY_NOTE=xxx
ESIGN_TEMPLATE_DEED_OF_TRUST=xxx
ESIGN_TEMPLATE_LOAN_AGREEMENT=xxx
ESIGN_TEMPLATE_SUBSCRIPTION_AGREEMENT=xxx
ESIGN_TEMPLATE_PPM_ACKNOWLEDGMENT=xxx

# Step 3 — OCR
OCROLUS_API_KEY=xxx
OCROLUS_CLIENT_SECRET=xxx
OCROLUS_WEBHOOK_SECRET=xxx
ARGYLE_API_KEY=xxx
ARGYLE_PLUGIN_KEY=xxx
ARGYLE_WEBHOOK_SECRET=xxx

# Step 4 — Compliance
PERSONA_API_KEY=xxx
PERSONA_TEMPLATE_ID=xxx
PERSONA_WEBHOOK_SECRET=xxx
COMPLY_ADVANTAGE_API_KEY=xxx  # optional
VERIFY_INVESTOR_API_KEY=xxx   # optional
```

All new env vars must be added to Vercel environment settings and marked as server-only (not prefixed with `NEXT_PUBLIC_`).

---

## 10. Implementation Order Recommendation

| Order | Step | Duration Estimate | Rationale |
|---|---|---|---|
| **1** | Workflow Automation (n8n) | 2-3 weeks | Foundation for all other steps. Workflows trigger e-signature sends, OCR extraction, and compliance checks. Without this, Steps 2-4 require manual triggers for every action. |
| **2** | E-Signatures | 2-3 weeks | Blocks the loan closing flow. Until e-signatures work, no loan can move from `approved` to `funded` in a production-ready way. This is the highest-value feature for actual loan origination. |
| **3** | OCR / Document Intelligence | 2-3 weeks | Accelerates underwriting by reducing manual data entry. Depends on the document upload flow (Phase 3) and workflow triggers (Step 1) to auto-initiate extraction. |
| **4** | Compliance Hardening | 3-4 weeks | Largest step -- multiple provider integrations, complex business rules (Reg A limits, accreditation expiry). Depends on KYC data that may be extracted via OCR (Step 3). Builds on workflow triggers (Step 1) for automated screening and expiry monitoring. |

**Total estimated duration**: 9-13 weeks

**Parallel work opportunities**:
- E-signature template creation (design) can start during Step 1 development
- OCR provider sandbox testing can start during Step 2 development
- Compliance database migrations can be applied during Step 3 development
- n8n workflow definitions can be refined iteratively as Steps 2-4 deliver new event types

---

## 11. Phase 4 to Phase 5 Bridge

Phase 4 produces four assets that Phase 5 (tokenization / HyFi layer) will directly depend on:

### 1. Verified identity graph

KYC/AML verification records create a verified identity graph for every borrower and investor. Phase 5 needs this for:
- On-chain identity attestations (ERC-725 or similar)
- Token transfer compliance (only verified investors can hold tokens)
- Cross-chain identity bridging

### 2. Signed legal agreements

E-signed subscription agreements establish the legal basis for tokenized investor participation. Phase 5 needs this for:
- Token issuance gated on signed agreements
- Smart contract constructor parameters derived from signed terms
- Regulatory safe harbor documentation

### 3. Accreditation verification

Reg D 506(c) accreditation records are required before issuing tokenized securities. Phase 5 needs this for:
- On-chain accreditation attestation (used by transfer restriction smart contracts)
- Token whitelist management (only accredited addresses can receive tokens)
- Automated re-verification before token transfers

### 4. Webhook and event infrastructure

The webhook handling patterns established in Phase 4 (signature verification, idempotent processing, audit logging) are directly reusable for:
- Blockchain event indexing (The Graph subgraph events)
- Smart contract event listeners
- Cross-chain bridge event handling

### 5. Document extraction pipeline

OCR-extracted financial data creates structured datasets that Phase 5 can use for:
- On-chain proof-of-reserve data feeds
- Automated NAV attestations
- Transparent portfolio reporting for tokenized fund interests

### Migration path

Phase 5 should not modify any Phase 4 tables. Instead, it introduces new tables (`wallets`, `onchain_transactions`, `tokenized_interests`, `protocol_events`) that reference Phase 4 records via foreign keys:
- `tokenized_interests.subscription_id` -> `fund_subscriptions.id`
- `wallets.investor_id` -> `investors.id`
- Token issuance requires: `kyc_verifications.status = 'verified'` AND `accreditation_records.status = 'verified'` AND `signature_requests.status = 'signed'`

---

## 12. Testing Requirements

### Unit tests

- Workflow trigger condition matching logic
- Reg A investment limit calculation (rolling 12-month window)
- Accreditation expiry detection logic
- State machine transitions with new `pending_closing` and `pending_signature` states
- OFAC SDN name matching algorithm (fuzzy match, aliases)
- OCR confidence threshold logic

### Integration tests

- E-sign webhook → signature_requests status update → application state transition
- OCR webhook → document_extractions creation → field mapping generation
- KYC webhook → kyc_verifications update → borrower/investor status update
- Workflow trigger → n8n webhook → task creation → notification sent
- Investor limit check → subscription rejection at capacity

### E2E tests

- Full loan lifecycle: apply → upload docs → underwriting → approve → sign closing docs → fund
- Full investor lifecycle: onboard → KYC → accreditation → sign subscription → subscribe to fund
- Reg A limit enforcement: non-accredited investor attempts to exceed limit → blocked with clear message
- Accreditation expiry: fast-forward time → verify expiry notification → verify subscription block → re-verify → unblock
