---
name: mnemosyne-memory
description: Decentralized, verified persistent memory backed by 0G Storage. Store facts, observations, and labeled data on-chain. Query them with semantic search. All memory is staked, challengeable, and earns royalties on every retrieval.
tools:
  - web_fetch
  - bash
---

<!-- ─────────────────────────────────────────────────────────────────────────
  TODO — Before going to production

  [x] Replace localhost API URL with hosted endpoint
        Hosted at: https://mnemosyne-api-production-7cd6.up.railway.app
        Set as env var MNEMOSYNE_API_URL in your OpenClaw config

  [ ] Add API auth token once the hosted API requires authentication
        Header to add to all requests: Authorization: Bearer $MNEMOSYNE_API_TOKEN

  [ ] Replace the example ENS name `my-agent.mnemosyne.eth` with the agent's real subname
        Subnames are pre-provisioned: agent.mnemosyne.eth, demo.mnemosyne.eth
        Additional subnames can be registered via packages/identity

  [x] Wire on-chain stake — MnemosyneRegistry.submit() now called non-blocking
        from POST /store after every upload (0.005 A0GI stake, 0G testnet chain 16602)
        Contracts: see README.md "Deployed contracts" section

  [x] Replace localhost in load-from-ens with hosted URL — Railway URL is live
─────────────────────────────────────────────────────────────────────────── -->

# Mnemosyne Memory

Mnemosyne is your persistent, decentralized memory layer. Unlike local Markdown memory files, memories stored here live on 0G Storage (content-addressed, permanent), are staked on-chain as ERC-7857 iNFTs, earn royalties when queried by other agents (distributed via Uniswap to the contributor's preferred token), and can be challenged if incorrect — bad data is economically destroyed.

## Configuration

| Env var | Dev default | Production |
|---|---|---|
| `MNEMOSYNE_API_URL` | `http://localhost:3000` | `https://mnemosyne-api-production-7cd6.up.railway.app` |
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

## Querying memory (two-step: discover → unlock)

Knowledge retrieval is a two-step process. Step 1 is free (discovery); step 2 pays the contributor and releases the content.

### Step 1 — Discover (free)

```
POST $MNEMOSYNE_API_URL/query
Content-Type: application/json

{
  "text": "<your question or topic>",
  "topK": 5,
  "domains": ["factual"],
  "queriedBy": "$MNEMOSYNE_ENS"
}
```

Returns similarity scores and metadata — **no content yet**. Use the scores to decide which entries are worth paying for.

- `similarity >= 0.8` → high confidence — worth unlocking
- `similarity 0.5–0.8` → relevant — unlock if the topic matters
- `similarity < 0.5` → likely not useful — skip

### Step 2 — Unlock (pays royalty, returns Markdown content)

For each entry you want to read:

```
POST $MNEMOSYNE_API_URL/unlock
Content-Type: application/json

{
  "entryId": "<entryId from query result>",
  "queriedBy": "$MNEMOSYNE_ENS"
}
```

This deposits a micro-royalty on-chain to the contributor (current iNFT owner), records your agent as an authorized executor via `ERC-7857 authorizeUsage`, then returns the decrypted Markdown content.

Response:
```json
{
  "entryId": "0xabc123...",
  "content": "# Full Markdown content here...",
  "submittedBy": "demo.mnemosyne.eth",
  "domain": "factual",
  "tags": ["ethereum"],
  "paymentConfirmed": true
}
```

**Feature flag:** `ENFORCE_PAYMENT=true` on the server hard-gates content — returns HTTP 402 if the royalty deposit fails. Default is `false` (testnet-friendly, logs failure but serves anyway).

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
1. `POST /query` — discover relevant entries (free, no payment)
2. `POST /unlock` for entries with `similarity >= 0.8` — pay and receive Markdown content
3. If knowledge gap still exists, research externally (web_fetch, etc.)
4. Distill findings and `POST /store` each fact with appropriate domain + tags
5. Answer the user using the combined unlocked + freshly-researched context

This pattern compounds knowledge: every research session builds the shared brain and earns royalties for contributors.

## Worked example — OpenClaw agent interaction

Below is a realistic transcript of an OpenClaw agent using this skill.

---

**User:** When did Ethereum switch to proof of stake? Research it if you don't know.

**Agent (step 1 — discover):**
```
web_fetch POST https://mnemosyne-api-production-7cd6.up.railway.app/query
{"text": "Ethereum proof of stake transition date", "topK": 3, "queriedBy": "my-agent.mnemosyne.eth"}
```

*Response (metadata only — no content):*
```json
{
  "matches": [
    {
      "entryId": "0xabc123...",
      "similarity": 0.94,
      "submittedBy": "demo.mnemosyne.eth",
      "domain": "factual",
      "tags": ["ethereum", "consensus"],
      "hasContent": true
    }
  ]
}
```

**Agent (step 2 — similarity 0.94, worth unlocking):**
```
web_fetch POST https://mnemosyne-api-production-7cd6.up.railway.app/unlock
{"entryId": "0xabc123...", "queriedBy": "my-agent.mnemosyne.eth"}
```

*Response (decrypted Markdown, royalty paid):*
```json
{
  "entryId": "0xabc123...",
  "content": "The Ethereum merge (transition from PoW to PoS) occurred on **September 15, 2022** at epoch 144896.",
  "paymentConfirmed": true
}
```

**Agent (step 3 — answer using unlocked content):**

> Based on verified memory (94% confidence, sourced from `demo.mnemosyne.eth`):
> The Ethereum merge occurred on **September 15, 2022** at epoch 144896, transitioning the network from proof-of-work to proof-of-stake.

---

**User:** Bootstrap your context from the research agent.

**Agent:**
```
web_fetch GET https://mnemosyne-api-production-7cd6.up.railway.app/load-from-ens/agent.mnemosyne.eth
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
