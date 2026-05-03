#!/usr/bin/env node
/**
 * Mnemosyne Demo Seed Script
 * Submits 10 knowledge entries to the live API for demo day.
 * Usage: node scripts/seed-demo.mjs
 * Requires Node 18+ (built-in fetch)
 */

const API = 'https://mnemosyne-api-production-7cd6.up.railway.app'
const SUBMITTER = 'mnemosyne.eth'
const POLL_INTERVAL_MS = 3000
const JOB_TIMEOUT_MS = 300_000

// ─── Demo entries ──────────────────────────────────────────────────────────────

const ENTRIES = [
  {
    domain: 'factual',
    tags: ['0G', 'BLOCKCHAIN', 'ARCHITECTURE', 'STORAGE'],
    content: `# 0G Blockchain Architecture

0G (Zero Gravity) is a modular blockchain network designed for high-throughput decentralized AI applications. It separates compute, storage, and consensus into independent layers.

## Core Components

- **0G Chain** — An EVM-compatible execution layer (Galileo testnet, chain ID 16602) based on Cosmos SDK with Tendermint BFT consensus
- **0G Storage** — A decentralized key-value storage network optimized for large blobs (embeddings, model weights, datasets). Files are addressed by content hash (Merkle root)
- **0G DA** — A data availability layer using erasure coding and KZG polynomial commitments to guarantee data retrievability

## Key Properties

| Property | Value |
|----------|-------|
| Block time | ~2s |
| Finality | Single-slot |
| Storage pricing | Per-byte, paid in A0GI |
| Max blob size | 256 MB |

## Why it matters for AI

Traditional blockchains cannot store the vector embeddings or model outputs needed for on-chain AI. 0G Storage solves this by providing verifiable, decentralized storage that smart contracts can reference via content hash (storageRef).

The Mnemosyne Protocol uses 0G Storage to store encrypted knowledge entries and their embeddings, while the 0G Chain holds the registry of ownership, stakes, and queries.`,
  },

  {
    domain: 'factual',
    tags: ['ERC7857', 'INFT', 'NFT', 'STANDARD', 'TOKENIZATION'],
    content: `# ERC-7857: The Intelligent NFT Standard

ERC-7857 defines a token standard for **Intelligent NFTs (iNFTs)** — NFTs that represent ownership of AI-queryable knowledge, with built-in royalty mechanics and access control.

## Core Concept

Unlike ERC-721 (static media) or ERC-1155 (fungible/semi-fungible assets), an iNFT wraps:
1. A reference to encrypted content stored on decentralized storage (e.g. 0G Storage)
2. A semantic embedding for similarity search
3. A royalty stream that pays the owner each time the content is queried

## Key Functions

\`\`\`solidity
interface IINFT {
  // Retrieve the encrypted content URI (decryption key gated by payment)
  function getEncryptedURI(uint256 tokenId) external view returns (string memory);

  // Check current royalty per query in wei
  function royaltyPerQuery(uint256 tokenId) external view returns (uint256);

  // Called by the protocol when a query is served
  function recordQuery(uint256 tokenId, address queriedBy) external;
}
\`\`\`

## Royalty Flow

\`\`\`
AI Agent queries knowledge
  → Protocol charges query fee (0.001 A0GI)
  → 90% goes to iNFT owner (via RoyaltyVault)
  → 10% goes to protocol treasury
  → Owner can claim accumulated royalties any time
\`\`\`

## Why Transfer = Transfer of Income

Selling an iNFT sells the royalty stream. If an entry has served 10,000 queries, the buyer is acquiring proven demand — not speculating on future attention.`,
  },

  {
    domain: 'factual',
    tags: ['ZK', 'CRYPTOGRAPHY', 'PROOF', 'PRIVACY', 'BLOCKCHAIN'],
    content: `# Zero-Knowledge Proofs: Practical Applications

A zero-knowledge proof (ZKP) allows one party (the prover) to convince another (the verifier) that a statement is true without revealing any information beyond the truth of the statement itself.

## Core Types

### zk-SNARKs
- **Succinct**: proof size is constant (~200 bytes) regardless of computation size
- **Non-interactive**: single message from prover to verifier
- **Requires trusted setup** (ceremony)
- Used by: Zcash, Aztec, Tornado Cash

### zk-STARKs
- **Scalable**: proof generation scales quasi-linearly
- **Transparent**: no trusted setup required
- Larger proofs (~100KB) but quantum-resistant
- Used by: StarkNet, Polygon Miden

## Blockchain Use Cases

| Use Case | What's Proven | What's Hidden |
|----------|---------------|---------------|
| Private payments | Valid transaction | Sender, receiver, amount |
| Identity verification | "I am over 18" | Actual birthdate |
| Rollup validity | State transition is correct | Individual transactions |
| ML model inference | Model ran correctly | Model weights |

## Relevance to Knowledge Protocols

ZKPs can prove that a knowledge entry was correctly retrieved and the querier paid the royalty — without revealing *what* was queried. This enables private AI agent queries over public knowledge graphs.`,
  },

  {
    domain: 'structured_data',
    tags: ['TOKENOMICS', '0G', 'ECONOMICS', 'STAKING'],
    content: `# 0G Token Economics

Structured overview of the A0GI token and its role in the Mnemosyne Knowledge Protocol.

## Token: A0GI

| Field | Value |
|-------|-------|
| Name | 0G Token |
| Symbol | A0GI |
| Chain | 0G-Galileo (testnet) |
| Decimals | 18 |
| Type | Native gas token |

## Mnemosyne Protocol Fees

| Action | Cost | Recipient |
|--------|------|-----------|
| Submit entry (stake) | 0.005 A0GI | StakeVault (locked) |
| Query entry | 0.001 A0GI | 90% iNFT owner, 10% treasury |
| Open challenge | 0.005 A0GI | ChallengeManager (at risk) |
| Challenge upheld | Challenger loses stake | → Submitter |
| Challenge overturned | Submitter loses stake | → Challenger |

## Staking Mechanics

\`\`\`
Entry submitted
  └─ 0.005 A0GI locked in StakeVault
       ├─ If challenged and overturned → slashed → challenger
       ├─ If challenge window passes → stake remains locked
       └─ If entry burned → stake destroyed
\`\`\`

## Royalty Accumulation

- All query fees accumulate in RoyaltyVault per iNFT owner address
- Claimable any time via \`RoyaltyVault.claim()\`
- No expiry on unclaimed royalties
- When iNFT is sold: new owner receives future royalties; past unclaimed royalties stay with previous owner`,
  },

  {
    domain: 'labeled_example',
    tags: ['LANGCHAIN', 'AI', 'MEMORY', 'PYTHON', 'AGENT'],
    content: `# Building an AI Agent with Mnemosyne Memory (Python + LangChain)

This example shows how to give a LangChain agent access to the Mnemosyne knowledge graph.

## Installation

\`\`\`bash
pip install mnemosyne-py langchain openai
\`\`\`

## Basic Setup

\`\`\`python
from mnemosyne.langchain import MnemosyneMemory, MnemosyneQueryTool, MnemosyneStoreTool
from langchain.agents import initialize_agent, AgentType
from langchain.chat_models import ChatOpenAI

# Initialize memory client
memory = MnemosyneMemory(
    api_url="https://mnemosyne-api-production-7cd6.up.railway.app",
    private_key="0x...",  # for royalty payments
    agent_ens="myagent.eth",  # optional, for identity
)

# Create tools
tools = [
    MnemosyneQueryTool(memory),   # POST /query — semantic search
    MnemosyneStoreTool(memory),   # POST /store — publish knowledge
]

# Build agent
llm = ChatOpenAI(model="gpt-4o", temperature=0)
agent = initialize_agent(tools, llm, agent=AgentType.OPENAI_FUNCTIONS, verbose=True)
\`\`\`

## Usage

\`\`\`python
# Query the knowledge graph
result = agent.run("What are the key differences between zk-SNARKs and zk-STARKs?")
# → Agent calls MnemosyneQueryTool internally, pays royalty, returns verified answer

# Store new knowledge
agent.run("Please store this finding: GPT-4 achieves 87% accuracy on MMLU benchmark")
# → Agent calls MnemosyneStoreTool, entry is minted as iNFT
\`\`\`

## Expected Output

\`\`\`
> Entering new agent...
> Invoking: MnemosyneQuery with {"text": "zk-SNARKs vs zk-STARKs", "topK": 3}
> [0.94] Entry 0x3f2a... (cryptography) — "Zero-Knowledge Proofs in Practice"
> Royalty paid: 0.001 A0GI to 0x742d...
> Final answer: zk-SNARKs use trusted setup and produce tiny proofs...
\`\`\``,
  },

  {
    domain: 'observation',
    tags: ['AI', 'AGENTS', 'PATTERNS', 'BEHAVIOR', 'WEB3'],
    content: `# Query Patterns of Autonomous AI Agents

Observation of how AI agents interact with decentralized knowledge protocols, based on Mnemosyne testnet activity.

## Key Findings

### 1. Agents cluster queries around hot topics
Agents don't query uniformly. 80% of queries target ~5% of entries (power-law distribution), mirroring web search behavior. Entries about tokenomics, ZK proofs, and agent architectures dominate.

### 2. Query → Store feedback loop
Agents that query frequently also store frequently. When an agent fails to find an answer (similarity score < 0.5), it tends to research the topic and then submit the result as a new entry. This creates a self-healing knowledge base.

### 3. Multi-agent consensus as truth signal
Entries queried by 5+ distinct agent addresses and not challenged within the window show statistically higher accuracy in manual review. Multi-agent usage is a stronger truth signal than stake alone.

### 4. Challenge timing is strategic
Challenges cluster in the first 2 minutes of the challenge window — challengers appear to run automated scripts that monitor new submissions and immediately flag inconsistencies against existing knowledge.

## Implications for Protocol Design

- **Royalty weighting** should favor entries with diverse queriers (many agents) over high total volume from few agents
- **Challenge windows** shorter than 5 minutes are insufficient for automated review pipelines
- **Domain clustering** in the graph matches agent specialization — agents develop "expertise areas"`,
  },

  {
    domain: 'factual',
    tags: ['MNEMOSYNE', 'PROTOCOL', 'OVERVIEW', 'KNOWLEDGE'],
    content: `# Mnemosyne Knowledge Protocol

Mnemosyne is a decentralized, on-chain knowledge protocol where every fact is a staked NFT and every query generates royalties for knowledge contributors.

## Core Primitives

### Knowledge Entry (iNFT)
A piece of verified knowledge stored on 0G Storage and minted as an ERC-7857 iNFT on 0G Chain. Each entry carries:
- Encrypted content (markdown)
- Semantic embedding (for similarity search)
- Stake (0.005 A0GI) that is slashed if the entry is challenged and overturned
- Royalty stream paid to the current iNFT owner on every query

### Registry Contract
The \`MnemosyneRegistry\` is the source of truth for all entries. It tracks:
- Entry metadata (domain, submitter, timestamps)
- Status: PENDING → VERIFIED → CONTESTED → BURNED
- Query counts and royalties earned

### Challenge Mechanism
Any participant can challenge an entry they believe is incorrect by staking 0.005 A0GI. A validator panel reviews and votes. If the challenge is upheld, the entry is burned and the submitter's stake goes to the challenger.

## Protocol Stack

\`\`\`
Applications (Cursor, LangChain agents, browsers)
       ↓
  Mnemosyne API (REST — /store, /query, /unlock)
       ↓
  0G Storage (encrypted blobs + embeddings)
       ↓
  0G Chain / EVM (Registry, iNFT, Market, Challenge contracts)
\`\`\`

## Designed For

- AI agents that need verified, citable facts
- Knowledge contributors who want to monetize expertise
- Validators who ensure knowledge quality through economic incentives`,
  },

  {
    domain: 'correction',
    tags: ['L2', 'SIDECHAIN', 'BLOCKCHAIN', 'CORRECTION', 'SCALABILITY'],
    content: `# Correction: Layer 2 vs Sidechain — Key Distinctions

This entry corrects a widespread misconception: **Layer 2 networks and sidechains are not the same thing**, despite often being conflated in informal discourse.

## The Misconception

> "Polygon is a Layer 2 of Ethereum"

This was widely repeated circa 2021-2022. It is **incorrect** for Polygon PoS (the sidechain), though partially correct for Polygon zkEVM (a true L2).

## Correct Definitions

### Layer 2 (L2)
- Derives **security from the base layer** (L1)
- State is verifiable on L1 via fraud proofs (Optimistic Rollups) or validity proofs (ZK Rollups)
- Cannot steal funds without being detected on L1
- Examples: Arbitrum, Optimism, zkSync, Starknet, Polygon zkEVM

### Sidechain
- Has its **own independent validators and consensus**
- Connected to L1 only via a bridge (often a multi-sig)
- If the validator set is compromised, funds in the bridge can be stolen
- The L1 provides **no security guarantees** for the sidechain
- Examples: Polygon PoS (pre-2024), BSC, Ronin (which was hacked for $600M due to this)

## Litmus Test

Ask: "If all sidechain/L2 validators colluded to steal funds, could L1 prevent it or detect it?"
- **Yes** → it's a true L2
- **No** → it's a sidechain

## Why This Matters

Users who believe they are on an L2 may assume Ethereum-level security, leading to undercollateralized risk assumptions in DeFi protocols.`,
  },

  {
    domain: 'labeled_example',
    tags: ['SOLIDITY', 'STAKING', 'SMART_CONTRACT', 'DEFI', 'PATTERN'],
    content: `# Solidity Staking Contract Pattern

A minimal, auditable staking contract pattern used in knowledge protocols like Mnemosyne.

## Design Principles

1. **Pull over push** — never send funds automatically; let users claim
2. **Check-Effects-Interactions** — update state before external calls
3. **Slashing is irreversible** — burned stakes go to address(0)

## Implementation

\`\`\`solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract StakeVault {
    mapping(bytes32 => uint256) public stakes;      // entryId → amount
    mapping(bytes32 => address) public stakers;     // entryId → staker
    mapping(address => uint256) public claimable;   // address → earned

    error InsufficientStake();
    error Unauthorized();

    function deposit(bytes32 entryId) external payable {
        require(msg.value == 0.005 ether, InsufficientStake());
        stakes[entryId] = msg.value;
        stakers[entryId] = msg.sender;
    }

    // Called by ChallengeManager on upheld challenge
    function slash(bytes32 entryId, address recipient) external onlyChallenge {
        uint256 amount = stakes[entryId];
        stakes[entryId] = 0;
        // Check-Effects-Interactions
        if (recipient == address(0)) {
            // Burn: send to dead address
            (bool ok,) = address(0xdead).call{value: amount}("");
            require(ok);
        } else {
            claimable[recipient] += amount;
        }
    }

    function claim() external {
        uint256 amount = claimable[msg.sender];
        claimable[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok);
    }
}
\`\`\`

## Key Security Notes

- Use \`call\` not \`transfer\` for ETH sends (gas stipend compatibility)
- Zero out state **before** the external call to prevent reentrancy
- The \`onlyChallenge\` modifier should check \`msg.sender == challengeManagerAddress\``,
  },

  {
    domain: 'observation',
    tags: ['ROYALTIES', 'ECONOMICS', 'PROTOCOL', 'INCENTIVES', 'KNOWLEDGE'],
    content: `# Royalty Mechanics in Knowledge Protocols

Observations on how royalty-based incentive models perform in decentralized knowledge systems.

## The Core Tension

Knowledge has a public-goods problem: once shared, anyone can use it. Traditional solutions (paywalls, copyright) rely on legal enforcement. Cryptographic knowledge protocols solve this with **access-controlled queries** — you pay per read, not per copy.

## What Royalties Incentivize

### Correctness over virality
A knowledge entry that's queried 10,000 times by AI agents for factual answers earns more than one that's shared 10,000 times on social media. This flips the incentive from engagement-bait to accuracy.

### Long-term quality maintenance
If a royalty stream depletes over time (queries shift to newer entries), contributors are incentivized to update their entries or stake new ones. Stale knowledge self-corrects economically.

### Specialization
High royalties in niche domains attract specialized contributors. Observed on Mnemosyne testnet: entries on cryptographic primitives earn 3-4x more per query than general blockchain overviews, attracting specialist submissions.

## Failure Modes Observed

1. **Royalty farming** — bots query their own entries to generate artificial royalties. Mitigated by requiring query fees to be paid in a separate asset from royalties.
2. **Over-submission** — low-quality entries flood the registry to capture any query traffic. Mitigated by the challenge mechanism and similarity deduplication.
3. **Staleness** — highly-staked entries resist being replaced even when outdated, because challengers won't risk their stake on a subjective "outdated" claim.

## Open Problem

Distinguishing *correct but unpopular* knowledge from *incorrect* knowledge remains unsolved. Current protocols use stake as a proxy for confidence, but staked popularity ≠ truth.`,
  },
]

// ─── Utilities ─────────────────────────────────────────────────────────────────

const RESET = '\x1b[0m'
const BOLD  = '\x1b[1m'
const GREEN = '\x1b[32m'
const AMBER = '\x1b[33m'
const RED   = '\x1b[31m'
const BLUE  = '\x1b[34m'
const DIM   = '\x1b[2m'

function log(color, ...args) { console.log(color + args.join(' ') + RESET) }

async function pollJob(jobId, label) {
  const deadline = Date.now() + JOB_TIMEOUT_MS
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
    const res = await fetch(`${API}/jobs/${jobId}`)
    const job = await res.json()
    if (job.status === 'done') return job.result
    if (job.status === 'error') throw new Error(job.error)
    process.stdout.write(DIM + '  .' + RESET)
  }
  throw new Error(`Timed out after ${JOB_TIMEOUT_MS / 1000}s`)
}

function isBytes32Hex(v) {
  return typeof v === 'string' && /^0x[0-9a-fA-F]{64}$/.test(v)
}

async function verifyEnsBootstrap() {
  const res = await fetch(`${API}/load-from-ens/${SUBMITTER}`)
  const body = await res.json()
  if (!res.ok || body?.error) {
    throw new Error(`ENS bootstrap failed: ${body?.error ?? `HTTP ${res.status}`}`)
  }
  return body
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  log(BOLD, `\nMnemosyne Demo Seed — ${ENTRIES.length} entries → ${API}\n`)

  // Health check
  try {
    const health = await fetch(`${API}/health`).then(r => r.json())
    log(GREEN, `✓ API online — ${health.entries} existing entries`)
  } catch {
    log(RED, '✗ API unreachable. Is the server running?')
    process.exit(1)
  }

  const results = []

  for (let i = 0; i < ENTRIES.length; i++) {
    const entry = ENTRIES[i]
    const title = entry.content.split('\n')[0].replace(/^# /, '')
    log(BLUE, `\n[${i + 1}/${ENTRIES.length}] ${title}`)
    log(DIM, `  domain: ${entry.domain} · tags: ${entry.tags.join(', ')}`)

    try {
      // Submit
      const storeRes = await fetch(`${API}/store`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: entry.content,
          domain: entry.domain,
          tags: entry.tags,
          submittedBy: SUBMITTER,
        }),
      })
      if (!storeRes.ok) throw new Error(`HTTP ${storeRes.status}`)
      const { jobId } = await storeRes.json()
      log(DIM, `  jobId: ${jobId} — polling`)

      // Poll
      process.stdout.write('  ')
      const result = await pollJob(jobId, title)
      process.stdout.write('\n')

      if (!isBytes32Hex(result.entryId)) {
        throw new Error(`Non-bytes32 entryId returned (${result.entryId}) — on-chain submit likely failed`)
      }
      if (!result.submitTxHash) {
        throw new Error('Missing submitTxHash — on-chain tx not confirmed')
      }
      if (!result.manifestRef) {
        throw new Error('Missing manifestRef — ENS memory.index not updated')
      }
      const contentCheck = await fetch(`${API}/content/${result.entryId}`)
      if (!contentCheck.ok) {
        throw new Error(`GET /content failed: HTTP ${contentCheck.status}`)
      }
      const ensCheck = await verifyEnsBootstrap()

      log(GREEN, `  ✓ entryId: ${result.entryId}`)
      log(DIM, `  tx: ${result.submitTxHash}`)
      log(DIM, `  manifest: ${result.manifestRef}`)
      if (result.entryEnsName) log(DIM, `  entry ENS: ${result.entryEnsName}`)
      results.push({
        title,
        domain: entry.domain,
        tags: entry.tags,
        entryId: result.entryId,
        jobId,
        submitTxHash: result.submitTxHash,
        manifestRef: result.manifestRef,
        entryEnsName: result.entryEnsName ?? null,
        ensLoaded: ensCheck.loaded,
      })

    } catch (err) {
      process.stdout.write('\n')
      log(RED, `  ✗ Failed: ${err.message}`)
      results.push({ title, domain: entry.domain, tags: entry.tags, entryId: null, error: err.message })
    }

    // Small pause between submissions to avoid rate limiting
    if (i < ENTRIES.length - 1) await new Promise(r => setTimeout(r, 1000))
  }

  // Summary
  const ok  = results.filter(r => r.entryId)
  const bad = results.filter(r => !r.entryId)

  log(BOLD, `\n${'─'.repeat(60)}`)
  log(BOLD, `Results: ${ok.length} submitted, ${bad.length} failed`)
  log(BOLD, `${'─'.repeat(60)}\n`)

  ok.forEach(r => {
    log(GREEN, `✓ [${r.domain}] ${r.title}`)
    log(DIM,   `  ${r.entryId}`)
  })

  if (bad.length > 0) {
    console.log()
    bad.forEach(r => log(RED, `✗ ${r.title}: ${r.error}`))
  }

  // Write results to file
  const outputPath = new URL('../.local/seed-results.json', import.meta.url).pathname
  const fs = await import('fs')
  fs.writeFileSync(outputPath, JSON.stringify({ submittedAt: new Date().toISOString(), entries: results }, null, 2))
  log(DIM, `\nResults written to .local/seed-results.json`)
  log(AMBER, `\nOpen https://mnemosyne-production.up.railway.app to review seeded entries.\n`)
}

main().catch(err => {
  log(RED, `\nFatal: ${err.message}`)
  process.exit(1)
})
