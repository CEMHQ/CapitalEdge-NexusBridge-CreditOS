# NexusBridge Underwriting Rules Engine

This document defines the underwriting decision framework used by the
NexusBridge lending platform.

The underwriting engine evaluates borrower, collateral, and loan
structure risk in order to determine loan eligibility, pricing, and
approval conditions.

------------------------------------------------------------------------

## Objectives

The underwriting rules engine must:

-   standardize loan decision logic
-   provide consistent credit evaluation
-   surface automated risk flags
-   support manual override by authorized underwriters
-   maintain a full audit trail of decisions

------------------------------------------------------------------------

## Core Risk Dimensions

Loan applications are evaluated across four major dimensions:

1.  Borrower Profile
2.  Collateral Quality
3.  Loan Structure
4.  Exit Strategy

------------------------------------------------------------------------

## Borrower Risk Evaluation

Key borrower variables:

-   credit score
-   liquidity
-   net worth
-   prior real estate experience
-   track record with similar projects

Example borrower flags:

  Condition                Risk Flag
  ------------------------ -------------------
  credit score \< 620      high risk
  insufficient liquidity   liquidity warning
  first-time investor      experience flag

------------------------------------------------------------------------

## Collateral Risk Evaluation

Collateral evaluation focuses on the underlying asset securing the loan.

Key metrics:

-   Loan-to-Value (LTV)
-   Loan-to-Cost (LTC)
-   After Repair Value (ARV)
-   property location risk
-   asset class risk

Example rules:

  Metric         Target
  -------------- ----------
  LTV            \<= 70%
  LTC            \<= 85%
  ARV coverage   \>= 120%

------------------------------------------------------------------------

## Loan Structure Evaluation

The loan structure must meet acceptable parameters.

Key variables:

-   loan term
-   interest rate
-   amortization
-   borrower equity contribution
-   loan purpose

Example guidelines:

  Loan Type         Typical Term
  ----------------- --------------
  bridge loan       6--12 months
  renovation loan   9--18 months

------------------------------------------------------------------------

## Exit Strategy Evaluation

Every loan must have a clear exit strategy.

Common exit paths:

-   property sale
-   refinance into long-term financing
-   asset stabilization and cash flow

Underwriters should confirm the feasibility of the exit relative to
market conditions.

------------------------------------------------------------------------

## Risk Scoring Model

Each loan may be assigned a composite risk score.

Example scoring categories:

  Category             Weight
  -------------------- --------
  borrower strength    30%
  collateral quality   35%
  loan structure       20%
  exit viability       15%

Loans exceeding risk thresholds may require additional conditions or be
declined.

------------------------------------------------------------------------

## Manual Overrides

Authorized underwriters may override automated rules if:

-   additional supporting information is provided
-   compensating risk factors exist
-   exceptions are documented

All overrides must be logged.

------------------------------------------------------------------------

## Compliance Logging

The underwriting system must store:

-   decision timestamps
-   reviewer identity
-   supporting documents
-   automated rule outputs
-   final approval rationale

This ensures auditability and regulatory compliance.
