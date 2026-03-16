
# Institutional Lending Ledger Architecture

Purpose:
Provide double-entry accounting for all lending, servicing, and investor transactions.

Core Tables

ledger_accounts
ledger_transactions
ledger_entries

Example

Borrower payment received

Debit  Cash Account
Credit Loan Receivable

Investor distribution

Debit  Fund Income
Credit Investor Payable

Principles

- immutable entries
- ACID-compliant database
- automated reconciliation
