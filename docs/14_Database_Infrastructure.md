# Database Infrastructure & Configuration

This document defines the database architecture, performance strategy, ORM configuration, and concurrency patterns for the NexusBridge Lending platform.

---

## 1. The Problem: PostgreSQL at Scale

Standard PostgreSQL degrades under high-frequency append-only workloads because:

- **Index bloat** — B-tree indexes must rebalance on every insert. As `payments`, `audit_events`, and `activity_logs` grow to millions of rows, index maintenance slows write throughput.
- **Sequential scan cost** — Queries like "all payments in March" must scan large indexes rather than reading contiguous time-ordered data.
- **Unbounded table growth** — Without partitioning, a single `payments` table accumulates indefinitely, making vacuuming and autovacuum increasingly expensive.

NexusBridge has two categories of data with different performance requirements:

| Category | Examples | Requirement |
|---|---|---|
| **Relational truth** | Loans, investors, subscriptions, KYC status | ACID, strong consistency, complex joins |
| **Time-series streams** | Payments, audit logs, fund ticks, onboarding events | High write throughput, time-range queries, append-only |

---

## 2. Architecture Decision: Supabase + pg_partman

### Chosen Stack

**Supabase (PostgreSQL 17) + pg_partman extension + Drizzle ORM**

This solves the performance problem without introducing a second database to operate. TimescaleDB was the original plan but does not support PostgreSQL 17, which is what Supabase now provisions by default. `pg_partman` is the correct replacement — it is available on Supabase, automates native PostgreSQL partitioning, and provides the same time-based chunking without requiring a separate database engine.

| Option | Assessment |
|---|---|
| Supabase + pg_partman | ✅ **Chosen** — available on Supabase PG17, automates native partitioning, no dual-write complexity |
| Supabase + TimescaleDB | ❌ Not supported on PostgreSQL 17+ (Supabase default) |
| Supabase + QuestDB | Deferred — adds operational complexity (two DBs, dual-write, separate infra). Revisit if volume exceeds 10,000 loan events/second. |
| Raw PostgreSQL + manual partitioning | Possible but requires manual partition creation — pg_partman automates this |

### Why pg_partman

`pg_partman` is a PostgreSQL extension that automates native declarative table partitioning. Tables must be declared as `PARTITION BY RANGE` at creation time. Benefits:

- **Automatic partition creation** — pre-creates future partitions based on configured interval
- **Consistent write performance** — new partitions are small and indexed independently; no index bloat on append-only tables
- **Linear time-range scans** — "all payments in March" reads one partition, not the full index
- **No extra infrastructure** — enabled directly in Supabase dashboard
- **Native PostgreSQL** — no proprietary query functions; standard SQL throughout
- **Maintenance via pg_cron** — Supabase supports `pg_cron` to run `partman.run_maintenance_proc()` on a schedule

---

## 3. Partitioned Table Designations

The following tables are designated as **pg_partman partitioned tables**. They are high-frequency, append-only, and queried by time range.

| Table | Partition Key | Interval | Reason |
|---|---|---|---|
| `payments` | `payment_date` | 1 month | Every loan repayment event |
| `audit_events` | `created_at` | 1 month | Immutable compliance/security log |
| `activity_logs` | `created_at` | 1 week | High-frequency user-facing events |
| `loan_draws` | `created_at` | 1 month | Draw disbursement events |
| `distributions` | `distribution_date` | 1 month | Investor distribution events |
| `fund_ticks` | `ts` | 1 day | Real-time investor activity stream |
| `onboarding_events` | `ts` | 1 day | Investor onboarding funnel tracking |

**Standard tables** (relational, ACID, not time-partitioned):
`profiles`, `organizations`, `roles`, `borrowers`, `applications`, `properties`, `loans`, `investors`, `funds`, `subscriptions`, `capital_calls`, `allocations`, `underwriting_cases`, `documents`, `conditions`, `tasks`, `notifications`

### Enabling pg_partman

```sql
-- Enable extension (once, in Supabase dashboard or migration)
CREATE EXTENSION IF NOT EXISTS pg_partman SCHEMA partman;

-- Enable pg_cron for scheduled maintenance (enable in Supabase dashboard)
CREATE EXTENSION IF NOT EXISTS pg_cron;
```

### Creating Partitioned Tables

Tables must be declared `PARTITION BY RANGE` at creation time. The partition key column must be `NOT NULL`.

```sql
-- Example: payments table
CREATE TABLE payments (
  id              uuid          NOT NULL DEFAULT gen_random_uuid(),
  loan_id         uuid          NOT NULL,
  payment_date    timestamptz   NOT NULL,
  payment_amount  numeric(18,2) NOT NULL,
  principal_applied numeric(18,2),
  interest_applied  numeric(18,2),
  fees_applied      numeric(18,2),
  payment_method  text,
  external_reference text,
  created_at      timestamptz   NOT NULL DEFAULT now()
) PARTITION BY RANGE (payment_date);

-- Register with pg_partman — auto-creates monthly partitions
SELECT partman.create_parent(
  p_parent_table => 'public.payments',
  p_control      => 'payment_date',
  p_interval     => '1 month',
  p_premake      => 3   -- pre-create 3 future partitions
);
```

```sql
-- audit_events — monthly
SELECT partman.create_parent('public.audit_events', 'created_at', '1 month', p_premake => 3);

-- activity_logs — weekly
SELECT partman.create_parent('public.activity_logs', 'created_at', '1 week', p_premake => 4);

-- loan_draws — monthly
SELECT partman.create_parent('public.loan_draws', 'created_at', '1 month', p_premake => 3);

-- distributions — monthly
SELECT partman.create_parent('public.distributions', 'distribution_date', '1 month', p_premake => 3);

-- fund_ticks — daily
SELECT partman.create_parent('public.fund_ticks', 'ts', '1 day', p_premake => 7);

-- onboarding_events — daily
SELECT partman.create_parent('public.onboarding_events', 'ts', '1 day', p_premake => 7);
```

### Scheduled Maintenance (pg_cron)

pg_partman requires a maintenance job to create new partitions and drop expired ones. Schedule this via pg_cron:

```sql
-- Run maintenance every hour
SELECT cron.schedule(
  'partman-maintenance',
  '0 * * * *',
  'SELECT partman.run_maintenance_proc()'
);
```

### Native PostgreSQL Compression (Historical Data)

For historical partitions, enable native PostgreSQL column-level compression on large text/jsonb fields:

```sql
-- Apply lz4 compression to metadata and payload columns on partitioned tables
ALTER TABLE payments           ALTER COLUMN external_reference SET COMPRESSION lz4;
ALTER TABLE audit_events       ALTER COLUMN event_payload      SET COMPRESSION lz4;
ALTER TABLE activity_logs      ALTER COLUMN metadata           SET COMPRESSION lz4;
ALTER TABLE fund_ticks         ALTER COLUMN metadata           SET COMPRESSION lz4;
ALTER TABLE onboarding_events  ALTER COLUMN metadata           SET COMPRESSION lz4;
```

---

## 4. New Tables

### `fund_ticks`

Real-time investor activity stream. Links to the relational `investors` and `funds` tables via UUID foreign keys.

| Column | Type | Notes |
|---|---|---|
| ts | timestamptz | **Partition key** — NOT NULL |
| investor_id | uuid | FK → investors.id |
| fund_id | uuid | FK → funds.id |
| action | text | `COMMITMENT_RESERVED`, `COMMITMENT_FUNDED`, `WITHDRAWAL`, `DIVIDEND_POSTED`, `KYC_PASSED`, `ACCREDITATION_VERIFIED` |
| amount | numeric(18,2) | Nullable — not all events have amounts |
| metadata | jsonb | Optional event context |

### `onboarding_events`

Investor onboarding funnel tracking for the real-time internal dashboard. Powers contribution velocity charts and dropout analysis.

| Column | Type | Notes |
|---|---|---|
| ts | timestamptz | **Partition key** — NOT NULL |
| investor_id | uuid | FK → investors.id |
| fund_id | uuid | FK → funds.id; nullable |
| event_type | text | `FUNNEL_STARTED`, `KYC_SUBMITTED`, `KYC_PASSED`, `KYC_FAILED`, `DOCS_SENT`, `DOCS_SIGNED`, `ACCREDITATION_SUBMITTED`, `ACCREDITATION_VERIFIED`, `COMMITMENT_STARTED`, `COMMITMENT_FUNDED`, `DROPPED_OFF` |
| metadata | jsonb | Optional — browser, source, etc. |

---

## 5. Updated Table: `subscriptions`

The existing `subscriptions` table gains FCFS reservation fields to support atomic slot reservation during capital contributions.

**New columns added:**

| Column | Type | Notes |
|---|---|---|
| reservation_status | text | `reserved`, `confirmed`, `expired`, `cancelled` |
| reservation_expires_at | timestamptz | Slot hold window — typically 15–30 minutes |
| fcfs_position | integer | Queue position at time of reservation |
| reserved_at | timestamptz | When the slot was reserved |
| confirmed_at | timestamptz | When the commitment was fully funded |

---

## 6. ORM: Drizzle

Drizzle is used for all backend data access. It provides TypeScript-first, SQL-accurate query building with zero runtime overhead.

### Why Drizzle over Prisma

| Concern | Drizzle | Prisma |
|---|---|---|
| Cold start | ~50ms | ~300ms (Rust engine) |
| FCFS locking (`FOR UPDATE`) | Native, type-safe | Requires raw SQL workaround |
| Multi-DB / any `pg` driver | Works with any `pg` driver | Prisma-specific client required |
| `npx generate` on schema change | Not required | Required |
| SQL accuracy | 1:1 mapping | Abstracted — can hide behavior |

### Connection Configuration

Drizzle connects via the Supabase **Transaction Pooler** (port 6543) to support full transaction semantics including `FOR UPDATE` locking.

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    // Use Transaction Pooler (port 6543) — NOT Session Pooler or direct (5432)
    url: process.env.DATABASE_URL!, // supabase pooler connection string
  },
});
```

### Supabase Client (alongside Drizzle)

Use the Supabase JS client for:
- Authentication and session management
- File storage operations
- Real-time subscriptions

Use Drizzle for:
- All transactional database writes
- FCFS locking
- Complex joins and aggregations

---

## 7. FCFS Concurrency Control

Capital contribution reservations use **pessimistic locking** at the database level to prevent oversubscription. This is mandatory for Reg A/D compliance — client-side availability checks are not sufficient.

### Pattern: SELECT FOR UPDATE

```typescript
// Next.js Server Action — capital commitment reservation
import { db } from '@/db';
import { funds, subscriptions } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function reserveCapitalSlot(
  investorId: string,
  fundId: string,
  amount: number
) {
  'use server';

  return await db.transaction(async (tx) => {
    // 1. Lock the fund row — no concurrent transaction can read or modify
    //    this row until this transaction commits or rolls back
    const [fund] = await tx
      .select()
      .from(funds)
      .where(eq(funds.id, fundId))
      .for('update');

    if (!fund) throw new Error('Fund not found');

    // 2. Check remaining capacity
    const remaining = fund.totalCapacity - fund.committedAmount;
    if (remaining < amount) {
      throw new Error('Fund capacity insufficient');
    }

    // 3. Reserve the slot — update fund committed amount
    await tx
      .update(funds)
      .set({ committedAmount: fund.committedAmount + amount })
      .where(eq(funds.id, fundId));

    // 4. Create reservation record
    const [reservation] = await tx
      .insert(subscriptions)
      .values({
        investorId,
        fundId,
        commitmentAmount: amount,
        reservationStatus: 'reserved',
        reservationExpiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30-min hold
        reservedAt: new Date(),
        subscriptionStatus: 'draft',
      })
      .returning();

    return reservation;
  });
}
```

### Advisory Locks (Onboarding Queue)

For sequencing investors through onboarding without locking entire tables, use PostgreSQL Advisory Locks:

```sql
-- Acquire advisory lock for a specific fund's onboarding queue
SELECT pg_advisory_xact_lock(hashtext('onboarding:' || fund_id::text));
-- Lock is automatically released when the transaction ends
```

---

## 8. Real-Time Dashboard (Supabase Realtime)

The investor onboarding dashboard uses Supabase Realtime for live updates via WebSockets.

### Subscribe to Onboarding Status Changes

```typescript
// In the investor portal dashboard
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Subscribe to onboarding_events for a specific fund
const channel = supabase
  .channel('fund-onboarding')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'onboarding_events',
      filter: `fund_id=eq.${fundId}`,
    },
    (payload) => {
      // Update dashboard live
      updateFunnelChart(payload.new);
    }
  )
  .subscribe();
```

### Real-Time Fund Fill Rate

Use `date_trunc` for time-bucket aggregations (native PostgreSQL equivalent of TimescaleDB's `time_bucket`):

```sql
-- Contribution velocity — commitments per hour over the last 24 hours
SELECT
  date_trunc('hour', ts) AS bucket,
  COUNT(*) AS events,
  SUM(amount) AS total_committed
FROM fund_ticks
WHERE
  fund_id = $1
  AND action = 'COMMITMENT_FUNDED'
  AND ts > NOW() - INTERVAL '24 hours'
GROUP BY bucket
ORDER BY bucket;
```

---

## 9. Reg A/D Compliance Patterns

### Investor Limit Enforcement (Reg A)

Reg A imposes per-investor investment limits based on income/net worth. Check limits before confirming any reservation:

```sql
-- Check remaining Reg A capacity for an investor
SELECT
  ra.annual_limit,
  COALESCE(SUM(s.commitment_amount), 0) AS invested_ytd,
  ra.annual_limit - COALESCE(SUM(s.commitment_amount), 0) AS remaining
FROM reg_a_investor_limits ra
LEFT JOIN subscriptions s
  ON s.investor_id = ra.investor_id
  AND s.subscription_status IN ('active', 'approved')
  AND EXTRACT(YEAR FROM s.created_at) = EXTRACT(YEAR FROM NOW())
WHERE ra.investor_id = $1
GROUP BY ra.annual_limit;
```

### Audit Trail (Partitioned)

The `audit_events` partitioned table provides an immutable, high-resolution timestamped record of all compliance-relevant actions. Required for SEC bad actor checks and audit examination:

```sql
-- Full audit trail for a specific investor
SELECT event_type, entity_type, entity_id, ip_address, created_at
FROM audit_events
WHERE actor_profile_id = $1
ORDER BY created_at DESC;
```

PostgreSQL's partition pruning ensures this query only scans relevant monthly partitions — no full table scan.

### Document Access Control (RLS)

```sql
-- Investors can only view their own subscription agreements
CREATE POLICY "investors_own_documents"
ON documents
FOR SELECT
USING (
  owner_id = (
    SELECT id FROM investors WHERE profile_id = auth.uid()
  )
);
```

---

## 10. Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Drizzle — Transaction Pooler (port 6543)
DATABASE_URL=postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres

# Direct connection — migrations only (port 5432)
DATABASE_DIRECT_URL=postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres
```

> Use `DATABASE_URL` (pooler) for application queries. Use `DATABASE_DIRECT_URL` (direct) only for running Drizzle migrations, which require a persistent connection.

---

## 11. Future Upgrade Path: QuestDB

If NexusBridge exceeds ~10,000 loan events/second (high-volume micro-lending at scale), migrate the time-series tables to a dedicated QuestDB instance.

The link-key pattern is already in place — `fund_ticks` and `onboarding_events` use UUID foreign keys back to Postgres. Migrating to QuestDB requires:

1. Spin up QuestDB instance
2. Dual-write from Server Actions to both Postgres and QuestDB
3. Point dashboard queries at QuestDB
4. Drain and drop the pg_partman partitioned tables once migration is confirmed

This upgrade is transparent to the application layer — no schema changes required. The `date_trunc` aggregation queries map directly to QuestDB's `SAMPLE BY` syntax.
