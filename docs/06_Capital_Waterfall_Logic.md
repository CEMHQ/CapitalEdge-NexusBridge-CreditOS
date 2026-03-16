# NexusBridge Capital Waterfall Logic

This document defines the investor capital distribution logic used by
the NexusBridge lending platform.

The waterfall determines how incoming loan repayments are allocated
between investors and platform fees.

------------------------------------------------------------------------

## Waterfall Objectives

The distribution system must ensure:

-   transparent investor payouts
-   accurate principal return tracking
-   clear fee accounting
-   consistent distribution order

------------------------------------------------------------------------

## Standard Distribution Sequence

When a borrower payment is received, funds are distributed in the
following order:

1.  Servicing Fees
2.  Platform Management Fees
3.  Investor Interest Payments
4.  Investor Principal Return
5.  Excess Profit (if applicable)

------------------------------------------------------------------------

## Payment Allocation Logic

### Step 1 --- Fees

Platform servicing and administrative fees are deducted first.

### Step 2 --- Investor Interest

Interest payments are allocated to investors based on their proportional
loan allocation.

### Step 3 --- Principal Return

Principal repayments reduce investor exposure in the loan.

### Step 4 --- Excess Cash

If excess funds exist after all obligations are satisfied, the surplus
may be:

-   distributed proportionally to investors
-   retained for reserve accounts
-   allocated based on fund operating agreements

------------------------------------------------------------------------

## Allocation Formula

Investor Payment = (Investor Allocation / Total Loan Allocation) ×
Payment Amount

Example:

Loan Size = \$1,000,000\
Investor A Allocation = \$200,000\
Investor B Allocation = \$300,000

If a \$50,000 payment is received:

Investor A receives:

(200,000 / 1,000,000) × 50,000 = \$10,000

Investor B receives:

(300,000 / 1,000,000) × 50,000 = \$15,000

------------------------------------------------------------------------

## Data Requirements

The system must track:

-   investor allocations
-   outstanding principal
-   accrued interest
-   servicing fees
-   payment history

These records ensure accurate investor reporting and compliance.

------------------------------------------------------------------------

## Operational Considerations

-   Waterfall calculations should be deterministic and auditable.
-   Distribution records must be stored in the servicing ledger.
-   All calculations should be reproducible from transaction history.
