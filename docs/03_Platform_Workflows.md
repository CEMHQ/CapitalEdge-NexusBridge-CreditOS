# NexusBridge Platform Workflows

## Borrower Workflow

# NexusBridge Lending

## Borrower Workflow

This document defines the borrower lifecycle within the NexusBridge
Lending platform. It outlines how borrowers interact with the system
from initial application through loan servicing.

The goal is to provide a streamlined and secure workflow that allows
borrowers to access short-term capital efficiently while maintaining
compliance and risk management standards.

------------------------------------------------------------------------

# 1. Borrower Journey Overview

The borrower lifecycle consists of the following stages:

1.  Account Creation
2.  Application Submission
3.  Document Upload
4.  Underwriting Review
5.  Conditional Approval
6.  Final Approval
7.  Loan Funding
8.  Loan Servicing
9.  Loan Payoff

Each stage must be supported by a dedicated workflow inside the
platform.

------------------------------------------------------------------------

# 2. Borrower Onboarding

Borrowers must create an account before submitting a loan application.

Required fields:

• full name\
• email address\
• phone number\
• entity type (individual / LLC / corporation)\
• address

After account creation, borrowers gain access to the borrower dashboard.

Security requirements:

• email verification\
• password hashing\
• optional multi-factor authentication

------------------------------------------------------------------------

# 3. Loan Application Submission

Borrowers must submit a loan application through the application
interface.

Required inputs include:

• property address\
• loan purpose\
• requested loan amount\
• estimated property value\
• expected exit strategy

Optional inputs may include:

• renovation scope\
• contractor estimates\
• listing agreements

The application should be saved as a record in the `applications` table.

------------------------------------------------------------------------

# 4. Document Upload Process

Borrowers must upload required documents through the document portal.

Common documents include:

• government ID\
• tax returns\
• bank statements\
• property appraisal\
• purchase agreements

Documents should be stored in secure storage with metadata stored in the
database.

Each document must have a status:

• pending review\
• verified\
• rejected

------------------------------------------------------------------------

# 5. Underwriting Review

Once documents are submitted, the underwriting team reviews the
application.

The underwriting dashboard must allow staff to view:

• borrower profile\
• property information\
• loan request details\
• uploaded documents\
• automated risk flags

Underwriters may request additional documentation before approval.

------------------------------------------------------------------------

# 6. Conditional Approval

If underwriting conditions are satisfied, the loan enters conditional
approval.

Conditions may include:

• additional documentation\
• appraisal verification\
• insurance confirmation

Borrowers must complete these requirements before final approval.

------------------------------------------------------------------------

# 7. Final Approval and Funding

Once all conditions are met, the loan can be approved.

Funding process includes:

• investor capital allocation\
• loan agreement generation\
• digital signing\
• funds disbursement

Funding events should be logged in the loan ledger.

------------------------------------------------------------------------

# 8. Loan Servicing

After funding, the borrower dashboard should provide:

• payment schedule\
• outstanding balance\
• interest accrual\
• payment history

Borrowers must be able to make payments and track their loan status.

------------------------------------------------------------------------

# 9. Loan Payoff

Loans may be repaid through:

• property sale\
• refinance\
• borrower repayment

Upon payoff:

• loan status changes to closed\
• final statements are generated\
• investors receive distributions

All payoff activity must be recorded in the servicing ledger.

------------------------------------------------------------------------

## Investor Workflow

# NexusBridge Lending

## Investor Workflow

This document defines the investor lifecycle within the NexusBridge
platform.

The system must provide investors with transparent access to capital
deployment, loan performance, and portfolio reporting.

------------------------------------------------------------------------

# 1. Investor Journey Overview

The investor lifecycle consists of:

1.  Investor Registration
2.  Accreditation Verification
3.  Capital Commitment
4.  Deal Allocation
5.  Portfolio Monitoring
6.  Distribution Payments
7.  Investor Reporting

------------------------------------------------------------------------

# 2. Investor Registration

Investors must create an account through the investor portal.

Required information:

• full name\
• entity name (if applicable)\
• contact information\
• accreditation status

Accounts should be verified before access is granted.

------------------------------------------------------------------------

# 3. Accreditation Verification

Investors must verify eligibility before participating in private credit
opportunities.

Verification methods may include:

• income verification\
• net worth confirmation\
• third-party accreditation verification

Documentation should be securely stored.

------------------------------------------------------------------------

# 4. Capital Commitments

Investors commit capital to the NexusBridge fund.

Data stored includes:

• commitment amount\
• subscription documents\
• investor entity information

Commitments must be recorded in the `subscriptions` table.

------------------------------------------------------------------------

# 5. Deal Allocation

When loans are originated, investor capital is allocated to those loans.

Allocation logic may consider:

• available capital\
• diversification requirements\
• fund allocation rules

Allocations should be recorded in the `allocations` table.

------------------------------------------------------------------------

# 6. Portfolio Monitoring

Investors should have access to a portfolio dashboard displaying:

• capital deployed\
• active loans\
• expected yield\
• loan performance

Data visualizations should update automatically.

------------------------------------------------------------------------

# 7. Distributions

Investors receive distributions from loan repayments.

Distribution events must include:

• principal returned\
• interest payments\
• fees

Distributions should be tracked in the `distributions` table.

------------------------------------------------------------------------

# 8. Investor Reporting

Investors must receive periodic reporting.

Reports should include:

• portfolio performance summaries\
• loan performance metrics\
• tax documentation (K-1 forms)

Reports should be accessible through the investor document vault.



---
# Institutional Workflow Extensions

## Borrower Workflow

Borrower → Application → Document Upload  
→ Underwriting Case → Conditional Approval  
→ Funding → Servicing → Payoff

## Investor Workflow

Investor → KYC/AML → Subscription  
→ Capital Call → Allocation  
→ Distribution → Reporting → Tax Docs

## Compliance Workflow

Investor onboarding  
↓  
Accreditation verification  
↓  
Reg A investment limit validation  
↓  
Subscription approval

