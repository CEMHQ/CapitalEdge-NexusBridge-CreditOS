# NexusBridge Document Management

This document defines the document management system used by the NexusBridge platform to store, classify, and retrieve files associated with borrowers, investors, loans, and compliance workflows.

All documents are stored in Supabase Storage and referenced via metadata records in the database.

------------------------------------------------------------------------

## Objectives

The document management system must:

-   support structured upload and retrieval across all platform domains
-   enforce access control so users only see documents they are authorized to view
-   maintain an auditable record of every document action (upload, review, approval, deletion)
-   support compliance workflows requiring document verification and expiration tracking
-   integrate with loan state transitions that are gated on document completion

------------------------------------------------------------------------

## Document Categories

Documents are classified by category and domain:

### Borrower Documents

-   Loan application (signed)
-   Personal financial statement
-   Tax returns (1–2 years)
-   Bank statements (3–6 months)
-   Entity formation documents (LLC/Corp)
-   Purchase contract or letter of intent
-   Property appraisal or BPO
-   Title report or commitment
-   Insurance certificate
-   Draw request forms (for renovation loans)

### Investor Documents

-   Subscription agreement
-   Accreditation verification (form W-9, CPA letter, broker letter)
-   Operating agreement or PPM acknowledgment
-   Wire instructions confirmation
-   Distribution statements
-   K-1 / tax reporting documents
-   Capital account statements

### Loan Documents

-   Term sheet
-   Promissory note
-   Deed of trust or mortgage
-   Closing disclosure
-   Title insurance policy
-   Funding authorization
-   Payoff letter

### Compliance Documents

-   KYC identity verification records
-   AML screening results
-   Offering circular (Reg A)
-   Form D filing (Reg D)
-   Investor limit tracking records
-   Audit export packages

------------------------------------------------------------------------

## Storage Model

Documents are stored in Supabase Storage under a structured path convention:

```
{domain}/{entity_id}/{category}/{filename}

Examples:
borrowers/{borrower_id}/tax_returns/2023_1040.pdf
loans/{loan_id}/closing/promissory_note.pdf
investors/{investor_id}/accreditation/cpa_letter.pdf
compliance/offerings/{offering_id}/form_d.pdf
```

Each uploaded file has a corresponding `documents` record in the database.

------------------------------------------------------------------------

## Database Schema

### documents

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| entity_type | text | `borrower`, `investor`, `loan`, `offering` |
| entity_id | UUID | Foreign key to the associated entity |
| category | text | Document category (see above) |
| label | text | Human-readable name |
| storage_path | text | Supabase Storage object path |
| mime_type | text | e.g. `application/pdf`, `image/jpeg` |
| file_size_bytes | integer | |
| status | text | `pending`, `under_review`, `approved`, `rejected`, `expired` |
| uploaded_by | UUID | User who uploaded the document |
| reviewed_by | UUID | User who reviewed (nullable) |
| reviewed_at | timestamptz | |
| expires_at | timestamptz | For time-sensitive documents (e.g. insurance) |
| rejection_reason | text | Nullable; set when status = `rejected` |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| created_by | UUID | |

### document_audit_log

Append-only record of every action taken on a document.

| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| document_id | UUID | FK → documents |
| action | text | `uploaded`, `reviewed`, `approved`, `rejected`, `deleted`, `downloaded` |
| actor_id | UUID | User performing the action |
| actor_role | text | Role at time of action |
| note | text | Optional comment |
| created_at | timestamptz | |

------------------------------------------------------------------------

## Document Lifecycle

Documents follow a status progression:

```
uploaded → pending → under_review → approved
                               ↓
                           rejected → (re-upload) → pending
```

Approved documents may later transition to `expired` if `expires_at` is set and the date has passed.

------------------------------------------------------------------------

## Access Control

Document access is enforced via Supabase RLS and server-side role checks:

-   **Borrowers** may upload and view their own documents only
-   **Investors** may upload and view their own documents only
-   **Underwriters** may view and review borrower and loan documents
-   **Compliance officers** may view all compliance documents and trigger re-verification
-   **Admins** have full read/write access across all document categories
-   **No role** may read another entity's documents without explicit authorization

Storage bucket policies must mirror these RLS rules — do not rely on application-layer checks alone.

------------------------------------------------------------------------

## Loan State Machine Integration

Certain loan state transitions are blocked until required documents reach `approved` status.

| Transition | Required Documents |
|---|---|
| `DocumentsPending → UnderwritingReview` | Application, financial statements, property appraisal |
| `UnderwritingReview → Approved` | Title report, insurance certificate |
| `Approved → FundingScheduled` | Signed promissory note, deed of trust, closing disclosure |
| `Active → PaidOff` | Payoff letter |

The loan service checks document completeness before allowing state transitions. Missing or rejected documents must be resolved first.

------------------------------------------------------------------------

## Compliance Workflow Integration

-   KYC/AML document records are created automatically when a borrower or investor completes onboarding
-   Accreditation documents for investors must reach `approved` before subscription activation
-   Reg A investor limit records reference the subscription agreement document
-   All compliance document actions must emit audit events

------------------------------------------------------------------------

## Expiration Handling

Documents with `expires_at` set are checked periodically. When a document expires:

1.  Status transitions to `expired`
2.  The associated entity owner is notified
3.  If the document is required for an active loan or subscription, a blocking flag is raised
4.  A replacement document must be uploaded and approved to clear the block

------------------------------------------------------------------------

## Events Emitted

| Event | Trigger |
|---|---|
| `DocumentUploaded` | New document record created |
| `DocumentApproved` | Status set to `approved` |
| `DocumentRejected` | Status set to `rejected` |
| `DocumentExpired` | Expiration date passed |
| `DocumentDownloaded` | File accessed via signed URL |

These events drive notifications and audit log entries.

------------------------------------------------------------------------

## Implementation Notes

-   Never store raw files in the database — only metadata and storage paths
-   Generate short-lived signed URLs for file access; do not expose permanent public URLs
-   Virus/malware scanning should run on upload before status advances past `pending`
-   File size limits should be enforced at the API layer (recommended: 50 MB max per file)
-   Support multi-page PDF preview where possible for the reviewer workflow
