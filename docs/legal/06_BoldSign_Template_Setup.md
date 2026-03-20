> **OPERATIONAL GUIDE — INTERNAL USE ONLY.** This document defines the BoldSign template configuration required to enable e-signatures on the NexusBridge CreditOS platform. These templates must be created in the BoldSign dashboard before the signature API routes will function in production.

---

# BoldSign Template Setup Guide

**Platform:** NexusBridge CreditOS
**Provider:** BoldSign (`apps/portal/src/lib/esign/boldsign.ts`)
**Dashboard:** app.boldsign.com
**Related code:** `apps/portal/src/app/api/signatures/request/route.ts`

---

## Overview

The platform uses five BoldSign templates. Each template maps to a `document_type` in the database and a corresponding env var:

| Template | `document_type` | Env Var |
|---|---|---|
| Promissory Note | `promissory_note` | `BOLDSIGN_TEMPLATE_PROMISSORY_NOTE` |
| Deed of Trust | `deed_of_trust` | `BOLDSIGN_TEMPLATE_DEED_OF_TRUST` |
| Loan Agreement | `loan_agreement` | `BOLDSIGN_TEMPLATE_LOAN_AGREEMENT` |
| Subscription Agreement + AIQ | `subscription_agreement` | `BOLDSIGN_TEMPLATE_SUBSCRIPTION_AGREEMENT` |
| PPM Acknowledgment | `ppm_acknowledgment` | `BOLDSIGN_TEMPLATE_PPM_ACKNOWLEDGMENT` |

After creating each template in BoldSign, copy the **Template ID** from the BoldSign dashboard into `.env.local` (for local dev) and Vercel Environment Variables (for production).

---

## Before You Start

### Prepare your PDFs

BoldSign templates require a PDF source file. The platform's legal templates are in `docs/legal/` as Markdown. Before uploading:

1. Convert each `.md` file to a formatted PDF (Word, Google Docs, or Pandoc)
2. Replace all `[NEXUSBRIDGE LENDING LLC ADDRESS, CITY, STATE, ZIP]` and `[CAPITAL EDGE MANAGEMENT ADDRESS, CITY, STATE, ZIP]` placeholders with the actual addresses
3. Leave all borrower/investor/loan-specific `[PLACEHOLDER]` fields in the document — these become either **BoldSign form fields** (signer fills in) or **prefill fields** (admin fills before sending)
4. Do not remove the signature blocks — BoldSign will overlay its signature fields on those positions

### Role name precision

The `RoleName` you define in a BoldSign template must exactly match the `role` string your code sends via the API. These role names are case-sensitive. Follow the role names specified in each template below exactly.

---

## Template 1 — Promissory Note

**Source file:** `docs/legal/01_Promissory_Note.md`
**Env var:** `BOLDSIGN_TEMPLATE_PROMISSORY_NOTE`
**Triggered when:** Application status transitions to `approved` → admin sends closing docs

### Template settings

| Field | Value |
|---|---|
| Template Title | `NexusBridge Promissory Note` |
| Description | `Interest-only promissory note for NexusBridge bridge, renovation, and micro loans. Governed by applicable state law.` |
| Tags | `promissory-note`, `loan-closing`, `lending`, `nexusbridge` |
| Document expiry | 30 days |
| Reminder | Every 3 days after send |
| Allow comments | No |

### Roles (signers)

Define these roles in BoldSign. Role names are exact — match them in your API calls.

| Role Name | Type | Order | Required | Description |
|---|---|---|---|---|
| `Borrower` | Signer | 1 | Yes | Primary borrower — individual or entity authorized signatory |
| `Co-Borrower` | Signer | 2 | No | Optional co-borrower |
| `Guarantor` | Signer | 3 | No | Personal guarantor if required by underwriting |
| `Lender` | Signer | 4 | Yes | NexusBridge Lending LLC counter-signature |

> Signing order: Borrower first, then Co-Borrower (if present), then Guarantor (if present), then Lender counter-signs last.

### Fields to place in the template

Place the following fields on the PDF. BoldSign lets you drag fields onto the document after upload.

**Borrower role fields:**
- Signature field → on the "BORROWER" signature line
- Date field (auto) → on the "Date" line next to borrower signature
- Text field: `Printed Name` → on the "Printed Name" line
- Text field: `Title` → on the "Title" line (entity borrowers only — mark optional)
- Initials field → bottom of each page

**Co-Borrower role fields (if using):**
- Signature field → on the "CO-BORROWER" signature line
- Date field (auto)
- Text field: `Printed Name`

**Guarantor role fields (if using):**
- Signature field → on the "GUARANTOR" signature line
- Date field (auto)
- Text field: `Printed Name`

**Lender role fields:**
- Signature field → on the "LENDER" signature line (NexusBridge Lending LLC)
- Date field (auto)
- Text field: `Name` (authorized signatory name)
- Text field: `Title`

**Prefill fields (admin fills before sending — these become text form fields in the template):**

| Field Label | Placeholder in Doc | Who fills it |
|---|---|---|
| Loan Number | `[LOAN NUMBER]` | Admin prefill |
| Principal Amount | `[PRINCIPAL AMOUNT]` | Admin prefill |
| Principal Amount in Words | `[PRINCIPAL AMOUNT IN WORDS]` | Admin prefill |
| Maturity Date | `[MATURITY DATE]` | Admin prefill |
| Contract Interest Rate | `[CONTRACT INTEREST RATE]` | Admin prefill |
| Origination Fee Points | `[ORIGINATION FEE POINTS]` | Admin prefill |
| Origination Fee Amount | `[ORIGINATION FEE AMOUNT]` | Admin prefill |
| Property Address | `[PROPERTY STREET ADDRESS, CITY, COUNTY, STATE, ZIP]` | Admin prefill |
| Borrower Full Legal Name | `[BORROWER FULL LEGAL NAME]` | Admin prefill |
| Borrower Address | `[BORROWER ADDRESS, CITY, STATE, ZIP]` | Admin prefill |
| Date of Execution | `[DATE OF EXECUTION]` | Admin prefill |
| State Where Property is Located | `[STATE WHERE PROPERTY IS LOCATED]` | Admin prefill |

> **Loan Type checkbox:** Place checkboxes for Micro Loan / Renovation/Rehab Loan / Bridge Loan. Assign to the `Lender` role (admin checks the applicable loan type before counter-signing), or treat as a prefill field.

---

## Template 2 — Deed of Trust

**Source file:** `docs/legal/02_Deed_of_Trust.md`
**Env var:** `BOLDSIGN_TEMPLATE_DEED_OF_TRUST`
**Triggered when:** Application status → `approved` (sent alongside Promissory Note and Loan Agreement)

> **Notarization note:** Deeds of Trust require notarization. BoldSign supports Remote Online Notarization (RON) for states that permit it. For states requiring in-person notarization, the notary acknowledgment section should be completed outside BoldSign after signing. Until RON is configured, include the notary acknowledgment pages in the PDF but mark them as informational (not a BoldSign signer role).

### Template settings

| Field | Value |
|---|---|
| Template Title | `NexusBridge Deed of Trust` |
| Description | `Deed of Trust / Security Instrument securing the NexusBridge loan. State-specific versions required — see Section 2 of the template.` |
| Tags | `deed-of-trust`, `security-instrument`, `loan-closing`, `nexusbridge` |
| Document expiry | 30 days |
| Reminder | Every 3 days |
| Allow comments | No |

### Roles

| Role Name | Type | Order | Required | Description |
|---|---|---|---|---|
| `Borrower` | Signer | 1 | Yes | Trustor / Grantor |
| `Co-Borrower` | Signer | 2 | No | Co-Trustor / Co-Grantor |

> The Lender is the Beneficiary and does not sign the Deed of Trust. The Trustee is a named third party and does not sign via BoldSign.

### Fields

**Borrower role fields:**
- Signature field → on "TRUSTOR / GRANTOR (BORROWER)" signature line
- Date field (auto)
- Text field: `Printed Name`
- Text field: `Title` (entity borrowers — optional)
- Initials field → bottom of each page

**Co-Borrower role fields (if using):**
- Signature field
- Date field (auto)
- Text field: `Printed Name`

**Prefill fields:**

| Field Label | Placeholder in Doc |
|---|---|
| Loan Number | `[LOAN NUMBER]` |
| Date of Execution | `[DATE OF EXECUTION]` |
| Borrower Full Legal Name | `[BORROWER FULL LEGAL NAME]` |
| Borrower Address | `[BORROWER ADDRESS, CITY, STATE, ZIP]` |
| Principal Amount | `[PRINCIPAL AMOUNT]` |
| Principal Amount in Words | `[PRINCIPAL AMOUNT IN WORDS]` |
| Property Legal Description | `[INSERT FULL LEGAL DESCRIPTION OF PROPERTY]` |
| Property Address | `[PROPERTY STREET ADDRESS, CITY, STATE, ZIP]` |
| County | `[COUNTY]` |
| State | `[STATE]` |
| Tax Parcel Number | `[TAX PARCEL NUMBER]` |
| Trustee Full Legal Name | `[TRUSTEE FULL LEGAL NAME]` |
| Trustee Address | `[TRUSTEE ADDRESS, CITY, STATE, ZIP]` |

---

## Template 3 — Loan Agreement

**Source file:** `docs/legal/03_Loan_Agreement.md`
**Env var:** `BOLDSIGN_TEMPLATE_LOAN_AGREEMENT`
**Triggered when:** Application status → `approved` (sent alongside Promissory Note and Deed of Trust)

### Template settings

| Field | Value |
|---|---|
| Template Title | `NexusBridge Loan Agreement` |
| Description | `Comprehensive loan agreement governing terms, conditions, covenants, and remedies for NexusBridge bridge, renovation, and micro loans.` |
| Tags | `loan-agreement`, `loan-closing`, `nexusbridge` |
| Document expiry | 30 days |
| Reminder | Every 3 days |
| Allow comments | No |

### Roles

| Role Name | Type | Order | Required | Description |
|---|---|---|---|---|
| `Borrower` | Signer | 1 | Yes | Primary borrower |
| `Co-Borrower` | Signer | 2 | No | Optional co-borrower |
| `Lender` | Signer | 3 | Yes | NexusBridge Lending LLC counter-signature |

### Fields

**Borrower role fields:**
- Signature field → "BORROWER" signature line
- Date field (auto)
- Text field: `Printed Name`
- Text field: `Title` (entity — optional)
- Initials field → bottom of each page

**Co-Borrower role fields (if using):**
- Signature field
- Date field (auto)
- Text field: `Printed Name`

**Lender role fields:**
- Signature field → "LENDER" signature line
- Date field (auto)
- Text field: `Name`
- Text field: `Title`

**Prefill fields:**

| Field Label | Placeholder in Doc |
|---|---|
| Loan Number | `[LOAN NUMBER]` |
| Date of Execution | `[DATE OF EXECUTION]` |
| Borrower Full Legal Name | `[BORROWER FULL LEGAL NAME]` |
| Borrower Address | `[BORROWER ADDRESS, CITY, STATE, ZIP]` |
| Borrower Email | `[BORROWER EMAIL]` |
| Borrower Phone | `[BORROWER PHONE]` |
| Principal Amount | `[PRINCIPAL AMOUNT]` |
| Contract Interest Rate | `[CONTRACT INTEREST RATE]` |
| Maturity Date | `[MATURITY DATE]` |
| Origination Fee Points | `[ORIGINATION FEE POINTS]` |
| Origination Fee Amount | `[ORIGINATION FEE AMOUNT]` |
| Property Address | `[PROPERTY STREET ADDRESS, CITY, COUNTY, STATE, ZIP]` |
| Loan Purpose | *(Loan type checkbox + purpose description)* |
| State | `[STATE WHERE PROPERTY IS LOCATED]` |
| County and State for Jurisdiction | `[COUNTY, STATE WHERE PROPERTY IS LOCATED]` |

> **For Renovation/Rehab Loans:** Exhibit A (Draw Schedule) and Exhibit B (Renovation Budget) are separate pages appended to the PDF. The platform's draw schedule data from the `draws` table should be pre-populated before the PDF is generated.

---

## Template 4 — Subscription Agreement + Accredited Investor Questionnaire

**Source file:** `docs/legal/04_Subscription_Agreement.md`
**Env var:** `BOLDSIGN_TEMPLATE_SUBSCRIPTION_AGREEMENT`
**Triggered when:** Fund subscription status transitions to `approved` → subscription agreement sent for signature

> This template bundles the Subscription Agreement body and Exhibit A (Accredited Investor Questionnaire) into a single PDF. The investor signs both in one session.

### Template settings

| Field | Value |
|---|---|
| Template Title | `NexusBridge Capital LP — Subscription Agreement` |
| Description | `Subscription Agreement and Accredited Investor Questionnaire for NexusBridge Capital LP (Reg D / Rule 506(c)) limited partnership interests.` |
| Tags | `subscription-agreement`, `accredited-investor-questionnaire`, `investor`, `reg-d`, `rule-506c`, `nexusbridge-capital` |
| Document expiry | 21 days |
| Reminder | Every 2 days (investor must act promptly) |
| Allow comments | No |

### Roles

| Role Name | Type | Order | Required | Description |
|---|---|---|---|---|
| `Investor` | Signer | 1 | Yes | Individual investor or entity authorized signatory |
| `Joint Investor` | Signer | 2 | No | Joint investor (individual accounts only) |
| `General Partner` | Signer | 3 | Yes | Capital Edge Management, Inc. acceptance counter-signature |

### Fields

**Investor role fields:**
- Signature field → "INVESTOR" signature line
- Date field (auto)
- Text field: `Printed Name`
- Text field: `Social Security Number` (last 4 digits — mark restricted visibility) — on subscription sig block
- Text field: `Date of Birth` — on subscription sig block
- Text field: `Address`
- Text field: `Telephone`
- Text field: `Email`
- Accreditation checkboxes (Section 2.1 of Sub Agreement, Sections A/B/C/D of AIQ) — assign to `Investor` role
- Net worth worksheet fields (Section B of AIQ) — text fields for asset/liability amounts, assign to `Investor` role
- Signature field → Exhibit A certification signature line (AIQ Section 4)
- Date field (auto) → AIQ Section 4

**For Entity investors (same `Investor` role, mark individual fields optional):**
- Text field: `Entity Name`
- Text field: `Jurisdiction of Organization`
- Text field: `Tax ID / EIN`
- Text field: `Title` (authorized signatory title)

**Joint Investor role fields (if using):**
- Signature field → "JOINT INVESTOR" signature line
- Date field (auto)
- Text field: `Printed Name`

**General Partner role fields:**
- Signature field → "ACCEPTED AND AGREED: General Partner" signature line
- Date field (auto)
- Text field: `Name` (authorized signatory)
- Text field: `Title`
- Text field: `Subscription Amount Accepted`
- Text field: `Effective Date of Admission`

**Prefill fields:**

| Field Label | Placeholder in Doc |
|---|---|
| Subscription Date | `[DATE]` at top |
| Subscription Amount | `[SUBSCRIPTION AMOUNT]` |
| Number of Units | `[NUMBER OF UNITS]` |
| Price Per Unit | `[PRICE PER UNIT]` |
| PPM Date | `[PPM DATE]` (in Section 2.5) |

---

## Template 5 — PPM Acknowledgment

**Source file:** Create a standalone 1-page PDF (see content below)
**Env var:** `BOLDSIGN_TEMPLATE_PPM_ACKNOWLEDGMENT`
**Triggered when:** Reg D subscription flow — investor must acknowledge receipt of the PPM before subscribing

> This is a standalone 1-page acknowledgment document, separate from the full PPM (which is sent to the investor as a read-only PDF attachment). The investor signs this page to confirm they received, read, and understood the PPM.

### Create the PDF

Create a 1-page PDF with the following content:

---

**PRIVATE PLACEMENT MEMORANDUM RECEIPT AND ACKNOWLEDGMENT**

**NexusBridge Capital LP — A Delaware Limited Partnership**
Offered pursuant to Rule 506(c) of Regulation D under the Securities Act of 1933

---

The undersigned ("Investor") hereby acknowledges and confirms the following:

1. The Investor has received and reviewed the Confidential Private Placement Memorandum of NexusBridge Capital LP dated **[PPM DATE]** (the "Memorandum"), including all exhibits and supplements thereto.

2. The Investor has had the opportunity to ask questions of and receive answers from Capital Edge Management, Inc. (the "General Partner") and its representatives regarding the Fund, its investment strategy, risks, and the terms of the offering.

3. The Investor understands that the Interests offered have not been registered under the Securities Act of 1933 or any state securities laws, are being offered in reliance on the exemption provided by Rule 506(c) of Regulation D, and are subject to significant restrictions on transfer.

4. The Investor acknowledges the risk factors described in the Memorandum, including the risk of loss of the Investor's entire investment.

5. The Investor is relying solely on the Memorandum and the Investor's own investigation in making the decision to invest, and not on any oral representations or other information not contained in the Memorandum.

| | |
|---|---|
| Investor Printed Name: | [INVESTOR FULL LEGAL NAME] |
| Signature: | ________________________________________ |
| Date: | [DATE] |
| Entity Name (if applicable): | [ENTITY NAME] |

---

### Template settings

| Field | Value |
|---|---|
| Template Title | `NexusBridge Capital LP — PPM Acknowledgment` |
| Description | `One-page acknowledgment confirming investor receipt and review of the NexusBridge Capital LP Private Placement Memorandum.` |
| Tags | `ppm-acknowledgment`, `investor`, `reg-d`, `rule-506c`, `nexusbridge-capital` |
| Document expiry | 14 days |
| Reminder | Every 2 days |
| Allow comments | No |

### Roles

| Role Name | Type | Order | Required | Description |
|---|---|---|---|---|
| `Investor` | Signer | 1 | Yes | Individual or entity authorized signatory |

### Fields

**Investor role fields:**
- Signature field → signature line
- Date field (auto) → Date line
- Text field: `Printed Name`
- Text field: `Entity Name` (optional — entity investors only)

**Prefill fields:**

| Field Label | Placeholder in Doc |
|---|---|
| PPM Date | `[PPM DATE]` |
| Investor Full Legal Name | `[INVESTOR FULL LEGAL NAME]` |

---

## Sending Order for Each Workflow

### Loan closing (application status: `approved`)

Send all three loan documents together or in sequence. The platform currently sends one document at a time via `POST /api/signatures/request`. Recommended order:

1. `loan_agreement` — send first (most comprehensive terms)
2. `promissory_note` — send second (evidence of debt)
3. `deed_of_trust` — send third (security instrument, may require separate notarization)

All three must reach `signed` status before the application can transition to `funded`.

### Investor subscription (subscription status: `approved`)

1. `ppm_acknowledgment` — send first (investor confirms they read the PPM)
2. `subscription_agreement` — send second (includes AIQ as Exhibit A)

Both must reach `signed` status before the subscription can transition to `active`.

---

## Connecting Templates to the Platform

After creating each template in BoldSign:

1. Open the template in BoldSign → **Template Details** → copy the **Template ID** (format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)

2. Add to `apps/portal/.env.local`:

```
BOLDSIGN_TEMPLATE_PROMISSORY_NOTE=<template-id>
BOLDSIGN_TEMPLATE_DEED_OF_TRUST=<template-id>
BOLDSIGN_TEMPLATE_LOAN_AGREEMENT=<template-id>
BOLDSIGN_TEMPLATE_SUBSCRIPTION_AGREEMENT=<template-id>
BOLDSIGN_TEMPLATE_PPM_ACKNOWLEDGMENT=<template-id>
```

3. Add the same variables to **Vercel → Project → Settings → Environment Variables** (mark as Production + Preview, not NEXT_PUBLIC)

4. Verify the webhook is registered in BoldSign:
   - BoldSign Dashboard → Settings → Webhooks
   - URL: `https://<your-vercel-domain>/api/webhooks/esign`
   - Events to subscribe: `document.completed`, `document.declined`, `document.expired`, `document.revoked`, `document.viewed`
   - Copy the webhook secret → add as `BOLDSIGN_WEBHOOK_SECRET` in env

---

## Role Name Quick Reference

When calling `POST /api/signatures/request`, the `signers[].role` values must match these exactly:

| Template | Valid Role Names |
|---|---|
| Promissory Note | `Borrower`, `Co-Borrower`, `Guarantor`, `Lender` |
| Deed of Trust | `Borrower`, `Co-Borrower` |
| Loan Agreement | `Borrower`, `Co-Borrower`, `Lender` |
| Subscription Agreement | `Investor`, `Joint Investor`, `General Partner` |
| PPM Acknowledgment | `Investor` |

---

## Testing in Sandbox

BoldSign's free sandbox allows 25 documents/month. To test:

1. Create templates in the BoldSign sandbox account (separate from production)
2. Use sandbox template IDs in `.env.local`
3. Use test email addresses — BoldSign will send real emails even in sandbox
4. Completed test documents can be downloaded from the BoldSign dashboard to verify the PDF output

> Do not use real borrower or investor PII in sandbox testing.
