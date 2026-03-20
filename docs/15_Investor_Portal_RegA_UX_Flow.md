
# Investor Portal + Reg A UX Flow

## Purpose

This document defines the investor-facing user experience for the NexusBridge platform, including flows for:

- general investor onboarding
- Reg D subscription flows
- future Reg A retail participation flows
- account access
- document review
- investment tracking
- reporting and tax access

The objective is to create a front-end experience that is:

- legally compliant
- low-friction
- transparent
- suitable for both accredited and retail investors

---

## Investor Segments

The platform should support distinct investor experiences for:

- Reg D accredited investors
- Reg A retail investors
- institutional investors
- internal admin and IR teams

The UX must adapt based on investor type and offering eligibility.

---

## Front-End Experience Design Principles

- real-time status updates
- step-based onboarding
- disclosure-first investing flow
- clear risk communication
- mobile-friendly review experience
- secure document access
- role-based content rendering

---

## Shared Investor Portal Sections

All investors should have access to:

- dashboard home
- profile / identity section
- KYC / AML status
- offering library
- subscriptions / investments
- distributions
- statements
- tax documents
- notices and updates
- support / messaging

---

## Reg D UX Flow

### Step 1 — Account Creation

Investor enters:

- name
- email
- password
- entity type
- investor type

### Step 2 — Identity Verification

Collect:

- legal name
- date of birth (if individual)
- address
- tax status
- KYC/AML verification

### Step 3 — Accreditation Verification

If offering is Reg D 506(c):

- investor self-identifies as accredited
- third-party verification is initiated
- status updates in real time

### Step 4 — Offering Review

Investor reviews:

- private placement summary
- risk factors
- subscription docs
- projected economics
- liquidity limitations

### Step 5 — Subscription Execution

Investor submits:

- investment amount
- suitability questionnaire
- subscription agreement
- ACH / wire funding instructions

### Step 6 — Funding and Confirmation

Dashboard shows:

- funding status
- subscription status
- next steps
- expected statement timing

---

## Reg A UX Flow

Reg A requires a different front-end experience because retail investors may participate.

### Step 1 — Investor Education Layer

Before investment, the user should review:

- offering circular
- risk summary
- fee disclosures
- liquidity limitations
- projected use of proceeds

### Step 2 — Identity and Suitability Intake

Collect:

- identity data
- annual income
- net worth
- residency / jurisdiction
- investor acknowledgments

### Step 3 — Investment Limit Validation

The system calculates maximum allowed investment based on applicable Reg A logic.

Example:

```text
Maximum investment = policy-based Reg A suitability / limit rule as configured by counsel and offering settings
```

The front-end must show:

- proposed investment
- validated limit
- pass/fail result
- override status (if any)

### Step 4 — Subscription Flow

Investor completes:

- disclosure acknowledgement
- investment amount
- agreement acceptance
- payment method selection

### Step 5 — Ongoing Reporting UX

Reg A investors should receive:

- investment balance
- statement history
- updates and notices
- tax reporting
- offering updates

---

## Real-Time Front-End Status Model

For a resilient workflow-driven portal, the UI should subscribe to status changes such as:

- `identity_verification_pending`
- `accreditation_pending`
- `subscription_submitted`
- `funding_received`
- `allocation_posted`
- `distribution_posted`
- `statement_available`

Recommended real-time patterns:

- websocket / realtime subscriptions
- optimistic UI for uploads and acknowledgements
- queue-aware job status display
- event log timeline in dashboard

---

## Key Dashboard Cards

### Investor Home

- Total committed capital
- Total funded capital
- Current investment value
- Current yield / income to date
- Pending actions
- Latest notices

### Offerings Page

- available offerings
- regulation type
- minimum investment
- status
- disclosure link

### Investment Detail Page

- subscription status
- funded amount
- current NAV / estimated value
- distributions received
- documents
- timeline

---

## Operational Resilience Requirements

The investor portal should gracefully handle:

- delayed accreditation checks
- asynchronous KYC providers
- failed uploads
- funding pending states
- partial subscriptions
- event replay after worker failures

UI requirements:

- retry states
- pending banners
- manual support escalation
- activity timeline

---

## Required Back-End Connections

The investor portal depends on:

- identity service
- KYC / AML providers
- accreditation verification provider
- fund accounting engine
- document service
- notification service
- event-driven workflow engine

---

## Summary

The investor portal must be more than a dashboard. It should function as a compliant digital subscription and reporting environment that supports both private and retail capital formation while remaining resilient under asynchronous workflow conditions.
