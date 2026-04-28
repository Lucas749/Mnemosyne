# Mnemosyne — Full Technical Specification

> AI agents no longer forget. Mnemosyne gives them shared, verified, decentralized on-chain memory — Lethe takes the rest.

---

## 1. System Overview

Mnemosyne is a decentralized, crowdsourced knowledge base and dataset layer for AI agents. Any participant — human or agent — can contribute entries (facts, labeled data, observations). Contributors stake ETH on their submissions. If an entry survives a challenge window unchallenged, it becomes active and earns passive royalties on every query. If challenged and overturned, the contributor is slashed. Wrong data is economically destroyed. Accurate data compounds in value forever.

---

## 2. Core Entities

### 2.1 Entry
The atomic unit of the knowledge base. An entry is any discrete piece of information: a fact, a labeled ML training example, a structured data row, or an agent observation.

**Lifecycle:**
```
submitted
    │
    ▼
pending  ──────── challenge window (48h) ──────► active
    │                                               │
    │                                    ┌──────────┤
    │                                    │          │
    ▼                                    ▼          ▼
  burned                           contested      stale
(overturned)                    (3+ challenges) (no queries 30d)
                                       │               │
                                       ▼               ▼
                                  resolved          burned
                               (upheld/burned)   (grace expired)
```

**Fields:**
| Field | Type | Description |
|---|---|---|
| `id` | `bytes32` | keccak256(content + submitter + timestamp) |
| `content` | `string` | The actual data payload |
| `domain` | `enum` | factual / labeled_example / structured_data / observation / correction |
| `submitter` | `address` | Wallet address of contributor |
| `ensName` | `string` | ENS name of contributor (resolved at submission time) |
| `stakeAmount` | `uint256` | ETH staked in wei |
| `status` | `enum` | pending / active / contested / stale / burned |
| `storageRef` | `string` | 0G Storage content hash / CID |
| `inftTokenId` | `uint256` | 0G iNFT token ID |
| `submittedAt` | `uint256` | unix timestamp |
| `challengeWindowEnd` | `uint256` | submittedAt + 48h |
| `queryCount` | `uint256` | total queries this entry answered |
| `royaltiesEarned` | `uint256` | total wei earned |
| `lastQueriedAt` | `uint256` | unix timestamp |
| `tags` | `string[]` | domain-specific searchability tags |

---

### 2.2 Challenge
A staked dispute opened against a specific entry.

**Fields:**
| Field | Type | Description |
|---|---|---|
| `id` | `bytes32` | keccak256(entryId + challenger + timestamp) |
| `entryId` | `bytes32` | The entry being challenged |
| `challenger` | `address` | Who opened the challenge |
| `challengerStake` | `uint256` | ETH staked by challenger |
| `reason` | `string` | Why the entry is wrong |
| `evidence` | `string` | Optional supporting reference |
| `status` | `enum` | open / voting / awaiting_quorum / resolved_upheld / resolved_overturned |
| `validatorPanel` | `address[]` | Sampled validator addresses |
| `openedAt` | `uint256` | unix timestamp |
| `quorumDeadline` | `uint256` | openedAt + 12h |
| `resolvedAt` | `uint256` | unix timestamp |
| `slashedAddress` | `address` | Who got slashed |
| `slashAmount` | `uint256` | Amount slashed in wei |

---

### 2.3 Validator
A participant who evaluates disputed entries. Sampled by ENS reputation weight.

**Fields:**
| Field | Type | Description |
|---|---|---|
| `address` | `address` | Wallet |
| `ensName` | `string` | ENS identity |
| `tier` | `enum` | bronze / silver / gold / expert |
| `domains` | `enum[]` | Areas of expertise |
| `totalVotes` | `uint256` | Lifetime votes cast |
| `correctVotes` | `uint256` | Votes that matched resolution |
| `accuracyRate` | `uint256` | correctVotes / totalVotes (basis points) |
| `activeStake` | `uint256` | Currently locked in disputes |
| `totalEarned` | `uint256` | Lifetime wei earned |
| `registeredAt` | `uint256` | unix timestamp |

**Tier thresholds:**
| Tier | Min votes | Min accuracy | Panel weight |
|---|---|---|---|
| Bronze | 0 | — | 1x |
| Silver | 10 | 65% | 2x |
| Gold | 50 | 75% | 4x |
| Expert | 200 | 85% | 8x |

---

### 2.4 Vote
A validator's verdict on a challenge.

**Fields:**
| Field | Type | Description |
|---|---|---|
| `challengeId` | `bytes32` | |
| `validator` | `address` | |
| `choice` | `enum` | uphold / overturn |
| `stake` | `uint256` | Validator's stake on this vote |
| `castAt` | `uint256` | |

---

### 2.5 Query
A request to retrieve entries from the knowledge base.

**Fields:**
| Field | Type | Description |
|---|---|---|
| `id` | `bytes32` | |
| `queryText` | `string` | Natural language query |
| `askedBy` | `address` | Querying agent or user |
| `feePaid` | `uint256` | In wei |
| `matchedEntries` | `QueryMatch[]` | Which entries answered |
| `askedAt` | `uint256` | |

**QueryMatch:**
| Field | Type | Description |
|---|---|---|
| `entryId` | `bytes32` | |
| `relevanceScore` | `uint256` | 0–10000 basis points |
| `royaltyShare` | `uint256` | Portion of fee going to author |

---

## 3. Smart Contracts

### 3.1 `MnemosyneRegistry.sol`
Central registry. Owns all entry state. Mints ERC-7857 iNFTs when entries go active.

**Functions:**
```solidity
function submit(string calldata storageRef, string calldata embeddingRef, string[] calldata tags, EntryDomain domain) external payable returns (bytes32 entryId)
function getEntry(bytes32 entryId) external view returns (Entry memory)
function activateEntry(bytes32 entryId) external  // called by Challenge Watcher keeper — mints iNFT
function burnEntry(bytes32 entryId) external       // called by keeper on slash or expiry — burns iNFT
function recordQuery(bytes32 entryId) external     // called by query router
```

**iNFT minting (ERC-7857):**
When `activateEntry()` is called the registry mints an ERC-7857 iNFT for the submitter:
```solidity
IntelligentData[] memory iData = new IntelligentData[](1);
iData[0] = IntelligentData({
    dataDescription: entry.domain,         // e.g. "factual"
    dataHash:        keccak256(abi.encodePacked(entry.storageRef))
});
uint256 tokenId = iNFTContract.mint(iData, entry.submitter);
entries[entryId].inftTokenId = tokenId;
```
The `dataHash` anchors the iNFT to the exact 0G Storage blob. If the entry is burned, `iNFTContract.burn(tokenId)` is called — ownership and royalty rights are destroyed with the entry.

**Events:**
```solidity
event EntrySubmitted(bytes32 indexed entryId, address indexed submitter, uint256 stake)
event EntryActivated(bytes32 indexed entryId, uint256 inftTokenId)
event EntryBurned(bytes32 indexed entryId, string reason)
event EntryContested(bytes32 indexed entryId, uint256 challengeCount)
```

---

### 3.2 `ChallengeManager.sol`
Handles dispute lifecycle.

**Functions:**
```solidity
function openChallenge(bytes32 entryId, string calldata reason, string calldata evidence) external payable returns (bytes32 challengeId)
function castVote(bytes32 challengeId, VoteChoice choice) external payable
function resolveChallenge(bytes32 challengeId) external  // called by Challenge Watcher keeper
function escalateQuorum(bytes32 challengeId) external    // called by Quorum Enforcer keeper
```

**Events:**
```solidity
event ChallengeOpened(bytes32 indexed challengeId, bytes32 indexed entryId, address challenger)
event VoteCast(bytes32 indexed challengeId, address indexed validator, VoteChoice choice)
event ChallengeResolved(bytes32 indexed challengeId, bool upheld, address slashed, uint256 slashAmount)
```

---

### 3.3 `ValidatorRegistry.sol`
Manages validator registration, reputation tiers, and panel sampling.

**Functions:**
```solidity
function register(string calldata ensName, EntryDomain[] calldata domains) external
function samplePanel(bytes32 challengeId, uint256 size) external view returns (address[] memory)
function updateReputation(address validator, bool correct) external  // called by keeper
function getTier(address validator) external view returns (ValidatorTier)
```

---

### 3.4 `RoyaltyVault.sol`
Accumulates query fees and distributes royalties.

**Functions:**
```solidity
function depositQueryFee(bytes32[] calldata entryIds, uint256[] calldata shares) external payable
function distribute() external  // called by Royalty Distributor keeper
function claimable(address contributor) external view returns (uint256)
function claim() external
```

**Events:**
```solidity
event FeesDeposited(uint256 amount, bytes32[] entryIds)
event RoyaltiesDistributed(uint256 totalAmount, uint256 recipientCount)
```

---

### 3.5 `StakeVault.sol`
Holds all staked ETH. Executes slashes and rewards.

**Functions:**
```solidity
function lock(address staker, uint256 amount) external
function slash(address staker, address recipient, uint256 amount) external
function release(address staker, uint256 amount) external
function balanceOf(address staker) external view returns (uint256)
```

---

## 4. External Agent Integration

Mnemosyne is designed to be consumed by any external AI agent — LangChain, LlamaIndex, Claude, custom pipelines — with minimal setup. The only thing an agent needs is an ENS name.

Operator agents (contributors, challengers, validators) are a future network layer. For now, humans and scripts interact with the contracts directly.

### 4.1 Reading Another Agent's Memory

Any agent can load the full verified memory of any other agent using only their ENS name:

```
1. Resolve ENS name → read text record: memory.index = "0g://Qm..."
2. Fetch manifest from 0G → list of { entryId, storageRef, domain, status }
3. Filter by status = active
4. Fetch entry blobs from 0G by storageRef
5. Inject into agent context as verified, staked memory
```

**Example:** An agent building a DeFi report wants to load everything `research-agent.mnemosyne.eth` knows:
```ts
const manifest = await resolveMemory('research-agent.mnemosyne.eth')
const entries  = await fetchEntries(manifest.storageRefs)
// inject entries into LLM context
```

### 4.2 Writing to Your Own Memory

An agent that wants to persist knowledge to Mnemosyne:

```
1. Format the observation as an Entry payload
2. Store the blob on 0G → get back storageRef
3. Call MnemosyneRegistry.submit(storageRef, stake)
4. Update memory.index manifest on 0G to include new entry
5. Update ENS text record memory.index to point to new manifest
```

From this point on: the entry earns royalties, can be challenged, and is accessible to any agent that resolves the ENS name.

### 4.3 Querying the Knowledge Base (RAG)

Mnemosyne queries are a decentralized RAG pipeline. No centralized vector DB — embeddings live on 0G alongside the entry blobs.

**On entry submission:**
1. Generate an embedding vector for the entry content (e.g. `text-embedding-3-small`)
2. Store `{ content, embedding, tags, domain, submitter, ... }` as a single blob on 0G
3. Update the contributor's `memory.index` manifest on 0G to include the new entry + its storageRef

**On query:**
```
POST /query
{
  "q": "what happened during the Ethereum merge?",
  "scope": "research-agent.mnemosyne.eth",  // optional — scope to one agent's memory
  "domains": ["factual"],                   // optional — filter by domain
  "fee": "0.0001"                           // ETH — split to matched entry authors
}
```

```
1. Embed the query text using the same model
2. Load active entry embeddings from 0G
   (scoped to one agent's manifest if scope param provided)
3. Cosine similarity → rank → top-k entries
4. Deposit fee to RoyaltyVault, split proportional to relevance score
5. Return: ranked entry blobs + scores + storageRefs
```

The calling agent injects the returned entries into its LLM context — standard RAG from there.

**Embedding index on 0G:**
Each contributor's `memory.index` manifest includes a compact embedding index:
```json
{
  "entries": [
    {
      "entryId": "0xabc...",
      "storageRef": "0g://Qm...",
      "embeddingRef": "0g://Qm...",
      "domain": "factual",
      "status": "active",
      "tags": ["ethereum", "history"]
    }
  ]
}
```
Embeddings are fetched lazily — only vectors are loaded for similarity search, full blobs fetched only for top-k results.

### 4.4 Future: Operator Agent Network
> To be built post-hackathon. Autonomous contributor, challenger, and validator agents running on Gensyn AXL nodes — turning Mnemosyne into a fully self-operating network where participants earn by running nodes.

---

## 5. Keeper Network (KeeperHub)

Six persistent keeper jobs. All are autonomous — no human trigger needed.

### 5.1 Challenge Watcher
- **Polls:** All entries in `pending` status
- **Condition:** `block.timestamp >= challengeWindowEnd`
- **Action:** Calls `MnemosyneRegistry.activateEntry()` → entry goes `active`
- **Also:** Polls open challenges. On `quorumDeadline` reached with quorum → calls `ChallengeManager.resolveChallenge()`
- **Interval:** Every 5 minutes

### 5.2 Staleness Reaper
- **Polls:** All `active` entries by `lastQueriedAt`
- **Condition:** `now - lastQueriedAt > 30 days`
- **Action:** Sets status to `stale`, emits warning event, starts 24h grace period
- **Interval:** Every 6 hours

### 5.3 Royalty Distributor
- **Polls:** `RoyaltyVault` accumulated balance
- **Condition:** Balance >= distribution threshold (e.g. 0.1 ETH)
- **Action:** Calls `RoyaltyVault.distribute()` → Uniswap routes payments to contributors
- **Interval:** Every 1 hour

### 5.4 Quorum Enforcer
- **Polls:** All challenges in `voting` or `awaiting_quorum` status
- **Condition:** `now > quorumDeadline` and quorum not reached
- **Action:** Broadcasts AXL escalation to recruit 2 additional validators, extends deadline by 6h
- **Interval:** Every 15 minutes

### 5.5 Reputation Auditor
- **Polls:** All validators' `accuracyRate`
- **Condition:** `accuracyRate < 60%` after minimum 10 votes
- **Action:** Calls `ValidatorRegistry.updateReputation()`, triggers ENS Reputation Agent to demote tier
- **Interval:** Every 12 hours

### 5.6 Entry Health Monitor
- **Polls:** All `active` entries' challenge count
- **Condition:** Open challenge count >= 3
- **Action:** Sets status to `contested`, blocks entry from query results
- **Interval:** Every 10 minutes

---

## 6. Compute Layer (0G Compute)

0G Compute provides decentralized AI inference via an **OpenAI-compatible API**. Mnemosyne uses it for two things: generating entry embeddings at submission time, and running LLM-based verification during the challenge process.

### 6.1 Setup

```bash
pnpm add @0glabs/0g-serving-broker
```

Authentication uses a bearer token generated from the CLI:
```bash
npx 0g-serving-broker generate-token
# → app-sk-<SECRET>
```

The client is a standard OpenAI SDK instance pointed at the 0G Compute endpoint:
```typescript
import OpenAI from 'openai'

const client = new OpenAI({
  baseURL: 'https://api.compute.0g.ai/v1',  // 0G Compute endpoint
  apiKey:  process.env.ZG_COMPUTE_TOKEN,     // app-sk-<SECRET>
})
```

### 6.2 Available models

| Model | Type | Network |
|---|---|---|
| `Qwen 2.5 7B Instruct` | Chat | Testnet |
| `Qwen3.6-Plus` | Chat | Mainnet |
| `GLM-5-FP8` | Chat | Mainnet |
| `DeepSeek Chat V3` | Chat | Mainnet |

> No dedicated embedding model is available on 0G Compute yet. Embeddings are generated via `Qwen 2.5 7B` with a prompt-based approach on testnet, or via OpenAI `text-embedding-3-small` as a drop-in fallback.

### 6.3 How Mnemosyne uses 0G Compute

**Embedding generation (on submit):**
```typescript
// Prompt the model to produce a JSON embedding vector
const res = await client.chat.completions.create({
  model:    'Qwen 2.5 7B Instruct',
  messages: [
    { role: 'system',  content: 'Return only a JSON array of 128 floats representing the semantic embedding of the user text.' },
    { role: 'user',    content: entryContent },
  ],
})
const vector = JSON.parse(res.choices[0].message.content)
```

**Challenge verification (during dispute):**
When a validator panel needs an LLM assist to evaluate a disputed entry, the Quorum Enforcer calls 0G Compute with the entry content + challenger evidence and asks for a structured verdict:
```typescript
const res = await client.chat.completions.create({
  model:    'Qwen 2.5 7B Instruct',
  messages: [
    { role: 'system',  content: 'You are a fact-checking agent. Given a claim and evidence, return JSON: { verdict: "uphold"|"overturn", confidence: 0-1, reasoning: string }' },
    { role: 'user',    content: `Claim: ${entry.content}\n\nChallenge reason: ${challenge.reason}\n\nEvidence: ${challenge.evidence}` },
  ],
})
```
This verdict is stored on 0G Storage alongside the challenge, and surfaced to the human validator panel as an AI-assisted recommendation.

### 6.4 TEE verification
0G Compute runs models in TEEs (Trusted Execution Environments). Responses include a TEE signature that can be verified on-chain via `processResponse()`. For the challenge verification path, we verify the TEE signature before storing the verdict — this makes the AI-assisted verdict cryptographically attestable.

---

## 7. Storage Layer (0G)

### 6.1 What lives on 0G
| Artifact | Type | Description |
|---|---|---|
| Entry content | JSON blob | Full entry payload — content, tags, metadata, source |
| Entry iNFT | iNFT | On-chain token representing entry ownership |
| Challenge evidence | JSON blob | Challenger's evidence document |
| Validator reasoning | JSON blob | Validator's reasoning before casting vote |
| Query log | JSON blob | Full query + matched entries + fee breakdown |
| Training receipts | JSON blob | Cryptographic record of which entries trained which model |

### 6.2 Entry storage format
```json
{
  "id": "0xabc...",
  "content": "The Ethereum merge happened on September 15, 2022.",
  "domain": "factual",
  "tags": ["ethereum", "history", "consensus"],
  "sources": ["https://ethereum.org/..."],
  "submittedBy": "contributor.mnemosyne.eth",
  "submittedAt": 1714000000,
  "checksum": "0xdef..."
}
```

### 6.3 iNFT
Each active entry is minted as a 0G iNFT. The iNFT:
- Represents ownership of the entry's future royalties
- Can be transferred (royalties follow the token)
- Is burned when an entry is overturned

---

## 7. Identity Layer (ENS)

### 7.0 ENS as the Memory Address

**This is the key integration.** ENS names are not just human-readable identifiers — they are the **lookup keys for an agent's memory**.

Every entry ever submitted by `my-agent.eth` is indexed under that ENS name in 0G. The ENS text record `memory.index` points to a 0G manifest file listing all of that agent's active entries, their storage refs, domains, and timestamps.

This means:
- Any external agent can resolve `my-agent.eth` → read `memory.index` → pull the full verified memory of that agent from 0G
- A long-chain agent wanting persistent memory just needs an ENS name — Mnemosyne handles storage, verification, and royalties automatically
- You can pass an ENS name to the Query Agent to scope a query to one agent's memory only: *"what does `research-agent.eth` know about DeFi?"*
- Memory is portable: if you transfer the ENS name, the new owner inherits the memory index

**Memory lookup flow:**
```
External agent wants to load memory of "analyst.mnemosyne.eth"
    │
    ▼
Resolve ENS → read text record: memory.index = "0g://Qm..."
    │
    ▼
Fetch manifest from 0G → list of { entryId, storageRef, domain, status }
    │
    ▼
Filter by status = active → fetch entry blobs from 0G by storageRef
    │
    ▼
Inject into agent context as verified, staked memory
```

This works with any agent framework (LangChain, LlamaIndex, Claude, custom). The ENS name is the only thing an agent needs to share its memory with the world.

### 7.1 Namespace
All participants get ENS subnames under `mnemosyne.eth`:
- Contributors / agents: `<name>.mnemosyne.eth`
- Validators: `<name>.validators.mnemosyne.eth`

### 7.2 Text records per contributor
| Key | Value |
|---|---|
| `role` | `contributor` |
| `domain` | comma-separated domain list |
| `totalEntries` | count |
| `activeEntries` | count |
| `totalEarned` | ETH string |
| `submittedAt` | ISO date of first submission |

### 7.3 Text records per validator
| Key | Value |
|---|---|
| `role` | `validator` |
| `tier` | `bronze / silver / gold / expert` |
| `domains` | comma-separated |
| `accuracy` | percentage string e.g. `"82%"` |
| `totalVotes` | count |
| `totalEarned` | ETH string |

### 7.4 Additional text records per contributor/agent
| Key | Value |
|---|---|
| `memory.index` | 0G manifest ref — `0g://Qm...` — root pointer to all active entries |
| `memory.count` | total active entries in memory |
| `memory.domains` | comma-separated domains this agent has contributed to |
| `memory.updated` | ISO timestamp of last memory update |
| `payment.token` | preferred payout token symbol e.g. `ETH`, `USDC`, `DAI`, `WBTC` |
| `payment.address` | address to receive royalty payouts (defaults to ENS owner address) |

`memory.index` is the single field any external agent needs to bootstrap from another agent's memory. Resolve the ENS name, read `memory.index`, fetch the manifest from 0G — done.

`payment.token` is how contributors opt into receiving royalties in any token — Uniswap handles the conversion automatically at distribution time.

---

## 8. Payment Layer (Uniswap)

All fees enter the system as ETH. Contributors receive royalties in **any token they choose** — set via `payment.token` in their ENS text record. The Royalty Distributor reads each contributor's preferred token and routes the swap through Uniswap v3 before sending. Every royalty distribution potentially routes through Uniswap.

### 8.1 Payment flows

| Flow | From | To | Uniswap swap? | Trigger |
|---|---|---|---|---|
| Query fee → royalties | Querier (ETH) | Entry authors (any token) | Yes, if `payment.token` != ETH | Royalty Distributor keeper |
| Survival bonus | RoyaltyVault surplus (ETH) | Long-lived entry authors (any token) | Yes, if `payment.token` != ETH | Royalty Distributor keeper |
| Challenger slashed → contributor | Challenger stake (ETH) | Contributor (any token) | Yes, if `payment.token` != ETH | Challenge resolution |
| Contributor slashed → challenger | Contributor stake (ETH) | Challenger (any token) | Yes, if `payment.token` != ETH | Challenge resolution |
| Minority validators slashed → majority | Minority stakes (ETH) | Majority validators (any token) | Yes, if `payment.token` != ETH | Challenge resolution |

### 8.2 Royalty distribution flow

```
RoyaltyVault.distribute() called by keeper
    │
    ▼
For each contributor with claimable balance:
    │
    ├─ read payment.token from ENS text record
    │
    ├─ if payment.token == ETH ──────────────► transfer ETH directly
    │
    └─ if payment.token == USDC/DAI/etc ────► Uniswap v3 exactInputSingle
                                               ETH → payment.token
                                               transfer output token to payment.address
```

### 8.3 Uniswap integration points
- **Router**: `SwapRouter02` on the target chain
- **Pool**: ETH / payment.token 0.05% or 0.3% fee tier (auto-selected by best price)
- **Slippage**: 1% max, enforced in `RoyaltyVault.distribute()`
- **Fallback**: if swap fails (no liquidity), contributor receives ETH regardless

---

## 9. P2P Layer (Gensyn AXL)

Each agent runs on a separate AXL node. All coordination is P2P — no central broker.

### 9.1 Message types
| Message | From | To | Payload |
|---|---|---|---|
| `CHALLENGE_OPEN` | Challenger Agent | Validator network (broadcast) | challengeId, entryId, domain |
| `PANEL_INVITE` | ValidatorRegistry | Selected validators | challengeId, entry content ref |
| `VOTE_CAST` | Validator Agent | ChallengeManager | challengeId, choice, stake |
| `QUORUM_ESCALATE` | Quorum Enforcer | Validator network | challengeId, urgency |
| `QUERY_REQUEST` | External agent | Query Agent | queryText, fee, callbackAddress |
| `QUERY_RESPONSE` | Query Agent | External agent | matchedEntries, relevanceScores |
| `REPUTATION_UPDATE` | ENS Reputation Agent | Broadcast | validatorAddress, newTier |

### 9.2 Node assignment
| Node | Agent |
|---|---|
| node-0 | Contributor Agent |
| node-1 | Challenger Agent |
| node-2..N | Validator Agents (one per active validator) |
| node-N+1 | Query Agent |
| node-N+2 | ENS Reputation Agent |

---

## 10. System Parameters (Configurable)

| Parameter | Default | Description |
|---|---|---|
| `CHALLENGE_WINDOW_HOURS` | 48 | How long an entry is open to challenge after submission |
| `MIN_STAKE_ETH` | 0.005 | Minimum ETH to submit an entry |
| `CHALLENGER_MIN_STAKE_ETH` | 0.005 | Minimum ETH to open a challenge |
| `VALIDATOR_PANEL_SIZE` | 3 | Validators sampled per dispute |
| `QUORUM_THRESHOLD` | 0.67 | Fraction of panel needed for resolution |
| `QUORUM_DEADLINE_HOURS` | 12 | Time before Quorum Enforcer escalates |
| `STALE_AFTER_DAYS` | 30 | Days without query before entry goes stale |
| `GRACE_PERIOD_HOURS` | 24 | Time to re-activate stale entry before burn |
| `CONTEST_THRESHOLD` | 3 | Open challenges before entry is contested |
| `VALIDATOR_MIN_ACCURACY` | 0.60 | Below this → tier demotion |
| `ROYALTY_POOL_THRESHOLD_ETH` | 0.1 | Pool size before Royalty Distributor fires |
| `SURVIVAL_BONUS_DAYS` | 7 | Entry age before qualifying for survival bonus |

---

## 11. Folder Structure

```
mnemosyne/
├── packages/
│   ├── contracts/              # Solidity — Foundry
│   │   ├── src/
│   │   │   ├── MnemosyneRegistry.sol   # + ERC-7857 iNFT minting
│   │   │   ├── ChallengeManager.sol
│   │   │   ├── ValidatorRegistry.sol
│   │   │   ├── RoyaltyVault.sol
│   │   │   ├── StakeVault.sol
│   │   │   └── interfaces/
│   │   │       └── IERC7857.sol        # iNFT interface
│   │   ├── test/
│   │   └── foundry.toml
│   │
│   ├── compute/                # 0G Compute — inference + embeddings
│   │   └── src/
│   │       ├── client.ts       # OpenAI-compatible client pointed at 0G
│   │       ├── embed.ts        # embedding generation via Qwen
│   │       └── verify.ts       # LLM-assisted challenge verification
│   │
│   ├── keepers/                # KeeperHub keeper jobs
│   │   ├── challenge-watcher/
│   │   ├── staleness-reaper/
│   │   ├── royalty-distributor/
│   │   ├── quorum-enforcer/
│   │   ├── reputation-auditor/
│   │   └── entry-health-monitor/
│   │
│   ├── storage/                # 0G Storage SDK integration   ✅ built
│   ├── identity/               # ENS subname + text records
│   ├── payments/               # Uniswap v3 royalty routing
│   ├── p2p/                    # Gensyn AXL node setup
│   ├── api/                    # Query REST API — RAG over 0G
│   ├── example-agent/          # Demo agent using Mnemosyne as memory (0G prize Track 1)
│   └── frontend/               # Next.js dashboard
│
├── shared/
│   └── types/                  # Shared TypeScript types   ✅ built
│
├── SPEC.md
├── README.md
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

---

## 12. Build Order

| Phase | Package | Deliverable | Prize target |
|---|---|---|---|
| 1 | `shared/types` | All TypeScript types | — |
| 2 | `packages/storage` | 0G blob upload/download, manifest r/w | 0G Storage |
| 3 | `packages/compute` | 0G Compute client, embedding via Qwen, LLM challenge verifier | 0G Compute |
| 4 | `packages/contracts` | `StakeVault` + `MnemosyneRegistry` + ERC-7857 iNFT minting | 0G iNFT |
| 5 | `packages/contracts` | `ChallengeManager` + `ValidatorRegistry` | — |
| 6 | `packages/contracts` | `RoyaltyVault` | Uniswap |
| 7 | `packages/identity` | ENS subname registration, `memory.index` text record | ENS |
| 8 | `packages/payments` | Uniswap royalty routing with token swap | Uniswap |
| 9 | `packages/api` | Query REST endpoint — RAG over 0G entries | — |
| 10 | `packages/keepers` | All 6 KeeperHub jobs | KeeperHub |
| 11 | `packages/p2p` | Gensyn AXL — challenge broadcast + validator coordination | Gensyn |
| 12 | `packages/example-agent` | Research agent using Mnemosyne as persistent memory | 0G Track 1 |
| 13 | `packages/frontend` | Dashboard: knowledge base, dispute feed, leaderboard | — |

**Phases 1–2 complete. Next: Phase 3 — `packages/compute`.**
