---
name: mnemosyne-keeper
description: Trigger and monitor Mnemosyne keeper operations via KeeperHub. Use this skill to activate pending iNFTs, run royalty distribution, check keeper status, and manage KeeperHub workflows — all from within an agent session.
tools:
  - web_fetch
  - bash
---

# Mnemosyne Keeper (via KeeperHub)

This skill gives agents direct control over Mnemosyne's keeper operations using KeeperHub as the reliable on-chain execution layer.

## Why KeeperHub

Keeper operations (iNFT activation, royalty distribution, challenge resolution) require reliable on-chain execution with retry logic, gas management, and audit trails. KeeperHub handles all of that so Mnemosyne's API stays stateless.

## Configuration

| Env var | Value |
|---|---|
| `MNEMOSYNE_API_URL` | `https://mnemosyne-api-production-7cd6.up.railway.app` |
| `KEEPERHUB_API_KEY` | your KeeperHub API key from app.keeperhub.com |
| `USE_KEEPERHUB` | `true` (disables inline setInterval keeper in the API) |

---

## Agent operations

### Check keeper status

Before triggering anything, check what's pending:

```
GET $MNEMOSYNE_API_URL/keeper/status
```

Response:
```json
{
  "useKeeperHub": true,
  "pendingActivation": 3,
  "readyToActivate": 1,
  "entries": {
    "ready": [{ "localId": "0xabc...", "onchainEntryId": "0x...", "readyToActivate": true }],
    "pending": [{ "localId": "0xdef...", "challengeWindowEnd": 1714000000, "readyToActivate": false }]
  }
}
```

### Activate pending iNFTs

Activates all entries past their 5-minute challenge window:

```
POST $MNEMOSYNE_API_URL/keeper/activate-pending
```

Response:
```json
{ "activated": 1, "results": [{ "localId": "0xabc...", "inftTokenId": "42" }] }
```

### Run royalty distribution

Distribute accumulated royalties to contributors via Uniswap:

```
POST $MNEMOSYNE_API_URL/keeper/distribute
```

---

## Using KeeperHub MCP from an agent

If you have the KeeperHub MCP server configured, you can create and trigger workflows programmatically.

### List existing Mnemosyne workflows

```
kh workflow list
```

### Trigger activation workflow manually

```
kh workflow run <workflow-id>
```

### Create the activation workflow via API

```
POST https://api.keeperhub.com/v1/workflows
Authorization: Bearer $KEEPERHUB_API_KEY
Content-Type: application/json

(contents of packages/keeper/workflows/activate-pending.json)
```

### Create the weekly distribution workflow

```
POST https://api.keeperhub.com/v1/workflows
Authorization: Bearer $KEEPERHUB_API_KEY
Content-Type: application/json

(contents of packages/keeper/workflows/weekly-distribution.json)
```

### Check a workflow run status

```
kh run status <run-id>
```

---

## Agentic workflow: agent-triggered iNFT activation

An agent can handle the full lifecycle without human intervention:

1. Store knowledge: `POST /store` → returns jobId
2. Poll until done: `GET /jobs/:jobId`
3. Wait for challenge window: check `GET /keeper/status` until `readyToActivate > 0`
4. Activate via KeeperHub: `POST /keeper/activate-pending`
5. Confirm iNFT minted: entry now has `inftTokenId` in query results

### Example — agent activates its own stored knowledge

```
web_fetch GET https://mnemosyne-api-production-7cd6.up.railway.app/keeper/status
```

*If readyToActivate > 0:*

```
web_fetch POST https://mnemosyne-api-production-7cd6.up.railway.app/keeper/activate-pending
```

*Response confirms tokenId — royalties now flow to the iNFT owner.*

---

## Automated workflows (KeeperHub schedules)

Import these into KeeperHub from `packages/keeper/workflows/`:

| Workflow | Trigger | Action |
|---|---|---|
| `activate-pending.json` | Every 5 minutes | Activates all entries past challenge window |
| `weekly-distribution.json` | Every Sunday 00:00 UTC | Distributes royalties via Uniswap |

Set `USE_KEEPERHUB=true` in Railway to disable the inline keeper and let KeeperHub own execution.
