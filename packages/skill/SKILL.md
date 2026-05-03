---
description: Decentralized knowledge retrieval with on-chain payment. Query the Mnemosyne knowledge graph by semantic similarity, pay for content with a real on-chain transaction, and receive verified Markdown knowledge. Always return transaction hashes and explorer links.
allowed-tools: Bash
---

# Mnemosyne Knowledge Skill

Retrieve verified knowledge from the Mnemosyne decentralized memory network. Uses semantic similarity search and x402 on-chain payment to unlock content. **Always show transaction hashes and explorer links in your response.**

## Setup — run once

```bash
export MNEMOSYNE_API_URL="https://mnemosyne-api-production-7cd6.up.railway.app"
export AGENT_PRIVATE_KEY="0x<your-wallet-private-key>"
export AGENT_NAME="claude-skill.eth"
```

Prerequisites: `jq` (`brew install jq`) and `cast` (`curl -L https://foundry.paradigm.xyz | bash && foundryup`)

---

## Full retrieval flow

When a user asks you to look up or retrieve knowledge, run the following in a **single bash block**. Replace `REPLACE_WITH_USER_QUERY` with the actual question.

```bash
#!/usr/bin/env bash
set -uo pipefail
API="${MNEMOSYNE_API_URL:-https://mnemosyne-api-production-7cd6.up.railway.app}"
AGENT="${AGENT_NAME:-claude-skill.eth}"
KEY="${AGENT_PRIVATE_KEY:-}"
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
echo "jobId: $JOB"
RESULT=$(poll_job "$JOB")

echo "Matches:"
echo "$RESULT" | jq -r '.matches[] | "  \(.similarity*100|floor)%  \(.entryId[:24])...  [\(.tags//[]|join(", "))]  by \(.submittedBy//"?")"'

TOP_ID=$(echo "$RESULT" | jq -r '.matches[0].entryId')
TOP_SIM=$(echo "$RESULT" | jq -r '.matches[0].similarity * 100 | floor')
echo "Top match: ${TOP_SIM}% — $TOP_ID"

if [ "$TOP_SIM" -lt 30 ]; then
  echo "Similarity ${TOP_SIM}% below threshold — no relevant knowledge found"
  exit 0
fi

echo ""
echo "=== STEP 2: Unlock attempt ==="
HTTP=$(curl -s -o /tmp/mn_unlock.json -w "%{http_code}" \
  -X POST "$API/unlock" \
  -H "Content-Type: application/json" \
  -d "{\"entryId\":\"$TOP_ID\",\"queriedBy\":\"$AGENT\"}")

if [ "$HTTP" = "200" ]; then
  echo "Access granted (no payment required)"
  jq '{entryId,domain,submittedBy,paymentConfirmed,paymentTx,contentLength:(.content|length)}' /tmp/mn_unlock.json
  echo "--- content ---"
  jq -r '.content' /tmp/mn_unlock.json
  exit 0
fi

if [ "$HTTP" != "402" ]; then
  echo "Error HTTP $HTTP:"; jq . /tmp/mn_unlock.json; exit 1
fi

PAY_TO=$(jq -r '.x402.payTo' /tmp/mn_unlock.json)
PAY_WEI=$(jq -r '.x402.maxAmountRequired' /tmp/mn_unlock.json)
PAY_ETH=$(echo "$PAY_WEI" | awk '{printf "%.6f", $1/1e18}')

echo "=== STEP 3: Payment required ==="
echo "payTo  : $PAY_TO"
echo "amount : $PAY_WEI wei ($PAY_ETH A0GI)"

if [ -z "$KEY" ]; then
  echo "ERROR: AGENT_PRIVATE_KEY not set"
  exit 1
fi

TX_RAW=$(cast send --rpc-url "$RPC" --private-key "$KEY" --value "$PAY_WEI" --async "$PAY_TO" 2>&1) || true
TX_HASH=$(echo "$TX_RAW" | grep -oE '0x[a-fA-F0-9]{64}' | head -1)

if [ -z "$TX_HASH" ]; then
  echo "Payment broadcast failed: $TX_RAW"
  exit 1
fi

echo "tx hash  : $TX_HASH"
echo "explorer : https://chainscan-galileo.0g.ai/tx/$TX_HASH"
echo "Waiting 12s for confirmation..."
sleep 12

echo ""
echo "=== STEP 4: Retry unlock with X-Payment ==="
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
jq '{entryId,domain,submittedBy,paymentConfirmed,paymentTx,contentLength:(.content|length)}' /tmp/mn_unlock2.json
echo "--- content ---"
jq -r '.content' /tmp/mn_unlock2.json
```

---

## Required response format

After running the bash block, your reply **must** include:

1. **Similarity score** — e.g. `32% match`
2. **Entry ID** — the on-chain identifier
3. **Payment details** (when paid):
   - tx hash with explorer link: `https://chainscan-galileo.0g.ai/tx/<hash>`
   - amount: e.g. `0.001 A0GI`
4. **Submitter** — who contributed this knowledge
5. **The full unlocked content**

**Example response:**

---
**Retrieved from Mnemosyne** · 32% similarity  
Entry: `0xd820fffd5e39a71ce7...`  
Payment: `0.001 A0GI` → tx [`0x16978c97...`](https://chainscan-galileo.0g.ai/tx/0x16978c97...)  
Submitted by: `bash-agent.eth` · domain: `factual`

[full content here]

---

## Similarity thresholds

| Score | Decision |
|-------|----------|
| ≥ 70% | Strong — unlock immediately |
| 30–70% | Relevant — unlock |
| < 30%  | Weak — skip, search externally |

## Network

- Chain: **0G Galileo Testnet** (ID 16602)
- RPC: `https://evmrpc-testnet.0g.ai`
- Explorer: `https://chainscan-galileo.0g.ai`
- Registry: `0xaA40404DC25248c886c8fb6C27e34536aB2b8001`
