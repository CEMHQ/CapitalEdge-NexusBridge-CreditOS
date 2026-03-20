
# Fund Accounting & NAV Engine Architecture

## Purpose

This document defines the accounting and valuation engine required to support pooled investment vehicles on the NexusBridge platform, including **Reg D funds**, future **Reg A vehicles**, and loan-backed private credit strategies.

The engine is responsible for:

- Net Asset Value (NAV) calculation
- investor capital account tracking
- subscription and redemption accounting where permitted
- preferred return and carried interest logic where applicable
- realized and unrealized gain/loss tracking
- investor statement support
- audit-ready fund reporting

---

## Core Design Principles

The fund accounting engine must be:

- deterministic
- auditable
- period-close friendly
- compatible with double-entry ledger logic
- separated from the borrower servicing engine
- capable of supporting multiple funds on one platform

---

## Core Components

### 1. Fund Master

Stores legal and operational information for each fund.

Suggested fields:

- fund_id
- fund_name
- legal_entity_name
- regulation_type (`reg_d_506b`, `reg_d_506c`, `reg_a_tier2`, `private_spv`)
- fund_type (`lp`, `llc`, `reit`, `credit_pool`, `spv`)
- base_currency
- inception_date
- manager_entity_id
- transfer_agent_id (if applicable)
- administrator_id (if applicable)

---

### 2. Investor Capital Accounts

Each investor requires a capital account per fund.

Suggested fields:

- capital_account_id
- investor_id
- fund_id
- commitment_amount
- contributed_capital
- recalled_capital
- distributed_principal
- distributed_income
- accrued_pref_return
- realized_gain_loss
- unrealized_gain_loss
- ending_capital_balance

---

### 3. NAV Engine

NAV should be calculated at a defined frequency such as:

- daily (internal estimates)
- monthly (manager reporting)
- quarterly (investor reporting)
- annually (audited reporting)

### NAV Formula

```text
NAV = Fair Value of Assets + Cash + Accrued Income - Liabilities - Accrued Expenses
```

Loan-backed credit fund assets may include:

- active loan principal outstanding
- accrued but unpaid interest
- fee receivables
- reserve cash
- other approved receivables

Liabilities may include:

- management fees payable
- servicing expenses payable
- audit and legal accruals
- investor distributions payable

---

## Valuation Policy

Loan assets must follow a defined valuation hierarchy.

### Level 1
Quoted observable market values (rare for private loans)

### Level 2
Model-assisted values using observable inputs

### Level 3
Manager-determined fair value based on internal credit and collateral assumptions

For most private credit funds, loans will be treated as **Level 3 assets**.

Valuation inputs may include:

- outstanding principal
- accrued interest
- collateral value changes
- delinquency risk
- impairment adjustments
- expected recovery assumptions

---

## Waterfall Integration

The NAV engine must integrate with the capital waterfall engine.

Standard flow:

1. Borrower payment received
2. Payment posted to servicing ledger
3. Fees and expenses allocated
4. Net distributable income determined
5. Investor capital accounts updated
6. NAV recalculated
7. Investor statements generated

---

## Preferred Return and Carry Logic

For institutional or sponsor-managed funds, the engine may support:

- preferred return accrual
- catch-up provisions
- carried interest allocations
- manager incentive allocations

Example high-level waterfall:

1. Return of investor principal
2. Preferred return to investors
3. GP catch-up
4. Profit split between LP and GP

This logic should be configurable by fund and **not hardcoded globally**.

---

## Key Tables

Suggested new tables:

- fund_capital_accounts
- fund_nav_snapshots
- fund_nav_line_items
- fund_expense_accruals
- fund_income_accruals
- fund_waterfall_rules
- fund_waterfall_runs
- fund_valuation_adjustments
- fund_manager_allocations
- fund_close_periods

---

## Monthly / Quarterly Close Process

Recommended fund close cycle:

1. Lock servicing period
2. Reconcile borrower payments
3. Reconcile cash balances
4. Post accruals
5. Post valuation adjustments
6. Calculate NAV
7. Review and approve NAV
8. Generate investor statements
9. Archive close pack and audit evidence

---

## Controls

Required controls:

- dual approval for NAV adjustments
- versioned waterfall rules
- locked close periods
- immutable close logs
- reconciliation between ledger and fund reporting
- audit log for all manual overrides

---

## Output Reports

The fund accounting engine must support:

- investor capital account statements
- monthly NAV report
- realized / unrealized gain report
- loan exposure by fund
- income distribution report
- expense allocation report
- audit support package

---

## Architecture Position

The fund accounting engine should sit between:

```text
Loan Servicing Engine
↓
Double-Entry Ledger
↓
Fund Accounting & NAV Engine
↓
Investor Reporting Layer
```

This keeps investor reporting consistent with actual platform economics.
