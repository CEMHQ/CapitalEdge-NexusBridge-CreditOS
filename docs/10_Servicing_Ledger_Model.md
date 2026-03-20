# NexusBridge Servicing Ledger Model

This document defines the financial ledger system used to track loan
servicing events within the NexusBridge platform.

The servicing ledger records all monetary activity associated with a
loan from funding through payoff.

------------------------------------------------------------------------

## Objectives

The servicing ledger must:

-   track loan balances accurately
-   record every payment event
-   support investor distribution calculations
-   maintain a fully auditable financial history

------------------------------------------------------------------------

## Core Ledger Entities

Primary servicing tables include:

-   loans
-   payment_schedules
-   payments
-   fees
-   penalties
-   payoff_records
-   distributions

------------------------------------------------------------------------

## Payment Schedule Model

When a loan is funded, the system generates a payment schedule.

Schedule fields include:

-   payment date
-   principal due
-   interest due
-   outstanding balance

Schedules may be:

-   interest-only
-   amortizing
-   balloon payments

------------------------------------------------------------------------

## Payment Event Processing

When a borrower payment is received, the system allocates funds
according to servicing rules.

Typical allocation order:

1.  Late fees
2.  Servicing fees
3.  Interest
4.  Principal

------------------------------------------------------------------------

## Ledger Entry Structure

Each financial transaction must create a ledger entry.

Example fields:

-   loan_id
-   transaction_type
-   amount
-   timestamp
-   related_payment_id
-   notes

------------------------------------------------------------------------

## Interest Accrual

Interest accrues based on the loan's contractual rate.

Example formula:

Interest = Principal × Rate × (Days Outstanding / 365)

Accrued interest must update daily for reporting accuracy.

------------------------------------------------------------------------

## Delinquency Tracking

Loans become delinquent when scheduled payments are missed beyond the
grace period.

System should track:

-   days past due
-   delinquency status
-   penalty fees

------------------------------------------------------------------------

## Payoff Calculation

Loan payoff includes:

-   outstanding principal
-   accrued interest
-   unpaid fees
-   payoff processing charges

Once payoff is received:

-   loan status changes to closed
-   final ledger entries are recorded
-   investor distributions are triggered

------------------------------------------------------------------------

## Audit Requirements

All servicing transactions must be immutable and reproducible from the
ledger history.

The system must support:

-   reconciliation reports
-   investor distribution verification
-   regulatory audits
