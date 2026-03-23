# NexusBridge CreditOS — SQL Reference: Phase 5

**Phase:** 5 — Tokenization Layer (Optional / Not yet started)
**Related docs:** `docs/17_DeFi_Tokenization_RWA_Architecture.md`
**Migration:** `0027_tokenization` (planned)

SQL migration DDL and verification queries for Phase 5 — the HyFi tokenization layer.

> For prior phases, see `SQL_Reference_Phase1_2.md`, `SQL_Reference_Phase3.md`, `SQL_Reference_Phase4.md`.
> Full migration files are in `apps/portal/src/db/migrations/`.

---

**Phase 5 status: Optional / Not yet started.**

Phase 5 adds a blockchain-based tokenized participation layer on top of the centralized lending platform (Base / Ethereum L2). It extends the existing financial data model with on-chain position tracking, token issuance records, and bridge events.

---

## Table of Contents

1. [Planned Tables](#1-planned-tables)
2. [Schema Sketch — Token Issuances](#2-schema-sketch--token-issuances)
3. [Schema Sketch — On-Chain Positions](#3-schema-sketch--on-chain-positions)
4. [Schema Sketch — Bridge Events](#4-schema-sketch--bridge-events)
5. [Design Constraints](#5-design-constraints)

---

## 1. Planned Tables

| Table | Purpose |
|---|---|
| `token_issuances` | Record of every tokenized loan participation minted on-chain |
| `on_chain_positions` | Investor on-chain balance snapshot per fund / per token |
| `bridge_events` | Events received from the blockchain bridge (mints, transfers, redeems) |
| `smart_contract_registry` | Deployed contract addresses and ABIs per network |

> Migration file will be: `0019_tokenization`

---

## 2. Schema Sketch — Token Issuances

> Placeholder — exact column set TBD during Phase 5 design.

```sql
-- Tracks each tokenized loan participation issued to an investor.
-- One row per mint event.
CREATE TABLE IF NOT EXISTS token_issuances (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id           uuid        NOT NULL REFERENCES loans(id) ON DELETE RESTRICT,
  subscription_id   uuid        REFERENCES fund_subscriptions(id) ON DELETE SET NULL,
  investor_id       uuid        NOT NULL REFERENCES investors(id) ON DELETE RESTRICT,
  token_contract    text        NOT NULL,   -- ERC-20 contract address
  token_amount      numeric(30, 18) NOT NULL, -- in token wei
  chain_id          integer     NOT NULL,   -- e.g. 8453 for Base
  tx_hash           text,                  -- mint transaction hash
  block_number      bigint,
  issued_at         timestamptz NOT NULL DEFAULT now(),
  redeemed_at       timestamptz,
  status            text        NOT NULL DEFAULT 'active'
                      CHECK (status IN ('pending', 'active', 'redeemed', 'burned')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid        REFERENCES profiles(id)
);
```

---

## 3. Schema Sketch — On-Chain Positions

```sql
-- Point-in-time snapshot of an investor's on-chain token balance.
-- Used to reconcile off-chain fund accounting with on-chain state.
CREATE TABLE IF NOT EXISTS on_chain_positions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id     uuid        NOT NULL REFERENCES investors(id) ON DELETE RESTRICT,
  fund_id         uuid        NOT NULL REFERENCES funds(id) ON DELETE RESTRICT,
  token_contract  text        NOT NULL,
  wallet_address  text        NOT NULL,
  chain_id        integer     NOT NULL,
  token_balance   numeric(30, 18) NOT NULL DEFAULT 0,
  usd_value       numeric(15, 2),
  snapshot_date   date        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (investor_id, fund_id, token_contract, wallet_address, snapshot_date)
);
```

---

## 4. Schema Sketch — Bridge Events

```sql
-- Inbound events from the blockchain bridge webhook.
-- Append-only. All token lifecycle events are recorded here.
CREATE TABLE IF NOT EXISTS bridge_events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      text        NOT NULL,
  -- token_minted | token_transferred | token_redeemed | token_burned
  chain_id        integer     NOT NULL,
  contract        text        NOT NULL,
  tx_hash         text        NOT NULL UNIQUE,
  block_number    bigint      NOT NULL,
  from_address    text,
  to_address      text,
  token_amount    numeric(30, 18) NOT NULL,
  event_payload   jsonb,
  processed       boolean     NOT NULL DEFAULT false,
  processed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
```

---

## 5. Design Constraints

These constraints apply to all Phase 5 schema work:

- **Dual-ledger rule**: All on-chain events must have a corresponding off-chain record in `token_issuances` or `bridge_events`. The Supabase database is always the source of truth for financial calculations; the blockchain is the settlement layer.
- **Append-only**: `bridge_events` is immutable. Never update or delete rows.
- **Fixed-precision**: Use `numeric(30, 18)` for token amounts (18 decimal places matching ERC-20 standard). Use `numeric(15, 2)` for USD conversions.
- **Entity separation**: Tokenized products belong to the NexusBridge (debt) side only. No CEM equity products are tokenized in Phase 5 scope.
- **RLS**: Investors see their own positions; admin/manager see all. Bridge events are service-role-only writes.
- **Chain ID**: Always store `chain_id` alongside contract addresses. Do not assume a single network.

---

> This file will be expanded with full DDL, indexes, RLS policies, and audit queries when Phase 5 is implemented.
