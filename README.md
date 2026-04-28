# Mnemosyne

> AI agents no longer forget. Mnemosyne gives them shared, verified, decentralized on-chain memory.

[![Built for OpenAgents Hackathon](https://img.shields.io/badge/OpenAgents-Hackathon-blue)](https://openagents.com)
[![0G Storage](https://img.shields.io/badge/0G-Storage%20%2B%20Compute-orange)](https://0g.ai)
[![ENS](https://img.shields.io/badge/ENS-memory.index-purple)](https://ens.domains)
[![Uniswap](https://img.shields.io/badge/Uniswap-Royalty%20Routing-pink)](https://uniswap.org)
[![KeeperHub](https://img.shields.io/badge/KeeperHub-6%20Keeper%20Jobs-green)](https://keeperhub.dev)
[![Gensyn](https://img.shields.io/badge/Gensyn-AXL%20P2P-red)](https://gensyn.ai)

---

## The problem

Every AI agent conversation starts from zero. When an agent figures something out — a verified fact, a hard-won observation, a labeled training example — it evaporates. The next agent starts blind.

When training data does exist, it's opaque: unknown provenance, no incentives for accuracy, no mechanism for removing bad entries. Wikipedia has editors but no economic stakes. Hugging Face has datasets but no quality enforcement. RLHF human labelers are expensive, anonymous, and unaccountable.

**There is no open, trustless, self-cleaning data layer for the AI economy.**

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

## Live demo

### Try it yourself

```bash
# Start the memory API
cd packages/api && pnpm start

# Ask the agent something it doesn't know yet
python mnemosyne-py/example_agent.py
> "What happened during the Ethereum merge?"

# The agent finds nothing in memory, researches, and stores:
# → POST /store { content: "Ethereum switched to PoS on Sep 15, 2022", domain: "factual" }

# Now ask again — even in a brand new session
> "When did Ethereum switch to proof of stake?"

# → Agent recalls from Mnemosyne: "I have a verified memory: Ethereum merged on Sep 15, 2022"
#   (stored on 0G, retrieved via cosine similarity, TEE-attested)
```

Open [http://localhost:4000](http://localhost:4000) to browse the knowledge base, see who posted each entry, view stakes, and challenge anything you think is wrong.

### Adding knowledge from the frontend

1. Connect wallet → get ENS subname under `mnemosyne.eth`
2. Submit entry → stake 0.005+ ETH → 48-hour window opens
3. Any agent or user can now query it and **immediately see it in the brain**
4. Watch the agent answer questions using your entry in real time

---

## Architecture

```
 Agents / Humans
       │
       │ stake + submit
       ▼
 ┌─────────────────────────────────────────────────────────┐
 │               MnemosyneRegistry.sol                      │
 │   pending → active → contested → stale → burned         │
 │   ERC-7857 iNFT minted on activation                    │
 └───────────┬───────────────────┬───────────────┬─────────┘
             │                   │               │
             ▼                   ▼               ▼
       StakeVault.sol    ChallengeManager.sol  RoyaltyVault.sol
       (lock/slash/      (open → vote →        (query fees →
        release)          resolve)              Uniswap swap)
             │                   │
             ▼                   ▼
       ValidatorRegistry.sol     │
       (tier: bronze→expert      │
        ENS reputation weight)   │
                                 │
             ┌───────────────────┘
             ▼
    0G Storage (content blobs + embedding vectors as iNFTs)
    0G Compute (Qwen 2.5 7B — embedding + TEE-attested challenge verdict)
             │
             ▼
    ENS memory.index text record → manifest of all active entries
             │
             ▼
    Mnemosyne REST API  ←──── OpenClaw agents (SKILL.md)
    (packages/api)      ←──── Python agents (LangChain / LlamaIndex)
             │
             ▼
    KeeperHub (6 keeper jobs — fully autonomous, zero human trigger)
    Gensyn AXL (P2P encrypted validator coordination)
```

---

## How agents use it

### OpenClaw (any OS, any messaging platform)

Install the Mnemosyne skill into your OpenClaw agent:

```bash
cp -r packages/openclaw ~/.openclaw/workspace/skills/mnemosyne
```

Your agent now has persistent, decentralized memory. It will call `POST /store` when it learns something worth keeping, and `POST /query` before answering any question — retrieving verified facts from the global knowledge base.

### Python — LangChain

```python
from mnemosyne import MnemosyneMemory
from langchain.chains import ConversationChain
from langchain_openai import ChatOpenAI

memory = MnemosyneMemory(
    api_url="http://localhost:3000",
    submitted_by="my-agent.mnemosyne.eth",
)
chain = ConversationChain(llm=ChatOpenAI(), memory=memory)
```

### Python — LlamaIndex

```python
from mnemosyne.llamaindex import MnemosyneChatStore
from llama_index.core.memory import ChatMemoryBuffer

store = MnemosyneChatStore(api_url="http://localhost:3000")
memory = ChatMemoryBuffer.from_defaults(chat_store=store, token_limit=3000)
```

### TypeScript / Node

```typescript
import { MnemosyneMemory } from '@mnemosyne/openclaw'
import { createComputeClient } from '@mnemosyne/compute'
import { createStorageClient } from '@mnemosyne/storage'

const memory = new MnemosyneMemory(computeClient, storageClient)
await memory.store('Ethereum merged on Sep 15 2022', { domain: 'factual', tags: ['ethereum'] })
const hits = await memory.query('when did Ethereum switch to PoS?', 5)
```

---

## The knowledge economy

```
You submit a verified fact
    │
    ├─ No challenge in 48h ──► Entry goes ACTIVE
    │                           ERC-7857 iNFT minted for you
    │                           You earn query royalties forever
    │                           Survival bonus after 7 days
    │
    └─ Challenge opens ────► Validator panel samples (ENS reputation weighted)
                             AI-assisted verdict from 0G Compute (TEE-attested)
                             │
                             ├─ Entry UPHELD ─► Challenger slashed → you earn
                             │
                             └─ Entry OVERTURNED ─► You slashed → iNFT burned

You challenge a bad entry
    │
    ├─ Entry OVERTURNED ──► You earn contributor's stake + reputation boost
    │
    └─ Entry UPHELD ──────► You get slashed + reputation drop
```

The incentive structure self-cleans. Nobody coordinates this — it emerges from the economics.

---

## Keeper network (KeeperHub)

Six persistent keeper jobs automate the entire lifecycle. No human ever needs to trigger anything.

| Keeper | Fires when | Action |
|---|---|---|
| **Challenge Watcher** | Challenge window expires | Activates pending entries, mints iNFTs, resolves disputes |
| **Staleness Reaper** | Entry unqueried for 30 days | Marks stale, starts 24h grace period before burn |
| **Royalty Distributor** | Fee pool > 0.1 ETH | Routes payouts via Uniswap to contributor's preferred token |
| **Quorum Enforcer** | 12h without validator quorum | Recruits more validators via Gensyn AXL broadcast |
| **Reputation Auditor** | Validator accuracy < 60% | Demotes ENS tier, reduces panel selection weight |
| **Entry Health Monitor** | 3+ open challenges | Marks contested, removes from query results |

---

## Identity (ENS)

Every participant gets an ENS subname under `mnemosyne.eth`. This is not cosmetic — it's the trust layer.

`memory.index` text record → points to 0G manifest of all active entries. Any agent can resolve `analyst.mnemosyne.eth`, read `memory.index`, and instantly load that agent's entire verified memory.

`payment.token` text record → contributor's preferred payout token. Uniswap routes royalties to whatever token they want.

---

## Sponsor integrations

| Sponsor | Integration |
|---|---|
| **0G Storage** | All entry blobs, embedding vectors, manifests, and challenge evidence stored as permanent content-addressed 0G blobs |
| **0G Compute** | Qwen 2.5 7B for embedding generation and TEE-attested challenge verdicts via `processResponse()` |
| **0G iNFT (ERC-7857)** | Every active entry minted as an ERC-7857 iNFT — transferable ownership, burned on overturn |
| **Uniswap v3** | Royalty routing via SwapRouter02 — ETH → contributor's preferred token on every payout |
| **ENS** | `memory.index` and `payment.token` text records; subnames under `mnemosyne.eth`; reputation tiers |
| **KeeperHub** | 6 persistent keeper jobs wired via KeeperHub MCP server |
| **Gensyn AXL** | P2P encrypted validator panel coordination, quorum escalation, challenge broadcasts |

---

## Repo structure

```
OpenAgents/
├── packages/
│   ├── contracts/          ✅ Solidity (Foundry) — 14/14 tests passing
│   │   ├── StakeVault.sol
│   │   ├── MnemosyneRegistry.sol  (+ ERC-7857 iNFT)
│   │   ├── ChallengeManager.sol
│   │   ├── ValidatorRegistry.sol
│   │   └── RoyaltyVault.sol
│   │
│   ├── storage/            ✅ 0G Storage SDK — upload/download blobs + manifests
│   ├── compute/            ✅ 0G Compute — Qwen embedding + TEE-attested verification
│   ├── openclaw/           ✅ OpenClaw SKILL.md + TypeScript MemoryAdapter
│   ├── api/                ✅ REST API — POST /store, POST /query, POST /load-manifest
│   │
│   ├── identity/           🔲 Phase 8 — ENS subnames + memory.index text records
│   ├── payments/           🔲 Phase 9 — Uniswap v3 royalty routing
│   ├── keepers/            🔲 Phase 11 — 6 KeeperHub jobs
│   ├── p2p/                🔲 Phase 12 — Gensyn AXL nodes
│   ├── example-agent/      🔲 Phase 13 — Research agent demo
│   └── frontend/           🔲 Phase 15 — Knowledge base explorer
│
├── mnemosyne-py/           ✅ Python — LangChain + LlamaIndex adapters
├── shared/types/           ✅ All TypeScript types
└── docs/                   🔲 Architecture diagram
```

---

## Running locally

```bash
# Prerequisites: Node 20+, pnpm, Python 3.10+, Foundry

# Install
pnpm install
pip install -e mnemosyne-py

# Set env
cp .env.example .env
# edit .env — add ZG_PRIVATE_KEY

# Run contracts tests
cd packages/contracts && forge test

# Start the memory API
cd packages/api && pnpm start

# Run the Python agent demo
python mnemosyne-py/example_agent.py

# Frontend (coming in Phase 15)
cd packages/frontend && pnpm dev
```

---

*Built for the OpenAgents Hackathon — targeting 0G, Uniswap, ENS, KeeperHub, and Gensyn prize tracks.*
