# NexusBridge Loan State Machine

This document defines the lifecycle state machine for loans originated
on the NexusBridge platform. The goal is to ensure every loan progresses
through a clearly defined operational state with traceable transitions.

------------------------------------------------------------------------

## Loan Lifecycle States

1.  Application Created
2.  Underwriting Review
3.  Conditional Approval
4.  Final Approval
5.  Funding Scheduled
6.  Active Loan
7.  Delinquent (optional)
8.  Default (optional)
9.  Paid Off
10. Closed

------------------------------------------------------------------------

## State Transition Logic

Application Created → Underwriting Review\
Occurs when borrower submits required application data.

Underwriting Review → Conditional Approval\
Triggered when underwriting determines the loan is viable but requires
additional conditions.

Conditional Approval → Final Approval\
Occurs after borrower satisfies all underwriting conditions.

Final Approval → Funding Scheduled\
Loan documents are generated and investor capital is allocated.

Funding Scheduled → Active Loan\
Funds are disbursed and servicing begins.

Active Loan → Delinquent\
Occurs when payment obligations are missed beyond grace period.

Delinquent → Default\
Occurs when delinquency exceeds defined risk threshold.

Active Loan → Paid Off\
Triggered when borrower repays principal and accrued interest.

Paid Off → Closed\
Loan ledger finalized and investor distributions completed.

------------------------------------------------------------------------

## State Machine Rules

-   All state transitions must be logged in the audit ledger.
-   Manual overrides require administrator privileges.
-   Servicing actions (payments, fees, penalties) only occur during
    Active Loan or Delinquent states.
-   Closed loans cannot transition back to active states.

------------------------------------------------------------------------

## Operational Notes

The state machine ensures consistent loan lifecycle management and
prevents operational errors by enforcing valid state transitions.
