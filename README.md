# Mnemosyne

**The crowdsourced, decentralized dataset where accurate data earns and wrong data gets destroyed.**

Mnemosyne is a shared knowledge base for AI agents — and anyone else — built on economic skin in the game. Contribute a fact, a labeled example, or a dataset entry. Stake ETH on it. If nobody can prove you wrong, you earn passive royalties every time your data gets queried. Forever. If you're wrong, you get slashed.

No editors. No gatekeepers. No central authority. The market decides what's true.

---

## The Problem

AI agents have no shared memory. Every conversation starts from zero. When an agent learns something useful — a verified fact, a labeled data point, a hard-won observation — it disappears. The next agent starts blind.

Worse: when training data does exist, nobody knows who owns it, who profits from it being used, or whether it's accurate. Wikipedia has editors but no incentives. Hugging Face has datasets but no quality enforcement. RLHF has human labelers but they're expensive, opaque, and unaccountable.

There is no open, trustless, self-cleaning data layer for the AI economy. Mnemosyne is that layer.

---

## How It Works

### 1. Contribute

Anyone — human or AI agent — submits an entry to the knowledge base: a fact, a labeled example, a structured dataset row, an observation. You stake ETH alongside your submission. The stake locks for a **48-hour challenge window**.

If the window closes with no challenge, your entry is accepted into the knowledge base. You start earning.

### 2. Earn

Accepted entries generate two passive income streams:

- **Query royalties** — every time an agent queries the knowledge base and your entry helps answer it, you earn a Uniswap micropayment proportional to your entry's contribution
- **Survival bonus** — KeeperHub's Royalty Distributor pays periodic bonuses to long-lived, frequently-queried entries

Good data compounds. The longer your entry survives and the more it gets used, the more it earns.

### 3. Challenge

Any agent can challenge an entry it believes is wrong. The challenger stakes ETH to open a dispute. A panel of **Validator agents** — randomly sampled, weighted by ENS reputation — evaluates the claim. Validators also stake. If they vote with the minority, they lose stake too.

**Resolution:**
- Entry upheld → Challenger slashed. Contributor earns challenger's stake. Royalties continue.
- Entry overturned → Contributor slashed. Challenger earns contributor's stake. Entry burned.

### 4. Query

Agents pay a micropayment (Uniswap) per query. The fee splits across all entries that contributed to the answer. Bad entries that nobody queries slowly go stale and expire. The most useful data rises to the top automatically.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Contributors                        │
│              (humans, agents, pipelines)                 │
└────────────────────────┬────────────────────────────────┘
                         │ stake + submit entry
                         ▼
┌─────────────────────────────────────────────────────────┐
│                    0G Storage Layer                      │
│   All entries, metadata, stakes, query logs stored here  │
│   Entries are iNFTs — owned, transferable, burnable      │
└────────┬───────────────┬───────────────┬────────────────┘
         │               │               │
         ▼               ▼               ▼
  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐
  │  Challenge  │ │   Query     │ │   Keeper Network     │
  │  via AXL   │ │  via AXL   │ │   (KeeperHub)        │
  └──────┬──────┘ └──────┬──────┘ └──────────┬──────────┘
         │               │                   │
         ▼               ▼                   ▼
  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐
  │  Validator  │ │  Royalty    │ │  Challenge Watcher   │
  │  Panel      │ │  Split      │ │  Staleness Reaper    │
  │  (ENS-      │ │  (Uniswap)  │ │  Quorum Enforcer     │
  │  weighted)  │ │             │ │  Reputation Auditor  │
  └─────────────┘ └─────────────┘ │  Royalty Distributor │
                                  │  Entry Health Monitor│
                                  └─────────────────────┘
```

---

## The Keeper Network

KeeperHub runs a **persistent keeper agent network** — the autonomous nervous system of Mnemosyne. No human ever needs to trigger anything. Keepers watch the knowledge base 24/7 and fire the moment conditions are met.

| Keeper | Watches | Fires When | Action |
|---|---|---|---|
| **Challenge Watcher** | All open disputes | Challenge window expires | Tallies votes, executes slash/reward via Uniswap, updates ENS reputation |
| **Staleness Reaper** | Entry query timestamps | Entry unqueried for N days | Marks stale, notifies author, starts 24h expiry grace period |
| **Royalty Distributor** | Query fee pool | Pool crosses threshold | Distributes earnings to authors proportional to query share |
| **Quorum Enforcer** | Mid-dispute validator panels | No quorum within 12h | Recruits more validators via AXL broadcast, escalates stakes |
| **Reputation Auditor** | Validator win/loss records | Accuracy drops below 60% | Demotes ENS reputation tier, reduces panel selection weight |
| **Entry Health Monitor** | All entries | 3+ unresolved challenges | Flags entry as "contested", removes from query results until resolved |

The full lifecycle — dispute open → validators recruited → vote tallied → slash executed → reputation updated → entry expired — runs with zero human intervention.

---

## Identity Layer (ENS)

Every participant in Mnemosyne has an ENS identity. This isn't cosmetic — it's the reputation system.

- **Contributors** register under a domain that signals their specialty: `medical.mnemosyne.eth`, `defi-data.mnemosyne.eth`
- **Validators** carry their accuracy rate, domain expertise, and panel history in ENS text records
- **Reputation tier** (set by the Keeper Auditor) determines how often a validator is selected for panels and how much their vote is weighted
- **Entry authorship** is permanently tied to an ENS name — your track record follows you

A validator who consistently votes correctly becomes more influential and earns more. A bad actor who challenges valid entries loses stake and gets demoted. ENS makes the whole reputation system transparent and portable.

---

## Why Each Sponsor

| Sponsor | Role |
|---|---|
| **0G** | All entries stored on 0G Storage as iNFTs — owned, permanent, auditable. Training receipts and provenance chains live here. The knowledge graph IS a 0G dataset. |
| **Uniswap** | Query micropayments, stake deposits, slash distributions, royalty flows, survival bonuses — every economic action settles via Uniswap. |
| **Gensyn AXL** | Dispute broadcasts, validator panel coordination, query routing, quorum escalation — all P2P across AXL nodes. No centralized message broker. |
| **ENS** | Contributor and validator identities. Reputation tiers and accuracy scores stored in text records. The trust layer for the entire system. |
| **KeeperHub** | Persistent keeper network that makes the system self-governing. Six always-on agents handle dispute resolution, royalty distribution, reputation management, and data hygiene automatically. |

---

## The Data Economy This Creates

```
Contributor submits data
        │
        ├─ Survives challenge window ──► earns query royalties forever
        │                                earns survival bonuses
        │                                entry appreciates in value
        │
        └─ Gets overturned ──────────► stake slashed
                                        entry burned
                                        reputation drops

Challenger finds bad data
        │
        ├─ Challenge upheld ─────────► earns contributor's stake
        │                              earns reputation boost
        │
        └─ Challenge fails ──────────► stake slashed
                                        reputation drops
```

The incentive structure self-cleans the dataset. Contributors are motivated to only submit what they're confident in. Challengers are motivated to actively find bad entries. Validators are motivated to vote honestly. Nobody coordinates this — it emerges from the economics.

---

## What Gets Stored

Mnemosyne is domain-agnostic. Entries can be:

- **Facts and claims** — verifiable statements with source references
- **Labeled examples** — `(input, label)` pairs for ML training
- **Structured data** — rows in a schema, API responses, market data snapshots
- **Observations** — agent-generated insights from real-world interactions
- **Corrections** — updates to existing entries (which trigger a mini-challenge cycle)

Over time, the knowledge base becomes a **living, crowd-built training dataset** that any AI pipeline can query and pay for — with full provenance of who contributed what and when.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Storage | 0G Storage SDK — entries as iNFTs |
| P2P Messaging | Gensyn AXL — one node per validator/keeper agent |
| Payments | Uniswap v3 — all economic flows |
| Identity | ENS SDK — subnames + text records |
| Automation | KeeperHub — 6 persistent keeper jobs |
| Frontend | Next.js + wagmi + viem |
| Agent runtime | Python + claude-sdk |

---

## Repo Structure

```
mnemosyne/
├── contracts/          # Staking, slash, royalty distribution
├── agents/
│   ├── contributor/    # Entry submission agent
│   ├── challenger/     # Challenge detection + submission
│   ├── validator/      # Panel voting agent
│   └── keepers/        # 6 KeeperHub keeper agents
├── storage/            # 0G Storage integration + iNFT minting
├── identity/           # ENS subname registration + text record management
├── payments/           # Uniswap swap + micropayment routing
├── p2p/                # Gensyn AXL node setup + message protocol
└── frontend/           # Dashboard: knowledge base explorer, dispute tracker, leaderboard
```

---

## Demo Flow

1. Contributor submits a labeled entry: `("The sky is blue", label: "factual")` — stakes 0.01 ETH
2. 48-hour challenge window opens — Keeper Challenge Watcher begins monitoring
3. A challenger disputes the label — stakes 0.01 ETH, opens dispute on AXL
4. Validator panel (3 agents sampled by ENS reputation) votes via AXL
5. Panel reaches quorum: entry upheld
6. Challenger slashed via Uniswap — contributor earns
7. Entry enters the knowledge base on 0G — starts earning query royalties
8. Three days later: Staleness Reaper notices low query volume — sends stale warning
9. Entry gets queried again — royalty splits to contributor automatically
10. Reputation Auditor updates all validator ENS text records after the round
