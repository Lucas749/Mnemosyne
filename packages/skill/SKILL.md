---
description: Decentralized knowledge retrieval with on-chain payment. Query the Mnemosyne knowledge graph by semantic similarity, ask the user to approve the payment, then pay on-chain and return verified Markdown knowledge with transaction hash and explorer link.
allowed-tools: Bash
---

# Mnemosyne Knowledge Skill

Retrieve verified knowledge from the Mnemosyne decentralized memory network. Uses semantic similarity search and x402 on-chain payment to unlock content.

**IMPORTANT: Never send a payment without explicit user approval. Always pause and ask before executing the on-chain transaction.**

## Setup — run once

```bash
export MNEMOSYNE_API_URL="https://mnemosyne-api-production-7cd6.up.railway.app"
export AGENT_PRIVATE_KEY="0x<your-wallet-private-key>"
export AGENT_NAME="claude-skill.eth"
```

Prerequisites: `jq` (`brew install jq`) and `cast` (`curl -L https://foundry.paradigm.xyz | bash && foundryup`)

---

## Flow — two stages with mandatory user approval between them

### STAGE 1 — Search and check payment required

Run this bash block first. Replace `REPLACE_WITH_USER_QUERY` with the actual question.

```bash
#!/usr/bin/env bash
set -uo pipefail
API="${MNEMOSYNE_API_URL:-https://mnemosyne-api-production-7cd6.up.railway.app}"
AGENT="${AGENT_NAME:-claude-skill.eth}"
RPC="https://evmrpc-testnet.0g.ai"
QUERY="REPLACE_WITH_USER_QUERY"

poll_job() {
  local jid="$1" elapsed=0
  while [ "$elapsed" -lt 120 ]; do
    local r; r=$(curl -sf "$API/jobs/$jid")
    local s; s=$(echo "$r" | jq -r '.status')
    [ "$s" = "done" ]  && { echo "$r" | jq -c '.result'; return 0; }
    [ "$s" = "error" ] && { echo "job error: $(echo "$r" | jq -r '.error')" >&2; return 1; }
    sleep 3; elapsed=$((elapsed+3))
  done
  echo "timeout" >&2; return 1
}

echo "=== STEP 1: Semantic search ==="
JOB=$(curl -sf -X POST "$API/query" \
  -H "Content-Type: application/json" \
  -d "{\"text\":\"$QUERY\",\"topK\":5,\"queriedBy\":\"$AGENT\"}" | jq -r '.jobId')
RESULT=$(poll_job "$JOB")

echo "Matches:"
echo "$RESULT" | jq -r '.matches[] | "  \(.similarity*100|floor)%  \(.entryId[:24])...  [\(.tags//[]|join(", "))]  by \(.submittedBy//"?")"'

TOP_ID=$(echo "$RESULT" | jq -r '.matches[0].entryId')
TOP_SIM=$(echo "$RESULT" | jq -r '.matches[0].similarity * 100 | floor')
TOP_BY=$(echo "$RESULT" | jq -r '.matches[0].submittedBy // "unknown"')
echo "TOP_ID=$TOP_ID"
echo "TOP_SIM=$TOP_SIM"
echo "TOP_BY=$TOP_BY"

if [ "$TOP_SIM" -lt 30 ]; then
  echo "RESULT=no_match"
  exit 0
fi

echo "=== STEP 2: Checking payment requirements ==="
HTTP=$(curl -s -o /tmp/mn_unlock.json -w "%{http_code}" \
  -X POST "$API/unlock" \
  -H "Content-Type: application/json" \
  -d "{\"entryId\":\"$TOP_ID\",\"queriedBy\":\"$AGENT\"}")

if [ "$HTTP" = "200" ]; then
  echo "RESULT=free"
  jq '{entryId,domain,submittedBy,contentLength:(.content|length)}' /tmp/mn_unlock.json
  echo "--- content ---"
  jq -r '.content' /tmp/mn_unlock.json
  exit 0
fi

if [ "$HTTP" != "402" ]; then
  echo "RESULT=error HTTP $HTTP"
  jq . /tmp/mn_unlock.json
  exit 1
fi

PAY_TO=$(jq -r '.x402.payTo' /tmp/mn_unlock.json)
PAY_WEI=$(jq -r '.x402.maxAmountRequired' /tmp/mn_unlock.json)
PAY_ETH=$(echo "$PAY_WEI" | awk '{printf "%.4f", $1/1e18}')

echo "RESULT=payment_required"
echo "PAY_TO=$PAY_TO"
echo "PAY_WEI=$PAY_WEI"
echo "PAY_ETH=$PAY_ETH"
```

After running Stage 1:

- If `RESULT=no_match` → tell the user no relevant knowledge was found. Stop.
- If `RESULT=free` → show the content. Stop.
- If `RESULT=payment_required` → **do NOT proceed yet**. Instead, present this exact approval prompt to the user:

---

> **Payment required to unlock this knowledge entry**
>
> | | |
> |---|---|
> | **Match** | `{TOP_SIM}%` similarity |
> | **Entry** | `{TOP_ID}` |
> | **Submitted by** | `{TOP_BY}` |
> | **Cost** | `{PAY_ETH} A0GI` (`{PAY_WEI}` wei) |
> | **Recipient** | `{PAY_TO}` |
> | **Network** | 0G Galileo Testnet |
>
> Approve this on-chain payment? **yes / no**

Wait for the user's response before doing anything else.

- If the user says **no** (or anything other than yes) → stop, do not send any transaction.
- If the user says **yes** → proceed to Stage 2.

---

### STAGE 2 — Pay and unlock (only after user approval)

Run this bash block, substituting `TOP_ID`, `PAY_TO`, and `PAY_WEI` from Stage 1 output.

```bash
#!/usr/bin/env bash
set -uo pipefail
API="${MNEMOSYNE_API_URL:-https://mnemosyne-api-production-7cd6.up.railway.app}"
AGENT="${AGENT_NAME:-claude-skill.eth}"
KEY="${AGENT_PRIVATE_KEY:-}"
RPC="https://evmrpc-testnet.0g.ai"

TOP_ID="REPLACE_WITH_TOP_ID"
PAY_TO="REPLACE_WITH_PAY_TO"
PAY_WEI="REPLACE_WITH_PAY_WEI"

if [ -z "$KEY" ]; then
  echo "ERROR: AGENT_PRIVATE_KEY is not set — export it and try again"
  exit 1
fi

echo "=== STEP 3: Sending payment ==="
set +e
TX_RAW=$(cast send --rpc-url "$RPC" --private-key "$KEY" --value "$PAY_WEI" --async "$PAY_TO" 2>&1)
CAST_EXIT=$?
set -e

if [ "$CAST_EXIT" -ne 0 ]; then
  echo "Payment failed: $TX_RAW"
  exit 1
fi

TX_HASH=$(echo "$TX_RAW" | grep -oE '0x[a-fA-F0-9]{64}' | head -1)

if [ -z "$TX_HASH" ]; then
  echo "Could not extract tx hash: $TX_RAW"
  exit 1
fi

echo "tx hash  : $TX_HASH"
echo "explorer : https://chainscan-galileo.0g.ai/tx/$TX_HASH"
echo "Waiting 12s for confirmation..."
sleep 12

echo ""
echo "=== STEP 4: Unlocking content ==="
HTTP2=$(curl -s -o /tmp/mn_unlock2.json -w "%{http_code}" \
  -X POST "$API/unlock" \
  -H "Content-Type: application/json" \
  -H "X-Payment: $TX_HASH" \
  -d "{\"entryId\":\"$TOP_ID\",\"queriedBy\":\"$AGENT\"}")

if [ "$HTTP2" != "200" ]; then
  echo "Unlock failed HTTP $HTTP2:"
  jq . /tmp/mn_unlock2.json
  exit 1
fi

echo "Payment verified — content unlocked"
jq '{entryId,domain,submittedBy,paymentTx,contentLength:(.content|length)}' /tmp/mn_unlock2.json
echo "--- content ---"
jq -r '.content' /tmp/mn_unlock2.json
```

---

## Required response format

After Stage 2 completes, your reply **must** include:

1. **Similarity score** — e.g. `77% match`
2. **Entry ID** — the on-chain identifier
3. **Payment:** tx hash with explorer link and amount
4. **Submitted by**
5. **The full unlocked content**

**Example:**

---
**Retrieved from Mnemosyne** · 77% similarity  
Entry: `0x5ef0c4c294c93d6473e5...`  
Payment: `0.001 A0GI` → tx [`0x85da69bc...`](https://chainscan-galileo.0g.ai/tx/0x85da69bc...)  
Submitted by: `bash-agent.eth` · domain: `factual`

[full content here]

---

## Similarity thresholds

| Score | Decision |
|-------|----------|
| ≥ 70% | Strong match — still ask for approval before paying |
| 30–70% | Relevant — ask for approval before paying |
| < 30%  | Weak — skip, do not unlock |

## Network

- Chain: **0G Galileo Testnet** (ID 16602)
- RPC: `https://evmrpc-testnet.0g.ai`
- Explorer: `https://chainscan-galileo.0g.ai`
- Registry: `0xaA40404DC25248c886c8fb6C27e34536aB2b8001`
