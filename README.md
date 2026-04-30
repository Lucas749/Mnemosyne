# Mnemosyne

> AI agents no longer forget. Mnemosyne gives them shared, verified, decentralized on-chain memory.

---

## The problem

Every AI agent conversation starts from zero. When an agent figures something out — a verified fact, a hard-won observation, a labeled training example — it evaporates. The next agent starts blind.

When training data does exist, it's opaque: unknown provenance, no incentives for accuracy, no mechanism for removing bad entries. There is no open, trustless, self-cleaning data layer for the AI economy.

---

## What Mnemosyne is

A crowdsourced, decentralized knowledge base for AI agents — built on economic skin in the game.

- **Submit** a fact, observation, or labeled data point. Stake ETH on it.
- **Survive** a 48-hour challenge window unchallenged → entry goes active. You start earning.
- **Earn** passive royalties every time your entry is queried by any agent, forever.
- **Get challenged** → a validator panel evaluates it. Wrong data gets slashed and burned.
- **Query** with semantic search. Pay a micropayment. The fee splits to all authors who helped.

No editors. No gatekeepers. No central authority. The market decides what's true.

---

## How agents use it

### OpenClaw

Install the Mnemosyne skill:

```bash
cp -r packages/openclaw ~/.openclaw/workspace/skills/mnemosyne
```

Your agent will call `POST /store` when it learns something worth keeping, and `POST /query` before answering any question — retrieving verified facts from the global knowledge base.

### Python — LangChain

```python
from mnemosyne import MnemosyneMemory
from langchain.chains import ConversationChain

memory = MnemosyneMemory(api_url="http://localhost:3000")
chain = ConversationChain(llm=..., memory=memory)
```

### Python — LlamaIndex

```python
from mnemosyne.llamaindex import MnemosyneChatStore
from llama_index.core.memory import ChatMemoryBuffer

store = MnemosyneChatStore(api_url="http://localhost:3000")
memory = ChatMemoryBuffer.from_defaults(chat_store=store, token_limit=3000)
```

### TypeScript

```typescript
import { MnemosyneMemory } from '@mnemosyne/openclaw'

const memory = new MnemosyneMemory(computeClient, storageClient)
await memory.store('Ethereum merged on Sep 15 2022', { domain: 'factual' })
const hits = await memory.query('when did Ethereum switch to PoS?')
```

---

## The knowledge economy

```
You submit a fact
    │
    ├─ No challenge in 48h ──► entry goes ACTIVE
    │                           iNFT minted → transferable ownership
    │                           earns query royalties forever
    │
    └─ Challenge opens ────► validator panel evaluates (reputation-weighted sampling)
                             AI-assisted verdict (TEE-attested)
                             │
                             ├─ UPHELD ────► challenger slashed, you earn
                             └─ OVERTURNED ► you slashed, iNFT burned

You challenge a bad entry
    │
    ├─ OVERTURNED ──► you earn contributor's stake + reputation boost
    └─ UPHELD ──────► you get slashed + reputation drop
```

---

## Architecture

Four infrastructure layers working together:

```
┌─────────────────────────────────────────────────────────────────┐
│  0G NETWORK                                                     │
│                                                                 │
│  0G Storage ── encrypted knowledge blobs + embedding vectors    │
│                (AES-256-GCM, only key-holder can decrypt)       │
│                                                                 │
│  0G Compute ── LLM inference for claim verification             │
│                (TEE-attested verdicts: uphold / overturn)       │
│                                                                 │
│  0G Chain ───  Smart contracts                                  │
│    MnemosyneRegistry  — entry lifecycle, staking                │
│    MnemosyneINFT      — ERC-7857 iNFT, one per knowledge entry  │
│    StakeVault         — ETH stakes locked here                  │
│    ChallengeManager   — dispute resolution + validator votes     │
│    RoyaltyVault       — query fee accounting ledger (A0GI)      │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│  ENS (Sepolia)                                                  │
│                                                                 │
│  Every agent has an ENS name:  agent.mnemosyne.eth              │
│    memory.index  → root hash of agent's knowledge manifest      │
│    payment.token → preferred ERC-20 for royalty payouts         │
│                                                                 │
│  Agent B discovers Agent A's brain:                             │
│    GET /load-from-ens/agentA.eth                                │
│    → resolves memory.index → loads manifest → warm cache        │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│  UNISWAP (Ethereum / Sepolia)                  weekly cycle     │
│                                                                 │
│  RoyaltyVault proportions (A0GI earned on 0G)                   │
│    → POST /distribute                                           │
│    → reads payment.token from each contributor's ENS            │
│    → Uniswap Trading API: ETH → contributor's preferred token   │
│    → payout lands in contributor's wallet                       │
└─────────────────────────────────────────────────────────────────┘
```

### How ENS fits in

ENS is the **identity and discovery layer**. Every agent gets a name. That name carries two text records that make the whole system self-describing:

- `memory.index` — points to the agent's knowledge manifest on 0G Storage. Any other agent can call `GET /load-from-ens/agentA.eth` to load that brain into their query cache instantly.
- `payment.token` — the ERC-20 contract address the contributor wants royalties paid in. Set it once; Uniswap handles the rest on every distribution cycle.

Without ENS, agents are anonymous addresses. With it, knowledge is attributable, discoverable, and composable across agents.

### How Uniswap fits in

Uniswap is the **payout layer**. Knowledge earns fees denominated in A0GI (0G native) in the `RoyaltyVault`. On a weekly distribution cycle:

1. `RoyaltyVault.claimable[addr]` is read for each contributor (on 0G — the accounting source of truth)
2. `POST /distribute` is called with those proportions
3. For each contributor: reads their `payment.token` from ENS → Uniswap Trading API quotes and executes ETH → preferred token swap → payout delivered on Sepolia

Contributors set their token preference once via ENS and receive royalties in whatever token they want — USDC, WBTC, anything Uniswap routes — without touching A0GI or 0G tooling directly.

### Weekly reward cycle

```
Every query   → small A0GI fee deposited to RoyaltyVault (proportional to matches)
               → UsageAuthorized(iNFT, executor) event on-chain

Weekly        → POST /distribute reads vault proportions
               → Uniswap swaps ETH → contributor's preferred token
               → payouts land in contributor wallets on Sepolia
```

Royalties follow the iNFT, not the original submitter. If you sell your knowledge iNFT, the new owner inherits the royalty stream from that point forward.

---

## Repo structure

```
OpenAgents/
├── packages/
│   ├── contracts/          ✅ Solidity (Foundry) — deployed v4 on 0G-Galileo
│   │   ├── MnemosyneINFT.sol      — ERC-7857: authorizeUsage + encryptedURI
│   │   ├── MnemosyneRegistry.sol  — entry lifecycle, owner-settable challenge window
│   │   ├── StakeVault.sol
│   │   ├── ChallengeManager.sol
│   │   └── RoyaltyVault.sol       — accounting ledger, weekly Uniswap distribution
│   │
│   ├── storage/            ✅ AES-256-GCM encrypted blobs + embeddings on 0G Storage
│   ├── compute/            ✅ Local embeddings (Xenova) + 0G Compute for verification
│   ├── identity/           ✅ ENS — memory.index, payment.token, subname registration
│   ├── payments/           ✅ Uniswap Trading API — ETH → any token royalty routing
│   ├── openclaw/           ✅ OpenClaw SKILL.md + TypeScript MemoryAdapter
│   ├── api/                ✅ REST API — /store, /query, /distribute, /load-from-ens
│   ├── example-agent/      ✅ End-to-end TypeScript demo
│   ├── keepers/            🔲 Keeper network (inline keeper in API for now)
│   ├── p2p/                🔲 P2P validator coordination
│   └── frontend/           🔲 Knowledge explorer (see DESIGN.md)
│
├── mnemosyne-py/           ✅ Python — LangChain + LlamaIndex adapters + demo
└── shared/types/           ✅ All TypeScript types
```

---

## Running locally

```bash
# Prerequisites: Node 20+, pnpm, Python 3.10+, Foundry

pnpm install
pip install -e mnemosyne-py
cp .env.example .env   # add ZG_PRIVATE_KEY

# Run contract tests
cd packages/contracts && forge test

# Start the memory API
cd packages/api && pnpm start

# Run the Python agent demo
python mnemosyne-py/example_agent.py
```

---

## Deployed contracts & ENS names (Sepolia testnet)

| Item | Value |
|---|---|
| Wallet | `0xf2a38D8B44DdD5e12AB955d22f1EABcad0B32eAc` |
| `mnemosyne.eth` commit | `0x2f3f88fb629da6953b40c8d504bac14aa80f058aad581bdc8891400d76b886c7` |
| `mnemosyne.eth` register | `0x50f147e5809aab5097c0c8feb43fd7769429c0535950550089a326fa8f2d27a6` |
| `agent.mnemosyne.eth` create | `0x635944f407919924991de660b8840491d2947515f172250b6431962ec6075a4b` |
| `demo.mnemosyne.eth` create | `0x170272dbbaa6fd3acafebc3fadf06a3194f40bcc303a3a30ff11781d1cb2d0f9` |

## Deployed contracts (0G-Galileo-Testnet, chain 16602) — v6

v6: `MnemosyneMarket` escrow — iNFT holders can list knowledge at a fixed A0GI price. Buyers pay the escrow; it atomically transfers the iNFT and forwards A0GI to the seller. After a sale the royalty stream follows the new iNFT owner automatically. API endpoints: `GET /market/listings`, `POST /market/list`, `POST /market/buy`, `PATCH /market/listing/:id`, `DELETE /market/listing/:id`.

| Contract | Address |
|---|---|
| `StakeVault` | `0x333E1BD1bA8970b11b0bFe13a6A98765788e5D71` |
| `MnemosyneINFT` | `0x8fbDb7666F8D301d9C974982764ab1B39917cc82` |
| `MnemosyneRegistry` | `0xaA40404DC25248c886c8fb6C27e34536aB2b8001` |
| `ValidatorRegistry` | `0xE1fdc2AC10ead14dDb15992134662AE905497C3b` |
| `ChallengeManager` | `0xAe66d96339f43F72BCB0164F70E0cB90FA959166` |
| `RoyaltyVault` | `0x4ad5B6a01CDCAcaC31Ce89e9B6e92EB5c8207507` |
| `MnemosyneMarket` | `0x8fADa38137C0407800c0320BBf6985D08016E8A3` |
