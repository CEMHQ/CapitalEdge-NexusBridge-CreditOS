# NexusBridge Developer Guide

# NexusBridge Lending

## Implementation Design Strategy

Here is the clean way to build **NexusBridge Lending** without getting
buried.

The best move is **not** to build the full hybrid CeFi/DeFi protocol
first. Build it in controlled phases:

-   **Phase 1:** website + borrower dashboard + investor portal
-   **Phase 2:** underwriting workflow + document vault + fund
    operations
-   **Phase 3:** wallet rails, tokenized participation, on-chain pool
    accounting
-   **Phase 4:** full protocol logic, smart contracts, and optional
    secondary liquidity

That sequencing matters because the regulated, revenue-producing part is
the **centralized lending business**, not the token layer.

------------------------------------------------------------------------

# 1. Start with the Right Operating Model

For this platform, the operating structure should be:

-   **NexusBridge Lending** = borrower-facing operating platform
-   **NexusBridge Capital, LP** = investor/fund vehicle providing
    capital
-   **CapitalEdge Management, Inc.** = manager / GP / operations /
    compliance oversight
-   **Protocol layer** = optional later, used for ledger transparency,
    pool participation, and wallet-native investors

This gives the platform a professional front end now, while leaving room
for an on-chain back end later.

------------------------------------------------------------------------

# 2. What to Build First

Do **not** start with smart contracts.

Start with these three surfaces:

## A. Public Website

This is the marketing and intake layer.

### Pages

-   Home
-   How It Works
-   Loan Programs
-   Borrower Application
-   Investor Overview
-   About / Compliance / Disclosures
-   Contact

### Goal

-   explain products clearly
-   capture leads
-   push users into secure onboarding

## B. Borrower Dashboard

This is where the real business value lives.

### Core Modules

-   application intake
-   document upload
-   deal status tracker
-   property / loan details
-   messaging / tasks
-   closing checklist
-   payment history

## C. Investor Portal

This should be separate from the borrower workflow.

### Core Modules

-   commitments / subscriptions
-   capital calls
-   funded loan exposure
-   distributions
-   portfolio performance
-   K-1 / statements / eDocs
-   notices and updates

That is enough for a serious **Phase 1** product.

------------------------------------------------------------------------

# 3. Recommended Stack for This Use Case

The stack should be tightened to the following:

## Frontend

-   Next.js (App Router)
-   TypeScript
-   Tailwind CSS
-   shadcn/ui
-   Recharts for dashboards

### Why

-   fast UI iteration
-   strong SSR support
-   clean dashboard builds

## Backend / App Logic

-   Next.js Route Handlers for light backend-for-frontend patterns
-   Supabase Postgres for core relational data
-   Supabase Auth
-   Supabase Storage for documents
-   Supabase Edge Functions or a dedicated Node service for heavier
    workflows

## Workflow / Automation

-   n8n for document and operations workflows
-   optional Temporal later if workflows become mission-critical

## OCR / Document Extraction

-   Ocrolus
-   Plaid Income
-   Argyle
-   Pinwheel

Do **not** rely on generic OCR alone for underwriting-critical data.

## Analytics / Monitoring

-   PostHog
-   Sentry
-   Logtail / Datadog / Axiom

## Payments / Bank Rails

-   Plaid
-   Stripe Treasury / ACH-related providers only if the exact use case
    fits
-   Modern Treasury, Unit, or banking partners may be better than Stripe
    for money-movement-heavy lending flows

## Later DeFi Layer

Only after centralized lending is stable:

-   Base or Ethereum L2
-   smart contracts for:
    -   pool participation
    -   waterfall logic
    -   tokenized investor interests
    -   proof-of-reserve / reporting
-   indexer: Alchemy or The Graph

------------------------------------------------------------------------

# 4. Phase-by-Phase Build Instructions

## Phase 1 --- Brand Site + Secure App Shell

Build this first.

### Deliverables

-   landing page
-   borrower intake form
-   investor access request form
-   login / signup
-   protected dashboard routes
-   role-based navigation

### User Roles

Create these from day one:

-   borrower
-   investor
-   admin
-   underwriter
-   servicing
-   manager

### App Routes

Structure the app like this:

``` text
/
/how-it-works
/loan-programs
/apply
/investors
/login
/dashboard
/dashboard/borrower/*
/dashboard/investor/*
/dashboard/admin/*
```

### What to Implement

-   Create Next.js app
-   Install Tailwind + shadcn/ui
-   Set up Supabase project
-   Configure auth
-   Add middleware for protected routes
-   Build role-based dashboard layout
-   Add lead forms and database writes
-   Deploy to Vercel preview + production

## Phase 2 --- Lending Operations Core

This is where NexusBridge becomes a real lending platform.

### Borrower Workflow

-   application created
-   borrower profile completed
-   property record added
-   loan scenario entered
-   docs uploaded
-   underwriting review
-   conditional approval
-   final approval
-   closing
-   servicing / payoff

### Features

-   borrower application wizard
-   document checklist by loan type
-   underwriting notes
-   ARV / LTV / DSCR / LTC calculators
-   manual and automated decision flags
-   task system
-   email notifications
-   audit log

### Investor Workflow

-   investor onboarding
-   accreditation / KYC
-   subscription docs
-   commitment tracking
-   deal allocation
-   distributions
-   statement vault

## Phase 3 --- Workflow Automation + Compliance Hardening

This is where manual bottlenecks get removed.

### Add

-   automated document classification
-   OCR extraction
-   exception flags
-   email / task triggers
-   approval workflows
-   renewal reminders
-   servicing notices
-   delinquency workflow
-   investor reporting batch jobs

### Security Hardening

-   MFA
-   IP / device logging
-   row-level security
-   field-level encryption for sensitive data
-   document retention rules
-   admin action logs
-   least-privilege roles

## Phase 4 --- Hybrid Finance / Protocol Layer

Only do this once the centralized business is clean.

### Add

-   wallet connect for investors
-   on-chain proof of pool balances
-   tokenized LP participation or note exposure
-   smart-contract waterfall distribution logic
-   reserve attestations
-   off-chain underwriting + on-chain settlement bridge

This is where **HyFi** starts to make sense.

------------------------------------------------------------------------

# 5. Database Structure to Use

Do **not** cram everything into one giant `loans` table.

Use a relational structure like this:

## Core Identity

-   profiles
-   organizations
-   organization_members
-   roles

## Borrower Side

-   borrowers
-   borrower_entities
-   applications
-   properties
-   loan_requests
-   collateral
-   guarantors
-   income_sources
-   bank_accounts

## Documents

-   documents
-   document_versions
-   document_requests
-   document_extractions
-   document_review_flags

## Underwriting

-   underwriting_cases
-   underwriting_decisions
-   conditions
-   risk_flags
-   valuation_reports

## Funding / Servicing

-   loans
-   loan_draws
-   payment_schedules
-   payments
-   fees
-   delinquencies
-   payoffs

## Investor / Fund Side

-   investors
-   funds
-   subscriptions
-   capital_calls
-   allocations
-   distributions
-   investor_statements
-   tax_documents

## Operations / Controls

-   activity_logs
-   audit_events
-   webhook_events
-   notifications
-   tasks

That structure will scale. A shortcut schema will not.

------------------------------------------------------------------------

# 6. Product Sequence

For **NexusBridge Lending**, the product sequence should be:

## Product 1 --- Real Estate Bridge / Gap Loans

-   easiest narrative
-   strong collateral logic
-   short duration
-   clear investor story

## Product 2 --- Repair / Renovation Micro-Loans

-   smaller ticket
-   faster underwriting
-   good for repeat users / brokers / flippers

## Product 3 --- Escrow or Contingency Funding

-   niche
-   useful
-   operationally manageable

## Later

-   SMB asset-backed or receivables credit

Only add this after the compliance and servicing stack is mature.

------------------------------------------------------------------------

# 7. Compliance Realities to Plan for Now

A few of the earlier assumptions need to be treated carefully.

## MSB

Do **not** assume the platform automatically needs Money Services
Business registration just because it moves money in a fintech-like
flow. FinCEN rules depend on the exact role in funds flow and whether
the platform is transmitting funds or operating under an exemption. This
requires counsel review against the actual architecture.

## State Licensing

For nonbank mortgage, consumer finance, or lending activity, licensing
is typically managed through NMLS, and state-by-state requirements can
vary materially. Build with that assumption from day one.

## Regulation Z / TILA

If the platform touches consumer credit, it needs to be designed around
Truth in Lending / Regulation Z disclosures and workflow requirements.

## SMB Lending

If the platform expands into small business lending, Section 1071 data
collection and reporting may become relevant depending on coverage and
volume. This must be reviewed at launch.

## Tax Transcript Verification

The IRS IVES program can be used, with taxpayer consent, to obtain
transcripts for loan applications. However, it should be treated as a
formal verification rail, not a casual API shortcut.

------------------------------------------------------------------------

# 8. Security Stack Required from Day One

Because the platform will hold tax documents, IDs, income records, and
investor records, the security baseline must include:

## Must-Have Controls

-   MFA for staff and investors
-   encrypted storage
-   signed upload URLs
-   malware scanning on uploads
-   document access logs
-   role-based access
-   row-level security
-   admin approvals for sensitive actions
-   immutable audit logs
-   backup and restore drills
-   secrets manager
-   separate production / staging environments

## Avoid

-   storing raw OCR outputs carelessly
-   exposing direct storage URLs
-   allowing AI models to read everything by default
-   mixing borrower and investor permissions in the same loose role
    model

------------------------------------------------------------------------

# 9. UI Plan for Phase 1

## Public Site

Use a polished, institutional look:

-   charcoal / deep navy base
-   muted neutrals
-   one accent color
-   lots of whitespace
-   strong trust sections
-   simple rate / term explanation blocks

## Borrower Dashboard Cards

-   Application Status
-   Requested Loan Amount
-   Property Value / ARV
-   Documents Needed
-   Tasks Due
-   Messages
-   Funding Timeline

## Investor Dashboard Cards

-   Total Committed Capital
-   Capital Deployed
-   Current Yield / Net Return
-   Active Loans
-   Distribution History
-   eDocs
-   Notices

------------------------------------------------------------------------

# 10. Build Order Inside the Codebase

Do it in this order:

## Sprint 1

-   auth
-   route protection
-   roles
-   landing page
-   dashboard shell

## Sprint 2

-   borrower application form
-   document uploads
-   application list
-   admin review screen

## Sprint 3

-   investor portal
-   commitments
-   statements
-   reporting widgets

## Sprint 4

-   underwriting engine
-   workflows
-   notifications
-   audit logs

## Sprint 5

-   servicing
-   payment ledger
-   fund allocation logic
-   admin controls

## Sprint 6

-   wallet integration
-   token design
-   smart contract pilot

------------------------------------------------------------------------

# 11. Best Practical Architecture

If setting this up today, the recommended architecture is:

-   Next.js
-   TypeScript
-   shadcn/ui
-   Supabase Auth
-   Supabase Postgres
-   Supabase Storage
-   Supabase Edge Functions
-   n8n
-   Sentry
-   PostHog
-   Plaid
-   OCR / verification vendor
-   Vercel
-   later: Base + smart contracts

That gives a strong centralized lending stack first, with a realistic
path to hybrid finance later.

------------------------------------------------------------------------

# 12. What Not to Build Yet

Hold off on:

-   governance token
-   public permissionless pools
-   fully automated liquidations
-   complex cross-chain bridges
-   broad retail DeFi access
-   on-chain storage of sensitive identity or tax data

Those create legal and operational headaches too early.

------------------------------------------------------------------------

# 13. Immediate Next Steps

Use this order:

1.  lock the entity / product map
2.  define user roles
3.  define borrower journey
4.  define investor journey
5.  create database schema
6.  scaffold Next.js app
7.  configure Supabase auth + RLS
8.  build landing page + login
9.  build borrower dashboard
10. build investor portal
11. connect workflows
12. only then evaluate tokenization

------------------------------------------------------------------------

# 14. Recommendation

For **Phase 1**, treat this as a serious private credit / bridge lending
platform, not a crypto protocol.

The DeFi layer should be an infrastructure extension, not the core
business on day one.

That is the cleaner path for:

-   licensing
-   underwriting
-   investor trust
-   fundraising
-   borrower adoption
-   bank and counsel conversations

------------------------------------------------------------------------

# NexusBridge Lending

## Platform Development Instructions

This section provides operational instructions for building the
NexusBridge Lending platform. These guidelines translate the
implementation strategy into a practical development workflow that
developers can follow when building the system.

The platform should be developed incrementally, prioritizing the
centralized lending infrastructure before introducing blockchain-based
components.

------------------------------------------------------------------------

# 1. Development Philosophy

The NexusBridge platform must prioritize **reliability, compliance, and
operational functionality** before introducing decentralized
infrastructure.

Developers should follow these guiding principles:

• Build the centralized lending platform first\
• Treat the protocol layer as optional infrastructure\
• Maintain strict separation between borrower workflows and investor
workflows\
• Ensure compliance and security controls are implemented from the
beginning\
• Design the database architecture for scalability

The objective is to create a production-ready lending platform capable
of originating and servicing loans before expanding into hybrid finance
capabilities.

------------------------------------------------------------------------

# 2. Phase-Based Development Approach

The platform must be built sequentially across four phases.

## Phase 1 --- Core Platform Infrastructure

Goal: Build the core application environment.

Developers must implement:

• marketing website\
• borrower onboarding flow\
• investor onboarding flow\
• authentication system\
• protected dashboards\
• role-based access control\
• secure document uploads

Key Deliverables:

-   public website
-   borrower application interface
-   investor information portal
-   login and account management
-   role-based dashboards

The Phase 1 platform should be capable of collecting borrower
applications and investor interest.

------------------------------------------------------------------------

## Phase 2 --- Lending Operations Platform

Goal: Build the full loan lifecycle management system.

Developers must implement:

• borrower application workflow\
• document verification system\
• underwriting workflow\
• investor capital tracking\
• loan approval pipeline\
• servicing infrastructure

Key Deliverables:

-   borrower application wizard
-   underwriting dashboard
-   document checklist management
-   investor capital allocation tracking
-   loan servicing ledger

At the completion of Phase 2, the platform should be able to originate,
approve, fund, and track loans.

------------------------------------------------------------------------

## Phase 3 --- Workflow Automation and Compliance

Goal: Reduce manual operations and strengthen compliance infrastructure.

Developers must implement:

• automated document classification\
• OCR document extraction\
• exception detection\
• automated notifications\
• workflow automation\
• investor reporting automation

Key Deliverables:

-   automated underwriting triggers
-   document analysis pipeline
-   compliance monitoring tools
-   reporting automation
-   risk flag systems

Security features should also be expanded during this phase.

------------------------------------------------------------------------

## Phase 4 --- Hybrid Finance Infrastructure

Goal: Introduce blockchain infrastructure to support capital
transparency and tokenized participation.

Developers must implement:

• wallet connectivity\
• blockchain event indexing\
• pool accounting smart contracts\
• tokenized investor participation logic\
• on-chain proof-of-reserves

Key Deliverables:

-   investor wallet integration
-   smart contract lending pools
-   blockchain event indexer
-   tokenized capital participation

The protocol layer must remain optional and should not interfere with
centralized lending operations.

------------------------------------------------------------------------

# 3. Developer Environment Setup

Developers should configure the following environment before starting
work.

Required Tools:

• Node.js\
• Git\
• Supabase CLI\
• Vercel CLI\
• Docker (optional for local services)

Recommended IDE:

• VS Code with TypeScript support

Project repository should follow the structure: nexusbridge-lending │
├── docs ├── frontend ├── backend ├── database ├── workflows └──
protocol

------------------------------------------------------------------------

# 4. Frontend Development Instructions

The frontend must be developed using **Next.js with TypeScript**.

Required UI components:

• authentication pages\
• borrower dashboard\
• investor dashboard\
• document upload interface\
• loan tracking interface

UI design principles:

• modular card-based dashboard layouts\
• minimalistic financial interface design\
• strong separation between borrower and investor views

Developers should use:

• Tailwind CSS for styling\
• shadcn/ui for reusable components\
• Recharts for financial dashboards

------------------------------------------------------------------------

# 5. Backend Development Instructions

Backend services must manage:

• application data storage\
• authentication\
• document storage\
• underwriting data\
• loan servicing records

Primary infrastructure:

• Supabase Postgres database\
• Supabase Auth\
• Supabase Storage\
• Edge Functions for backend workflows

Developers should ensure:

• row-level security policies are implemented\
• authentication tokens are validated\
• database queries are optimized for relational integrity

------------------------------------------------------------------------

# 6. Document Management System

The platform must include a secure document vault.

Document system requirements:

• encrypted storage\
• signed upload URLs\
• file size limits\
• document version tracking\
• document verification status

Supported document types:

• tax returns\
• income statements\
• identity documents\
• property reports\
• loan agreements

Developers should integrate OCR tools during Phase 3.

------------------------------------------------------------------------

# 7. Workflow Automation

The platform must support automated workflows for underwriting and loan
servicing.

Recommended workflow engine:

• n8n

Automation examples:

• document verification triggers\
• underwriting alerts\
• approval notifications\
• investor reporting generation\
• payment reminders

Developers must ensure workflows are logged and auditable.

------------------------------------------------------------------------

# 8. Security Implementation Requirements

Because the platform will handle sensitive financial information, strict
security measures are required.

Mandatory security controls:

• multi-factor authentication\
• encrypted document storage\
• row-level security policies\
• secure API authentication\
• audit logging of administrative actions\
• secrets management

Developers must avoid:

• exposing direct file storage links\
• storing sensitive documents in unsecured locations\
• granting overly broad permissions to user roles

------------------------------------------------------------------------

# 9. Testing and Deployment

Developers must implement a structured deployment pipeline.

Testing requirements:

• unit tests for backend logic\
• integration tests for workflows\
• authentication testing\
• document upload testing

Deployment pipeline:

• GitHub repository\
• automated build checks\
• preview deployments\
• production deployment via Vercel

Production database migrations must be carefully versioned.

------------------------------------------------------------------------

# 10. Developer Priorities

Developers should focus on the following order of implementation:

1.  authentication system\
2.  user role permissions\
3.  borrower application workflow\
4.  document upload system\
5.  underwriting dashboard\
6.  investor portal\
7.  loan servicing infrastructure\
8.  workflow automation\
9.  blockchain integration

The centralized lending platform must be fully functional before
introducing protocol infrastructure.

------------------------------------------------------------------------

# 11. Platform Objective

The NexusBridge Lending platform is intended to become a scalable
digital infrastructure for real-world lending markets.

The platform should ultimately provide:

• efficient borrower access to capital\
• structured investor exposure to credit markets\
• transparent loan lifecycle management\
• secure document and financial data management\
• optional blockchain-based capital transparency

Developers should build the system with long-term scalability,
regulatory alignment, and operational reliability in mind.
