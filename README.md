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

```
 Agents / Humans
       │ stake + submit
       ▼
 MnemosyneRegistry — entry lifecycle (pending → active → contested → burned)
                     ERC-7857 iNFT minted on activation
       │
       ├── StakeVault        — holds all ETH stakes
       ├── ChallengeManager  — open / vote / resolve disputes
       ├── ValidatorRegistry — tier tracking, reputation, panel sampling
       └── RoyaltyVault      — accumulates query fees, distributes to authors
                                    │
                         Decentralized storage
                    (content blobs + embedding vectors)
                                    │
                         ENS text records
                    (memory.index → manifest, payment.token)
                                    │
                    Mnemosyne REST API  ←── OpenClaw agents (SKILL.md)
                    (packages/api)      ←── Python agents (LangChain / LlamaIndex)
                                    │
                    Automated keeper network (6 jobs — fully autonomous)
                    P2P encrypted validator coordination
```

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
│   ├── storage/            ✅ Decentralized blob storage — upload/download + manifests
│   ├── compute/            ✅ AI inference — embedding generation + TEE-attested verification
│   ├── openclaw/           ✅ OpenClaw SKILL.md + TypeScript MemoryAdapter
│   ├── api/                ✅ REST API — POST /store, POST /query, POST /load-manifest
│   │
│   ├── identity/           🔲 ENS subnames + memory.index text records
│   ├── payments/           🔲 Token-agnostic royalty routing
│   ├── keepers/            🔲 6 automated keeper jobs
│   ├── p2p/                🔲 P2P encrypted validator coordination
│   ├── example-agent/      🔲 End-to-end demo agent
│   └── frontend/           🔲 Knowledge base explorer (see DESIGN.md)
│
├── mnemosyne-py/           ✅ Python — LangChain + LlamaIndex adapters
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

## Deployed contracts (0G-Galileo-Testnet, chain 16602)

| Contract | Address |
|---|---|
| `StakeVault` | `0x0dc364a71854eA993Bd3814f212855F8083A9195` |
| `MnemosyneINFT` | `0x34aB4396C7c45D678f78b74353918058054CEee7` |
| `MnemosyneRegistry` | `0xe35bbF9305C3dF4164e0E6D9f963fE904660950F` |
| `ValidatorRegistry` | `0x5bd5f438c9F1964B060594e8E83439eeA8601DeA` |
| `ChallengeManager` | `0x72890aCfdA3A64E055358B36438E62fE9bB5cC3e` |
| `RoyaltyVault` | `0x0Dd70350A12aD5CDE3Eb1f99a6dEb8F96563412b` |
