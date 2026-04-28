---
name: mnemosyne-memory
description: Decentralized, verified persistent memory backed by 0G Storage. Store facts, observations, and labeled data on-chain. Query them with semantic search. All memory is staked, challengeable, and earns royalties on every retrieval.
tools:
  - web_fetch
  - bash
---

<!-- ─────────────────────────────────────────────────────────────────────────
  TODO — Before publishing / going to production

  [ ] Replace localhost API URL with hosted endpoint
        Currently:  http://localhost:3000
        Replace with: https://api.mnemosyne.eth (or VPS URL once deployed)
        Set as env var MNEMOSYNE_API_URL in your OpenClaw config or ~/.openclaw/openclaw.json

  [ ] Add API auth token once the hosted API requires authentication
        Header to add to all requests: Authorization: Bearer $MNEMOSYNE_API_TOKEN

  [ ] Replace the example ENS name `my-agent.mnemosyne.eth` with the agent's real subname
        Set MNEMOSYNE_ENS in env — this is registered via packages/identity (Phase 8)

  [ ] Wire the on-chain stake flow once contracts are deployed to 0G testnet
        Storing via the REST API does NOT stake ETH yet — that requires a wallet tx to
        MnemosyneRegistry.submit() which is not yet called from this skill

  [ ] Replace `http://localhost:3000` references in load-manifest with hosted URL

  [ ] Add error handling instructions for when the API is unreachable
        (currently the agent will get a connection error with no guidance)
─────────────────────────────────────────────────────────────────────────── -->

# Mnemosyne Memory

Mnemosyne is your persistent, decentralized memory layer. Unlike local Markdown memory files, memories stored here live on 0G Storage (content-addressed, permanent), earn royalties when queried by other agents, and can be challenged if incorrect — bad data is economically destroyed.

## Configuration

The API runs at `MNEMOSYNE_API_URL`.

| Env var | Dev default | Production |
|---|---|---|
| `MNEMOSYNE_API_URL` | `http://localhost:3000` | `https://api.mnemosyne.eth` _(TODO: set once hosted)_ |
| `MNEMOSYNE_ENS` | `my-agent.mnemosyne.eth` | your registered subname _(TODO: register via Phase 8)_ |
| `MNEMOSYNE_API_TOKEN` | _(not required yet)_ | bearer token _(TODO: add once API auth is live)_ |

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

The response gives you an `entryId` and `storageRef` — these are the permanent 0G addresses of this memory.

Example: After researching that the Ethereum merge happened on Sep 15 2022, store it:
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

The response is a ranked list of `matches` by semantic similarity (0–1). Use the top results as context before generating your answer.

If `similarity > 0.8`, treat the match as a high-confidence recall.
If `similarity` is between 0.5–0.8, treat it as a relevant hint.
Below 0.5, discard.

## Loading another agent's memory

To bootstrap your context from another agent's verified memory (by ENS name):

1. First, resolve their `memory.index` ENS text record to get the 0G manifest reference
2. Then load it:

```
POST $MNEMOSYNE_API_URL/load-manifest
Content-Type: application/json

{ "manifestRef": "<0g manifest ref from ENS memory.index>" }
```

This seeds your local cache with all of their active, verified entries.

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
