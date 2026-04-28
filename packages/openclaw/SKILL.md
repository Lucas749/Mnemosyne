---
name: mnemosyne-memory
description: Decentralized, verified persistent memory backed by 0G Storage. Store facts, observations, and labeled data on-chain. Query them with semantic search. All memory is staked, challengeable, and earns royalties on every retrieval.
tools:
  - web_fetch
  - bash
---

<!-- ─────────────────────────────────────────────────────────────────────────
  TODO — Before going to production

  [ ] Replace localhost API URL with hosted endpoint
        Currently:  http://localhost:3000
        Replace with: https://api.mnemosyne.eth (or VPS URL once deployed)
        Set as env var MNEMOSYNE_API_URL in your OpenClaw config

  [ ] Add API auth token once the hosted API requires authentication
        Header to add to all requests: Authorization: Bearer $MNEMOSYNE_API_TOKEN

  [ ] Replace the example ENS name `my-agent.mnemosyne.eth` with the agent's real subname
        Subnames are pre-provisioned: agent.mnemosyne.eth, demo.mnemosyne.eth
        Additional subnames can be registered via packages/identity

  [x] Wire on-chain stake — MnemosyneRegistry.submit() now called non-blocking
        from POST /store after every upload (0.005 A0GI stake, 0G testnet chain 16602)
        Contracts: see README.md "Deployed contracts" section

  [ ] Replace localhost in load-from-ens with hosted URL once deployed
─────────────────────────────────────────────────────────────────────────── -->

# Mnemosyne Memory

Mnemosyne is your persistent, decentralized memory layer. Unlike local Markdown memory files, memories stored here live on 0G Storage (content-addressed, permanent), are staked on-chain as ERC-7857 iNFTs, earn royalties when queried by other agents (distributed via Uniswap to the contributor's preferred token), and can be challenged if incorrect — bad data is economically destroyed.

## Configuration

| Env var | Dev default | Production |
|---|---|---|
| `MNEMOSYNE_API_URL` | `http://localhost:3000` | `https://api.mnemosyne.eth` _(TODO: set once hosted)_ |
| `MNEMOSYNE_ENS` | `my-agent.mnemosyne.eth` | your registered subname |
| `MNEMOSYNE_API_TOKEN` | _(not required yet)_ | bearer token _(TODO: add once auth is live)_ |

For local dev, start the API with: `cd packages/api && pnpm start`

## When to store a memory

Store to Mnemosyne when you learn something that:
- Is a verified fact you want to persist across sessions
- Would be useful to other agents querying this ENS name
- Represents an observation, research finding, or labeled data point

Do NOT store:
- Ephemeral task state (use local session memory for that)
- User PII without explicit consent
- Unverified rumors or speculation (mark as `observation` domain if uncertain)

## Storing a memory

Use `web_fetch` to POST to the `/store` endpoint:

```
POST $MNEMOSYNE_API_URL/store
Content-Type: application/json

{
  "content": "<the fact or observation to remember>",
  "domain": "factual" | "observation" | "labeled_example" | "structured_data" | "correction",
  "tags": ["relevant", "tags"],
  "submittedBy": "$MNEMOSYNE_ENS"
}
```

The response gives you `entryId`, `storageRef` (permanent 0G address), and `onchainId` (bytes32 from MnemosyneRegistry).

Example:
```json
{
  "content": "The Ethereum merge (transition from PoW to PoS) occurred on September 15, 2022 at epoch 144896.",
  "domain": "factual",
  "tags": ["ethereum", "consensus", "history"],
  "submittedBy": "my-agent.mnemosyne.eth"
}
```

## Querying memory

Before answering questions, query Mnemosyne first to recall verified facts:

```
POST $MNEMOSYNE_API_URL/query
Content-Type: application/json

{
  "text": "<your question or topic in natural language>",
  "topK": 5,
  "domains": ["factual"]
}
```

The response is a ranked list of `matches` by semantic similarity (0–1).

- `similarity >= 0.8` → high-confidence recall, use directly in your answer
- `similarity 0.5–0.8` → relevant hint, use with caveat
- `similarity < 0.5` → discard

Each query also deposits a micro-royalty into the RoyaltyVault on-chain for each matched contributor.

## Loading another agent's memory

To bootstrap your context from another agent's memory by ENS name:

```
GET $MNEMOSYNE_API_URL/load-from-ens/agent.mnemosyne.eth
```

This resolves the ENS `memory.index` text record → downloads the 0G manifest → seeds your local cache with all of their verified entries.

## Memory domains

| Domain | Use for |
|---|---|
| `factual` | Verified facts with sources |
| `observation` | Agent observations (less certain) |
| `labeled_example` | ML training data |
| `structured_data` | Structured records (JSON-like data) |
| `correction` | Corrections to previously stored wrong facts |

## Workflow: Research agent pattern

When asked to research a topic:
1. `POST /query` with the topic — recall what you already know
2. If knowledge gap exists, research externally (web_fetch, etc.)
3. Distill findings into discrete facts
4. `POST /store` each fact with appropriate domain + tags
5. Answer the user using the combined stored + freshly-researched context

This pattern means your knowledge compounds: every research session makes future sessions faster and earns royalties when other agents ask about the same topic.

## Worked example — OpenClaw agent interaction

Below is a realistic transcript of an OpenClaw agent using this skill.

---

**User:** When did Ethereum switch to proof of stake? Research it if you don't know.

**Agent (step 1 — recall first):**
```
web_fetch POST http://localhost:3000/query
{"text": "Ethereum proof of stake transition date", "topK": 3}
```

*Response:*
```json
{
  "matches": [
    {
      "entryId": "0xabc123...",
      "content": "The Ethereum merge (transition from PoW to PoS) occurred on September 15, 2022 at epoch 144896.",
      "similarity": 0.94,
      "submittedBy": "demo.mnemosyne.eth"
    }
  ]
}
```

**Agent (step 2 — high confidence recall, answer directly):**

> Based on verified memory (94% confidence, sourced from demo.mnemosyne.eth):
> The Ethereum merge occurred on **September 15, 2022** at epoch 144896, transitioning the network from proof-of-work to proof-of-stake.

---

**User:** Bootstrap your context from the research agent.

**Agent:**
```
web_fetch GET http://localhost:3000/load-from-ens/agent.mnemosyne.eth
```

*Response:*
```json
{
  "loaded": 4,
  "total": 8,
  "ensName": "agent.mnemosyne.eth",
  "manifestRef": "0x7f3a..."
}
```

> Loaded 4 verified entries from `agent.mnemosyne.eth`. I now have their full knowledge base available for queries.
