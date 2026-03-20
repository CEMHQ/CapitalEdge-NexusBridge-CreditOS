# Phase 5 Implementation Plan

HyFi Tokenization Layer -- Base / Ethereum L2

---

## 1. Phase Overview & Vision (HyFi Concept)

### Goals

Phase 5 introduces the "HyFi" (Hybrid Finance) layer -- a blockchain-based tokenization system that represents investor participation in NexusBridge Capital LP as ERC-20 tokens on Base (Coinbase's Ethereum L2). This creates a secondary liquidity layer on top of the existing off-chain lending platform.

1. **Tokenized loan participations** -- represent investor fund interests as transferable ERC-20 tokens
2. **Compliance-first design** -- transfer restrictions enforced at the smart contract level (only verified, accredited investors can hold tokens)
3. **Dual ledger reconciliation** -- Supabase remains the source of truth for financials; blockchain is the settlement and transfer layer
4. **Investor wallet integration** -- investors connect MetaMask/WalletConnect to their portal profile and receive tokens
5. **NAV oracle** -- periodic on-chain NAV updates sourced from off-chain `nav_snapshots`
6. **Foundation for secondary market** -- tokens are transferable (subject to restrictions), enabling future regulated secondary trading

### What success looks like

- An accredited investor with KYC verified + signed subscription agreement can connect a wallet and receive tokenized fund interests
- Tokens can only be transferred to other whitelisted (verified + accredited) addresses
- On-chain token balances reconcile with off-chain `fund_subscriptions` records
- NAV per token is updated on-chain periodically, reflecting off-chain fund performance
- Token redemption burns tokens on-chain and triggers the off-chain redemption workflow
- All on-chain events are indexed and stored in the platform database for reconciliation

### Status: ⚪ Not Started (Optional)

### HyFi concept

HyFi = Hybrid Finance. The core principle is that traditional financial operations (lending, underwriting, payments, compliance) remain off-chain in the battle-tested Supabase/PostgreSQL stack, while the settlement, ownership transfer, and liquidity layers are on-chain. This avoids the pitfalls of "putting everything on-chain" while gaining the benefits of tokenization:

| Layer | Off-Chain (Supabase) | On-Chain (Base) |
|---|---|---|
| Loan origination | ✅ | ❌ |
| Underwriting | ✅ | ❌ |
| Payment processing | ✅ | ❌ |
| Compliance (KYC/AML) | ✅ | Attestations only |
| Fund accounting (NAV) | ✅ (source of truth) | Oracle-fed |
| Investor ownership | ✅ (source of truth) | Token representation |
| Ownership transfers | ❌ | ✅ |
| Secondary trading | ❌ | ✅ (future) |

---

## 2. Architecture Overview (On-Chain vs Off-Chain)

### Dual ledger model

```
┌──────────────────────────────┐     ┌──────────────────────────────┐
│       OFF-CHAIN (Supabase)   │     │       ON-CHAIN (Base L2)     │
│                              │     │                              │
│  fund_subscriptions          │◄───►│  LoanParticipationToken      │
│  (source of truth)           │     │  (ERC-20 balances)           │
│                              │     │                              │
│  nav_snapshots               │────►│  NAVOracle                   │
│  (source of truth)           │     │  (on-chain NAV feed)         │
│                              │     │                              │
│  kyc_verifications           │────►│  TransferRestrictor          │
│  accreditation_records       │     │  (whitelist enforcement)     │
│                              │     │                              │
│  investors                   │◄───►│  investor_wallets            │
│  (profiles)                  │     │  (address mapping)           │
│                              │     │                              │
│  bridge_events               │◄────│  Blockchain events           │
│  (reconciliation log)        │     │  (The Graph indexer)         │
└──────────────────────────────┘     └──────────────────────────────┘
```

### Data flow direction

| Flow | Direction | Trigger |
|---|---|---|
| Token issuance | Off-chain → On-chain | Subscription activated + wallet connected |
| Token transfer | On-chain only | Investor-initiated (restricted) |
| Token redemption | On-chain → Off-chain | Investor burns tokens, triggers off-chain redemption |
| NAV update | Off-chain → On-chain | Admin records NAV snapshot, oracle pushes to chain |
| Whitelist update | Off-chain → On-chain | KYC verified + accredited → address whitelisted |
| Event indexing | On-chain → Off-chain | The Graph indexes events, webhook to platform |
| Reconciliation | Bidirectional | Scheduled job compares on-chain balances to off-chain records |

### Reconciliation strategy

A scheduled job (pg_cron or n8n workflow) runs daily to compare:
1. On-chain token balances (from The Graph) vs off-chain `fund_subscriptions.units_issued`
2. On-chain total supply vs off-chain `funds.total_units`
3. On-chain NAV per token vs off-chain `funds.nav_per_unit`

Discrepancies are flagged in the `bridge_events` table with `event_type = 'reconciliation_mismatch'` and a high-priority task is created for admin review.

---

## 3. Smart Contract Architecture

### Contract overview

| Contract | Standard | Purpose |
|---|---|---|
| `LoanParticipationToken` | ERC-20 + ERC-20Permit | Tokenized fund interests; one token contract per fund |
| `FundRegistry` | Custom | Registry of all fund token contracts; admin-controlled |
| `TransferRestrictor` | Custom | Whitelist enforcement for compliant transfers |
| `NAVOracle` | Custom | On-chain NAV storage; updated by authorized oracle address |
| `RedemptionQueue` | Custom | Manages token burn + off-chain redemption requests |

### `LoanParticipationToken` (ERC-20)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

contract LoanParticipationToken is
    ERC20Upgradeable,
    ERC20PermitUpgradeable,
    UUPSUpgradeable,
    AccessControlUpgradeable
{
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    ITransferRestrictor public transferRestrictor;
    INAVOracle public navOracle;

    // Fund metadata
    string public fundId;          // Off-chain fund UUID
    uint256 public vintageYear;

    function initialize(
        string memory name,
        string memory symbol,
        string memory _fundId,
        uint256 _vintageYear,
        address _transferRestrictor,
        address _navOracle,
        address admin
    ) public initializer { ... }

    // Override transfer to enforce restrictions
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            // Not mint or burn -- enforce transfer restrictions
            require(
                transferRestrictor.canTransfer(from, to, value),
                "Transfer restricted"
            );
        }
        super._update(from, to, value);
    }

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) { ... }
    function burn(address from, uint256 amount) external onlyRole(BURNER_ROLE) { ... }
    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
```

### `TransferRestrictor`

```solidity
contract TransferRestrictor is AccessControlUpgradeable, UUPSUpgradeable {
    bytes32 public constant WHITELISTER_ROLE = keccak256("WHITELISTER_ROLE");

    mapping(address => bool) public isWhitelisted;
    mapping(address => uint256) public whitelistedAt;
    mapping(address => uint256) public accreditationExpiry;

    event AddressWhitelisted(address indexed account, uint256 accreditationExpiry);
    event AddressRemoved(address indexed account, string reason);

    function whitelist(address account, uint256 _accreditationExpiry)
        external onlyRole(WHITELISTER_ROLE)
    {
        isWhitelisted[account] = true;
        whitelistedAt[account] = block.timestamp;
        accreditationExpiry[account] = _accreditationExpiry;
        emit AddressWhitelisted(account, _accreditationExpiry);
    }

    function removeFromWhitelist(address account, string calldata reason)
        external onlyRole(WHITELISTER_ROLE)
    {
        isWhitelisted[account] = false;
        emit AddressRemoved(account, reason);
    }

    function canTransfer(address from, address to, uint256 /* amount */)
        external view returns (bool)
    {
        return isWhitelisted[from]
            && isWhitelisted[to]
            && accreditationExpiry[from] > block.timestamp
            && accreditationExpiry[to] > block.timestamp;
    }
}
```

### `NAVOracle`

```solidity
contract NAVOracle is AccessControlUpgradeable {
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    struct NAVSnapshot {
        uint256 navPerUnit;    // 18 decimals
        uint256 totalNav;      // 18 decimals
        uint256 timestamp;
        bytes32 offChainRef;   // Off-chain nav_snapshot UUID hash
    }

    NAVSnapshot public latestSnapshot;
    NAVSnapshot[] public snapshotHistory;

    event NAVUpdated(uint256 navPerUnit, uint256 totalNav, uint256 timestamp, bytes32 offChainRef);

    function updateNAV(
        uint256 _navPerUnit,
        uint256 _totalNav,
        bytes32 _offChainRef
    ) external onlyRole(ORACLE_ROLE) {
        latestSnapshot = NAVSnapshot({
            navPerUnit: _navPerUnit,
            totalNav: _totalNav,
            timestamp: block.timestamp,
            offChainRef: _offChainRef
        });
        snapshotHistory.push(latestSnapshot);
        emit NAVUpdated(_navPerUnit, _totalNav, block.timestamp, _offChainRef);
    }
}
```

### `RedemptionQueue`

```solidity
contract RedemptionQueue is AccessControlUpgradeable {
    bytes32 public constant PROCESSOR_ROLE = keccak256("PROCESSOR_ROLE");

    struct RedemptionRequest {
        address investor;
        uint256 tokenAmount;
        uint256 requestedAt;
        bool processed;
        bool cancelled;
    }

    RedemptionRequest[] public requests;
    LoanParticipationToken public token;

    event RedemptionRequested(uint256 indexed requestId, address indexed investor, uint256 amount);
    event RedemptionProcessed(uint256 indexed requestId, address indexed investor, uint256 amount);
    event RedemptionCancelled(uint256 indexed requestId, address indexed investor);

    function requestRedemption(uint256 amount) external {
        require(token.balanceOf(msg.sender) >= amount, "Insufficient balance");
        // Transfer tokens to this contract (escrow)
        token.transferFrom(msg.sender, address(this), amount);
        requests.push(RedemptionRequest({
            investor: msg.sender,
            tokenAmount: amount,
            requestedAt: block.timestamp,
            processed: false,
            cancelled: false
        }));
        emit RedemptionRequested(requests.length - 1, msg.sender, amount);
    }

    function processRedemption(uint256 requestId) external onlyRole(PROCESSOR_ROLE) {
        RedemptionRequest storage req = requests[requestId];
        require(!req.processed && !req.cancelled, "Already processed");
        // Burn the escrowed tokens
        token.burn(address(this), req.tokenAmount);
        req.processed = true;
        emit RedemptionProcessed(requestId, req.investor, req.tokenAmount);
        // Off-chain: platform processes the actual payout
    }
}
```

### Upgrade pattern

All contracts use the UUPS (Universal Upgradeable Proxy Standard) pattern via OpenZeppelin:
- Proxy contract holds storage and delegates calls to implementation
- `_authorizeUpgrade()` restricted to `DEFAULT_ADMIN_ROLE` (multisig)
- Implementation upgrades require multisig approval
- Storage layout must be append-only across upgrades (no slot collisions)

---

## 4. Token Economics

### Token structure

| Property | Value |
|---|---|
| Standard | ERC-20 |
| Decimals | 18 |
| Name | Fund-specific (e.g. "NexusBridge Capital LP Participation") |
| Symbol | Fund-specific (e.g. "NBLP") |
| Supply | Dynamic (minted on subscription, burned on redemption) |
| Backing | 1 token = 1 unit in the off-chain fund |

### Token minting

Tokens are minted when:
1. An investor's fund subscription reaches `active` status (off-chain)
2. The investor has connected a whitelisted wallet
3. The platform backend calls `LoanParticipationToken.mint(investorWallet, units)`

Mint amount = `fund_subscriptions.units_issued` (converted to 18-decimal token units)

### Token burning

Tokens are burned when:
1. An investor requests redemption via the RedemptionQueue contract
2. The platform backend processes the off-chain payout
3. The backend calls `RedemptionQueue.processRedemption(requestId)` which burns the tokens

### NAV relationship

- `nav_per_unit` is published on-chain via the NAVOracle
- Token holders can query current NAV at any time
- The token itself does not have a price -- NAV per unit is an informational feed
- Future secondary market pricing may diverge from NAV (premium/discount)

---

## 5. Investor Wallet Integration

### Wallet connection flow

```
1. Investor logs into portal (off-chain auth via Supabase)
2. Navigates to /dashboard/investor/wallet
3. Clicks "Connect Wallet" → MetaMask/WalletConnect modal
4. Signs a message: "Link wallet {address} to NexusBridge investor {investorId}"
5. Backend verifies signature, stores wallet address in investor_wallets table
6. Backend checks: KYC verified? Accredited? Subscription signed?
7. If all checks pass: call TransferRestrictor.whitelist(address, accreditationExpiry)
8. Wallet is now eligible to receive tokens
```

### Supported wallets

| Wallet | Protocol | Priority |
|---|---|---|
| MetaMask | injected (EIP-1193) | P0 |
| WalletConnect | WalletConnect v2 | P0 |
| Coinbase Wallet | injected / WalletConnect | P1 |
| Ledger | via MetaMask / WalletConnect | P1 |

### Frontend integration

Use `wagmi` + `viem` for wallet interaction:

```typescript
// Wallet connection
import { useConnect, useAccount, useSignMessage } from 'wagmi';

// Chain configuration
import { base } from 'viem/chains';

// Token reads
import { useReadContract } from 'wagmi';
```

### Wallet-investor linking rules

- One investor can link multiple wallets (primary + backup)
- One wallet can only be linked to one investor (unique constraint)
- Wallet address is verified via signed message (EIP-191)
- Unlinking a wallet requires admin approval and triggers token transfer to another linked wallet
- All wallet link/unlink events emit audit events

---

## 6. Token Issuance Flow

### End-to-end flow

```
1. Investor completes off-chain subscription:
   - KYC verified (kyc_verifications.status = 'verified')
   - Accredited (accreditation_records.status = 'verified', not expired)
   - Subscription agreement signed (signature_requests.status = 'signed')
   - Fund subscription active (fund_subscriptions.subscription_status = 'active')

2. Investor connects wallet (Section 5)

3. Platform backend detects issuance eligibility:
   - Subscription active + wallet connected + wallet whitelisted

4. Platform backend calls:
   a. TransferRestrictor.whitelist(walletAddress, accreditationExpiry) [if not already]
   b. LoanParticipationToken.mint(walletAddress, tokenAmount)

5. Token issuance event indexed by The Graph

6. Platform creates token_issuances record:
   - subscription_id, wallet_address, token_amount, tx_hash, block_number

7. Audit event: token_issued

8. Notification to investor: "Your fund participation tokens have been issued"
```

### Issuance gate checks (all must pass)

| Check | Source | Failure Action |
|---|---|---|
| KYC verified | `kyc_verifications.status = 'verified'` | Block issuance, notify investor to complete KYC |
| Accreditation verified (not expired) | `accreditation_records.status = 'verified' AND expires_at > NOW()` | Block issuance, notify investor to renew accreditation |
| Subscription agreement signed | `signature_requests.status = 'signed'` | Block issuance, notify investor to sign agreement |
| Fund subscription active | `fund_subscriptions.subscription_status = 'active'` | Block issuance (subscription not yet approved) |
| Wallet connected and whitelisted | `investor_wallets.is_whitelisted = true` | Block issuance, prompt wallet connection |

---

## 7. Transfer Restrictions & Compliance

### On-chain enforcement

The `TransferRestrictor` contract enforces:

1. **Sender whitelist check** -- sender must be on the whitelist
2. **Receiver whitelist check** -- receiver must be on the whitelist
3. **Accreditation expiry check** -- both sender and receiver must have non-expired accreditation
4. **Lockup period** (optional future) -- tokens cannot be transferred within X days of issuance

### Whitelist management

| Action | Trigger | On-Chain Effect |
|---|---|---|
| Add to whitelist | KYC verified + accreditation verified + wallet connected | `TransferRestrictor.whitelist(address, expiry)` |
| Remove from whitelist | KYC expired, accreditation expired, compliance flag | `TransferRestrictor.removeFromWhitelist(address, reason)` |
| Update expiry | Accreditation renewed | `TransferRestrictor.whitelist(address, newExpiry)` |

### Off-chain compliance checks before on-chain actions

Even though the smart contract enforces restrictions, the platform backend also validates compliance before initiating any on-chain transaction:

```
Backend pre-flight checks:
1. Verify investor's KYC is current
2. Verify investor's accreditation is not expired
3. Run OFAC screening (if not run in last 24 hours)
4. Verify no compliance holds on the investor account
5. Verify transaction does not exceed Reg A limits (if applicable)

Only if all checks pass → submit on-chain transaction
```

This dual-layer approach (off-chain + on-chain) ensures compliance even if someone bypasses the platform UI and interacts directly with the smart contract.

### Reg D 506(c) token compliance

| Requirement | Implementation |
|---|---|
| Accredited investors only | TransferRestrictor whitelist requires accreditation record |
| Reasonable steps to verify | Phase 4 accreditation verification (third-party letter, income/net worth docs) |
| No general solicitation of non-accredited | Token contract is not publicly discoverable; only accessible via portal |
| Transfer restrictions | TransferRestrictor enforces whitelist on every transfer |
| Issuer records | All issuance/transfer events indexed and stored in bridge_events |

---

## 8. Token Redemption Flow

### End-to-end flow

```
1. Investor initiates redemption via portal UI (/dashboard/investor/wallet)
2. Portal calls RedemptionQueue.requestRedemption(amount) via investor's wallet
3. Tokens are transferred to RedemptionQueue contract (escrow)
4. On-chain event indexed: RedemptionRequested
5. Platform backend detects redemption request via The Graph webhook
6. Platform creates off-chain redemption record:
   - token_issuances updated with redemption_requested_at
   - Task created for admin: "Process redemption for {investor}"
7. Admin reviews and processes off-chain payout (wire transfer, ACH)
8. After payout confirmed, admin triggers:
   - Platform calls RedemptionQueue.processRedemption(requestId)
   - Tokens are burned
9. On-chain event indexed: RedemptionProcessed
10. Platform updates records:
    - fund_subscriptions.subscription_status → 'redeemed'
    - token_issuances.redeemed_at set
    - funds.total_units reduced
11. Audit event: token_redeemed
12. Notification to investor: "Your redemption has been processed"
```

### Redemption rules

| Rule | Value |
|---|---|
| Minimum redemption | Fund-specific (e.g. 1,000 tokens) |
| Redemption window | Quarterly (or as defined in fund documents) |
| Processing time | Up to 30 business days after redemption window closes |
| Partial redemption | Allowed (burn partial balance, retain remainder) |
| Cancellation | Allowed before processing (tokens returned from escrow) |
| NAV pricing | Redemption priced at NAV as of the redemption window close date |

---

## 9. Blockchain Event Indexing

### The Graph subgraph

A subgraph indexes events from all Phase 5 contracts on Base:

| Event | Contract | Indexed Data |
|---|---|---|
| `Transfer` | LoanParticipationToken | from, to, amount, blockNumber, timestamp |
| `AddressWhitelisted` | TransferRestrictor | account, accreditationExpiry |
| `AddressRemoved` | TransferRestrictor | account, reason |
| `NAVUpdated` | NAVOracle | navPerUnit, totalNav, timestamp, offChainRef |
| `RedemptionRequested` | RedemptionQueue | requestId, investor, amount |
| `RedemptionProcessed` | RedemptionQueue | requestId, investor, amount |
| `RedemptionCancelled` | RedemptionQueue | requestId, investor |

### Event flow to platform

```
On-chain event → The Graph indexes → Subgraph webhook fires
→ POST /api/webhooks/blockchain → Verify webhook signature
→ Parse event → Write to bridge_events table
→ Trigger platform actions (update records, create tasks, send notifications)
```

### Reconciliation via bridge_events

The `bridge_events` table stores every on-chain event for reconciliation:

```sql
-- Daily reconciliation query
SELECT
  iw.investor_id,
  iw.wallet_address,
  fs.units_issued AS offchain_balance,
  be.token_balance AS onchain_balance,
  ABS(fs.units_issued - be.token_balance) AS discrepancy
FROM investor_wallets iw
JOIN fund_subscriptions fs ON fs.investor_id = iw.investor_id
JOIN LATERAL (
  SELECT ... -- latest balance from bridge_events
) be ON true
WHERE ABS(fs.units_issued - be.token_balance) > 0.000001;
```

---

## 10. New Database Tables

### `token_issuances`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| subscription_id | uuid | FK -> fund_subscriptions.id |
| fund_id | uuid | FK -> funds.id |
| investor_id | uuid | FK -> investors.id |
| wallet_address | text | Ethereum address |
| token_amount | numeric(36,18) | Amount minted (18 decimals) |
| tx_hash | text | Mint transaction hash |
| block_number | bigint | Block number of mint |
| status | text | `pending`, `confirmed`, `failed`, `redeemed` |
| redeemed_at | timestamptz | Nullable |
| redemption_tx_hash | text | Nullable |
| created_at | timestamptz | |
| created_by | uuid | |

### `on_chain_positions`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| investor_id | uuid | FK -> investors.id |
| wallet_address | text | |
| fund_id | uuid | FK -> funds.id |
| token_contract_address | text | ERC-20 contract address |
| token_balance | numeric(36,18) | Current on-chain balance |
| last_synced_at | timestamptz | Last sync from The Graph |
| last_block_number | bigint | Block number of last sync |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `bridge_events`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| event_type | text | `transfer`, `mint`, `burn`, `whitelist_add`, `whitelist_remove`, `nav_update`, `redemption_requested`, `redemption_processed`, `reconciliation_mismatch` |
| contract_address | text | Source contract |
| tx_hash | text | Transaction hash |
| block_number | bigint | |
| log_index | integer | |
| event_data | jsonb | Parsed event data |
| processed | boolean | Default false; set true after platform processes the event |
| processed_at | timestamptz | Nullable |
| error | text | Nullable; error message if processing failed |
| created_at | timestamptz | |

### `smart_contract_registry`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| fund_id | uuid | Nullable FK -> funds.id |
| contract_type | text | `token`, `restrictor`, `nav_oracle`, `redemption_queue`, `fund_registry` |
| contract_address | text | Deployed address |
| chain_id | integer | 8453 (Base mainnet) or 84532 (Base Sepolia) |
| implementation_address | text | Nullable; UUPS implementation address |
| deployment_tx_hash | text | |
| deployment_block | bigint | |
| abi_hash | text | Hash of the contract ABI for verification |
| is_active | boolean | Default true |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| created_by | uuid | |

### `investor_wallets`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| investor_id | uuid | FK -> investors.id |
| wallet_address | text | Ethereum address (checksummed) |
| chain_id | integer | 8453 (Base mainnet) |
| is_primary | boolean | Default false |
| is_whitelisted | boolean | Default false; set true after on-chain whitelist |
| whitelisted_at | timestamptz | Nullable |
| verification_signature | text | EIP-191 signed message proving ownership |
| verified_at | timestamptz | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Constraints:**
- Unique on `wallet_address` -- one wallet per investor
- One primary wallet per investor (partial unique index)

---

## 11. New API Routes

| Method | Path | Roles | Description |
|---|---|---|---|
| **Wallet** | | | |
| POST | `/api/investor/wallet/connect` | investor | Link wallet to investor profile (verify signature) |
| DELETE | `/api/investor/wallet/[address]` | investor, admin | Unlink wallet (requires admin approval if tokens held) |
| GET | `/api/investor/wallet` | investor | Get linked wallets and whitelist status |
| **Token** | | | |
| POST | `/api/tokens/issue` | admin | Trigger token issuance for eligible subscription |
| GET | `/api/tokens/[fundId]/balances` | admin | List all token holders and balances |
| GET | `/api/tokens/[fundId]/issuances` | admin, investor (own) | List token issuance history |
| **Redemption** | | | |
| GET | `/api/tokens/[fundId]/redemptions` | admin | List all redemption requests |
| PATCH | `/api/tokens/redemptions/[id]/process` | admin | Process a redemption (trigger on-chain burn) |
| **NAV** | | | |
| POST | `/api/tokens/[fundId]/nav/publish` | admin | Publish NAV snapshot to on-chain oracle |
| **Whitelist** | | | |
| POST | `/api/tokens/whitelist/add` | admin | Add address to on-chain whitelist |
| POST | `/api/tokens/whitelist/remove` | admin | Remove address from on-chain whitelist |
| GET | `/api/tokens/whitelist` | admin | List all whitelisted addresses |
| **Events** | | | |
| POST | `/api/webhooks/blockchain` | The Graph (API key) | Inbound webhook for blockchain events |
| GET | `/api/tokens/events` | admin | List bridge events (filterable) |
| **Registry** | | | |
| GET | `/api/tokens/contracts` | admin | List deployed smart contracts |
| POST | `/api/tokens/contracts` | admin | Register a deployed contract |
| **Reconciliation** | | | |
| GET | `/api/tokens/reconciliation` | admin | Run reconciliation check and return discrepancies |

---

## 12. New UI Pages/Components

### New pages

| Page | Path | Role | Description |
|---|---|---|---|
| Investor Wallet | `/dashboard/investor/wallet` | investor | Connect wallet, view token balances, request redemption |
| Token Dashboard | `/dashboard/admin/tokens` | admin | Token issuance overview, balances, events, reconciliation |
| Token Detail (per fund) | `/dashboard/admin/tokens/[fundId]` | admin | Fund-specific: holders, issuances, NAV history, redemptions |
| Whitelist Management | `/dashboard/admin/tokens/whitelist` | admin | View/add/remove whitelisted addresses |
| Contract Registry | `/dashboard/admin/tokens/contracts` | admin | Deployed contracts, verification status, upgrade history |

### New components

| Component | Description |
|---|---|
| `WalletConnectButton` | MetaMask/WalletConnect connection modal using wagmi |
| `WalletLinkedBadge` | Shows linked wallet status on investor profile |
| `TokenBalanceCard` | Displays investor's token balance, NAV value, and fund name |
| `TokenIssuanceButton` | Admin action: trigger token issuance for eligible subscription |
| `RedemptionRequestForm` | Investor-facing form to request token redemption |
| `RedemptionQueueTable` | Admin view of pending/processed redemptions |
| `NAVPublishButton` | Admin action: publish latest NAV snapshot to on-chain oracle |
| `ReconciliationReport` | Admin view: on-chain vs off-chain balance comparison |
| `WhitelistTable` | Admin view of all whitelisted addresses with expiry dates |
| `BridgeEventLog` | Filterable log of all on-chain events |
| `ContractVerificationBadge` | Shows contract verification status (verified on BaseScan) |

---

## 13. Development Toolchain

### Smart contract development

| Tool | Purpose | Version |
|---|---|---|
| Foundry (forge, cast, anvil) | Smart contract compilation, testing, deployment | Latest stable |
| OpenZeppelin Contracts | ERC-20, AccessControl, UUPS, Permit | v5.x |
| Solidity | Smart contract language | ^0.8.20 |
| Base Sepolia | Testnet | Chain ID: 84532 |
| Base Mainnet | Production | Chain ID: 8453 |

### Frontend blockchain integration

| Tool | Purpose | Version |
|---|---|---|
| wagmi | React hooks for Ethereum | v2.x |
| viem | TypeScript Ethereum library (wagmi dependency) | v2.x |
| @rainbow-me/rainbowkit | Wallet connection modal | v2.x |
| @tanstack/react-query | Async state management (wagmi dependency) | v5.x |

### Indexing and monitoring

| Tool | Purpose |
|---|---|
| The Graph | Subgraph for event indexing |
| graph-cli | Subgraph development and deployment |
| BaseScan | Block explorer and contract verification |
| Tenderly | Transaction simulation and monitoring (optional) |

### Monorepo changes

```
packages/
  contracts/              # New: Foundry project for smart contracts
    src/
      LoanParticipationToken.sol
      TransferRestrictor.sol
      NAVOracle.sol
      RedemptionQueue.sol
      FundRegistry.sol
    test/
    script/               # Deployment scripts
    foundry.toml
  subgraph/               # New: The Graph subgraph
    src/
      mapping.ts
    schema.graphql
    subgraph.yaml
apps/
  portal/
    src/
      lib/
        blockchain/       # New: wagmi config, contract ABIs, helpers
          config.ts       # Chain config, wagmi setup
          abis/           # Contract ABIs (auto-generated from Foundry)
          hooks/          # Custom wagmi hooks
```

---

## 14. Security & Audit Requirements

### Smart contract security

| Requirement | Implementation |
|---|---|
| Admin key management | Gnosis Safe multisig (3-of-5) for all admin roles |
| Upgrade authorization | UUPS pattern; upgrades require multisig approval |
| Access control | OpenZeppelin AccessControl with granular roles |
| Reentrancy protection | No external calls before state changes; OpenZeppelin ReentrancyGuard where needed |
| Integer overflow | Solidity ^0.8.x has built-in overflow checks |
| Formal audit | Required before mainnet deployment; minimum one reputable audit firm |

### Audit requirements

| Audit Type | Timing | Provider (Recommended) |
|---|---|---|
| Smart contract audit | Before mainnet deployment | OpenZeppelin, Trail of Bits, or Consensys Diligence |
| Penetration test (web3) | Before mainnet deployment | Cure53 or similar |
| Economic audit | Before mainnet deployment | Gauntlet or internal review |
| Ongoing monitoring | Post-deployment | Tenderly alerts, Forta (optional) |

### Key management

```
Multisig (Gnosis Safe): 3-of-5 signers
  ├── DEFAULT_ADMIN_ROLE    → Multisig
  ├── MINTER_ROLE           → Platform backend wallet (hot wallet, rate-limited)
  ├── BURNER_ROLE           → Platform backend wallet (hot wallet, rate-limited)
  ├── WHITELISTER_ROLE      → Platform backend wallet (hot wallet, rate-limited)
  ├── ORACLE_ROLE           → Platform backend wallet (hot wallet, rate-limited)
  └── PROCESSOR_ROLE        → Platform backend wallet (hot wallet, rate-limited)
```

**Hot wallet security**:
- Backend wallet private key stored in Vercel environment variables (encrypted)
- Rate-limited: max N transactions per hour (enforced off-chain)
- Low balance: only holds enough ETH for gas (auto-topped up from multisig)
- Monitoring: alert if balance drops below threshold or unexpected transactions detected

### Emergency procedures

| Scenario | Action |
|---|---|
| Smart contract vulnerability discovered | Pause all contracts (if pausable); deploy fix via UUPS upgrade |
| Private key compromise (hot wallet) | Revoke all roles from compromised address via multisig; rotate to new wallet |
| Private key compromise (multisig signer) | Replace compromised signer key; threshold still met by remaining signers |
| Reconciliation mismatch detected | Halt new issuances; investigate; correct off-chain records if platform error, or submit corrective on-chain transaction |

---

## 15. Regulatory Considerations

### Securities law compliance

| Regulation | Requirement | Implementation |
|---|---|---|
| Reg D 506(c) | Accredited investors only | TransferRestrictor whitelist; off-chain accreditation verification (Phase 4) |
| Reg D 506(c) | Reasonable steps to verify | Third-party verification via VerifyInvestor or equivalent (Phase 4) |
| Reg D | Transfer restrictions | Smart contract enforces whitelist; 12-month holding period (optional) |
| Securities Act | Issuance records | All issuances logged in `token_issuances` table + on-chain events |
| Exchange Act | Transfer records | All transfers indexed via The Graph and stored in `bridge_events` |

### Token classification

The tokenized fund interests are **securities** under the Howey test:
- Investment of money (subscription capital)
- In a common enterprise (NexusBridge Capital LP)
- With expectation of profits (loan interest income)
- Derived from the efforts of others (NexusBridge management)

This means:
- Tokens must be issued under a securities exemption (Reg D 506(c))
- Transfers are restricted to verified accredited investors
- No public trading without ATS registration or Reg A qualification
- The platform operates as the issuer's technology provider, not a broker-dealer

### Transfer agent considerations

If secondary trading volume justifies it, the platform should engage a registered transfer agent to:
- Maintain the official record of token holders
- Process transfers and verify compliance
- Issue and cancel tokens on behalf of the issuer

This is a **future consideration** -- not required for initial issuance.

---

## 16. Dependencies on Phase 4

Phase 5 cannot begin until the following Phase 4 deliverables are complete:

| Phase 4 Deliverable | Phase 5 Dependency | Status |
|---|---|---|
| KYC verification (Persona) | Token issuance gate: KYC must be verified | ⚪ Step 4 |
| Accreditation verification | Token issuance gate + TransferRestrictor whitelist | ⚪ Step 4 |
| E-signature (subscription agreement) | Token issuance gate: subscription must be signed | ✅ Step 2 |
| Workflow automation | Auto-trigger token issuance when all gates pass | ✅ Step 1 (partial) |
| Webhook infrastructure | Reusable patterns for blockchain event webhooks | ✅ Step 1 |
| OFAC screening | Pre-issuance compliance check | ⚪ Step 4 |
| Investor limit tracking | Pre-issuance Reg A limit check (if applicable) | ⚪ Step 4 |

### Minimum viable Phase 4 for Phase 5

At minimum, Phase 5 requires:
1. ✅ E-signatures (Step 2) -- subscription agreements must be signed
2. ⚪ KYC verification (Step 4) -- investor identity must be verified
3. ⚪ Accreditation verification (Step 4) -- accredited investor status must be confirmed
4. ⚪ OFAC screening (Step 4) -- investor must pass sanctions screening

OCR (Step 3) is not a hard dependency for Phase 5.

---

## 17. Phase 5 to Future Bridge

### Potential future extensions beyond Phase 5

| Feature | Description | Complexity |
|---|---|---|
| **Regulated ATS** | Secondary trading marketplace for tokenized interests; requires ATS registration or partnership with registered ATS | Very High |
| **Cross-chain bridging** | Bridge tokens from Base to Ethereum mainnet or other L2s | High |
| **Proof-of-reserve oracle** | On-chain attestation of fund reserves backed by OCR-extracted financial data | Medium |
| **Dividend distribution** | On-chain distribution of fund income to token holders (in USDC) | Medium |
| **Governance tokens** | Separate governance token for fund management votes | Medium |
| **NFT loan representations** | Each individual loan represented as an NFT with metadata | Medium |
| **Programmable compliance** | ERC-3643 (T-REX) standard for institutional-grade token compliance | High |
| **Institutional custody** | Integration with Fireblocks, Anchorage, or BitGo for institutional custody | Medium |

### Migration path to ERC-3643 (T-REX)

If institutional adoption requires it, the token standard can be upgraded from basic ERC-20 + TransferRestrictor to ERC-3643 (T-REX), which provides:
- On-chain identity registry (via ONCHAINID)
- Compliance module with pluggable rules
- Built-in claim-based identity verification
- Institutional-grade transfer agent integration

This would be a **major upgrade** requiring a new token deployment and migration of existing balances.

---

## 18. Testing Requirements

### Smart contract unit tests (Foundry)

- [ ] `LoanParticipationToken`: mint increases balance and total supply
- [ ] `LoanParticipationToken`: burn decreases balance and total supply
- [ ] `LoanParticipationToken`: transfer succeeds between whitelisted addresses
- [ ] `LoanParticipationToken`: transfer reverts between non-whitelisted addresses
- [ ] `LoanParticipationToken`: transfer reverts if sender accreditation expired
- [ ] `LoanParticipationToken`: transfer reverts if receiver accreditation expired
- [ ] `LoanParticipationToken`: only MINTER_ROLE can mint
- [ ] `LoanParticipationToken`: only BURNER_ROLE can burn
- [ ] `LoanParticipationToken`: UUPS upgrade restricted to admin
- [ ] `TransferRestrictor`: whitelist adds address with expiry
- [ ] `TransferRestrictor`: removeFromWhitelist blocks future transfers
- [ ] `TransferRestrictor`: canTransfer returns false for expired accreditation
- [ ] `TransferRestrictor`: only WHITELISTER_ROLE can modify whitelist
- [ ] `NAVOracle`: updateNAV stores snapshot and emits event
- [ ] `NAVOracle`: only ORACLE_ROLE can update NAV
- [ ] `NAVOracle`: snapshot history is append-only
- [ ] `RedemptionQueue`: requestRedemption escrows tokens
- [ ] `RedemptionQueue`: processRedemption burns escrowed tokens
- [ ] `RedemptionQueue`: cannot process already-processed request
- [ ] `RedemptionQueue`: cancellation returns tokens to investor
- [ ] `FundRegistry`: register and retrieve fund token contracts

### Integration tests (platform + blockchain)

- [ ] Wallet connect flow: signature verification → investor_wallets record created
- [ ] Token issuance: all gates pass → mint transaction submitted → token_issuances record created
- [ ] Token issuance: KYC not verified → issuance blocked with clear error
- [ ] Token issuance: accreditation expired → issuance blocked with clear error
- [ ] Whitelist sync: accreditation verified → address whitelisted on-chain
- [ ] Whitelist sync: accreditation expired → address removed from whitelist on-chain
- [ ] NAV publish: admin publishes → on-chain oracle updated → bridge_event recorded
- [ ] Redemption flow: investor requests → escrow → admin processes → tokens burned → off-chain records updated
- [ ] Event indexing: on-chain event → The Graph → webhook → bridge_events record
- [ ] Reconciliation: detect and flag on-chain vs off-chain discrepancy

### E2E tests

- [ ] Full investor tokenization journey: signup → KYC → accreditation → subscribe → sign → connect wallet → receive tokens → view balance
- [ ] Full redemption journey: request redemption → admin processes → payout → tokens burned → balance updated
- [ ] Transfer between investors: Investor A transfers to Investor B (both whitelisted) → balances update on both sides
- [ ] Blocked transfer: Investor A tries to transfer to non-whitelisted address → transaction reverts
- [ ] NAV lifecycle: admin records NAV → publishes to oracle → investor sees updated NAV in portal
- [ ] Accreditation expiry: accreditation expires → whitelist removed → transfers blocked → renewal → whitelist restored

---

## 19. External Service Dependencies

| Service | Purpose | Credentials Needed | Est. Cost (Monthly) | Complexity |
|---|---|---|---|---|
| **Base RPC** (Alchemy/Infura/QuickNode) | Blockchain node access for transaction submission and reads | RPC_URL, API_KEY | $0-50 (free tier likely sufficient) | Low |
| **The Graph** (hosted or Subgraph Studio) | Event indexing subgraph | GRAPH_API_KEY, deploy key | $0-50 (free tier for hosted; pay-per-query for decentralized) | Medium |
| **BaseScan** | Contract verification and explorer | BASESCAN_API_KEY | Free | Low |
| **Gnosis Safe** | Multisig admin wallet | None (deployed on-chain) | $0 | Low |
| **Tenderly** (optional) | Transaction simulation and monitoring | TENDERLY_API_KEY | $0-50 | Low |
| **Forta** (optional) | Real-time smart contract monitoring and alerts | FORTA_API_KEY | $0-100 | Medium |

### Environment variables to add

```
# Blockchain RPC
NEXT_PUBLIC_BASE_CHAIN_ID=8453
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/xxx
BASE_SEPOLIA_RPC_URL=https://base-sepolia.g.alchemy.com/v2/xxx

# Smart contract addresses (populated after deployment)
TOKEN_CONTRACT_ADDRESS=0x...
TRANSFER_RESTRICTOR_ADDRESS=0x...
NAV_ORACLE_ADDRESS=0x...
REDEMPTION_QUEUE_ADDRESS=0x...
FUND_REGISTRY_ADDRESS=0x...

# Backend wallet (transaction submission)
BACKEND_WALLET_PRIVATE_KEY=xxx  # Hot wallet -- server-only, never client-side

# The Graph
GRAPH_API_KEY=xxx
GRAPH_WEBHOOK_SECRET=xxx
SUBGRAPH_ENDPOINT=https://api.thegraph.com/subgraphs/name/xxx

# Contract verification
BASESCAN_API_KEY=xxx

# WalletConnect (for RainbowKit)
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=xxx

# Monitoring (optional)
TENDERLY_API_KEY=xxx
FORTA_API_KEY=xxx
```

All blockchain private keys and API secrets must be server-only (no `NEXT_PUBLIC_` prefix). Chain IDs and contract addresses may be client-exposed.

---

## 20. Risks & Mitigations

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| **Smart contract vulnerability** | Critical | Medium | Formal audit before mainnet; UUPS upgrade pattern for patching; bug bounty program |
| **Private key compromise** | Critical | Low | Gnosis Safe multisig for admin; hot wallet with minimal balance; key rotation procedures |
| **Regulatory action** | High | Medium | Work with securities counsel; conservative compliance (whitelist-only transfers); maintain traditional off-chain records as source of truth |
| **On-chain / off-chain reconciliation failure** | High | Medium | Daily automated reconciliation; alert on any discrepancy; halt issuances until resolved |
| **The Graph indexer downtime** | Medium | Medium | Fallback to direct RPC event queries; cache last-known state; The Graph decentralized network for redundancy |
| **Base L2 downtime** | Medium | Low | Base is operated by Coinbase with high uptime; off-chain operations continue uninterrupted during L2 outages |
| **Gas price spikes** | Low | Low | Base L2 gas is typically < $0.01/tx; budget for 10x spike; batch operations where possible |
| **User wallet loss** | Medium | Medium | Allow admin to recover by re-minting to new verified wallet (with audit trail); educate investors on wallet backup |
| **Token secondary market manipulation** | Medium | Low | No public secondary market initially; if ATS is added, implement trading halts and surveillance |
| **Accreditation expiry race condition** | Low | Medium | On-chain expiry check is seconds-granular; off-chain check runs before on-chain action; buffer of 1 day before actual expiry |
| **Scope creep** | High | High | Phase 5 is optional; implement minimum viable tokenization first (issuance + restriction + redemption); defer secondary market, cross-chain, governance |
| **Team blockchain expertise gap** | Medium | Medium | Start with Foundry tutorials and Base documentation; consider hiring a Solidity consultant for initial contract development; use OpenZeppelin battle-tested contracts (no custom crypto) |
