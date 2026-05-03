#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Mnemosyne Agent Skill — Query → Pay → Unlock
#
# Demonstrates the full agent flow:
#   1. POST /query  — find relevant knowledge by semantic similarity
#   2. POST /unlock — attempt access; get 402 if payment required
#   3. cast send    — agent pays on-chain (0G Galileo testnet)
#   4. POST /unlock — retry with X-Payment: <txHash> → get content
#
# Usage:
#   AGENT_PRIVATE_KEY=0x...  ./scripts/test-pay.sh
#   QUERY="how do rollups work" AGENT_PRIVATE_KEY=0x... ./scripts/test-pay.sh
#
# Prerequisites: curl, jq, cast (foundry)
#   Install foundry: curl -L https://foundry.paradigm.xyz | bash && foundryup
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

API="${API_URL:-https://mnemosyne-api-production-7cd6.up.railway.app}"
QUERY="${QUERY:-how do zero knowledge proofs work}"
AGENT_KEY="${AGENT_PRIVATE_KEY:-}"
RPC="https://evmrpc-testnet.0g.ai"

BOLD=$(printf '\033[1m'); GREEN=$(printf '\033[32m'); CYAN=$(printf '\033[36m')
YELLOW=$(printf '\033[33m'); RED=$(printf '\033[31m'); DIM=$(printf '\033[2m'); RESET=$(printf '\033[0m')

need() { command -v "$1" &>/dev/null || { echo "${RED}✗ need $1: $2${RESET}"; exit 1; }; }
need curl "brew install curl"
need jq   "brew install jq"

echo ""
echo "${BOLD}━━━ Mnemosyne Agent Skill ━━━${RESET}"
echo "${DIM}  API  : ${API}${RESET}"
echo "${DIM}  Query: ${QUERY}${RESET}"
echo ""

# ── STEP 1: Semantic query ─────────────────────────────────────────────────
echo "${BOLD}STEP 1 — Semantic search${RESET}"

JOB=$(curl -sf -X POST "$API/query" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg q "$QUERY" '{text:$q, topK:5, queriedBy:"agent-skill"}')" \
  | jq -r '.jobId')

echo "  ${DIM}jobId: $JOB${RESET}"
printf "  polling "

for i in $(seq 1 60); do
  R=$(curl -sf "$API/jobs/$JOB")
  S=$(echo "$R" | jq -r '.status')
  [ "$S" = "done" ] && { printf "\n"; RESULT="$R"; break; }
  [ "$S" = "error" ] && { printf "\n"; echo "${RED}✗ $(echo "$R" | jq -r '.error')${RESET}"; exit 1; }
  printf "${DIM}.${RESET}"; sleep 3
done

MATCHES=$(echo "$RESULT" | jq '.result.matches | length')
[ "$MATCHES" -eq 0 ] && { echo "${RED}✗ no matches${RESET}"; exit 1; }

echo "  ${GREEN}✓ ${MATCHES} match(es) found${RESET}"
echo ""

echo "$RESULT" | jq -r '.result.matches[] | "  \(.similarity * 100 | floor)%  \(.entryId[:24])...  \(.domain // "?")  [\(.tags // [] | join(", "))]"'

echo ""
TOP_ID=$(echo "$RESULT" | jq -r '.result.matches[0].entryId')
TOP_SIM=$(echo "$RESULT" | jq -r '.result.matches[0].similarity * 100 | floor')
echo "  ${BOLD}→ Top match: ${CYAN}${TOP_SIM}%${RESET} similarity — ${DIM}${TOP_ID}${RESET}"

if [ "$TOP_SIM" -lt 30 ]; then
  echo "  ${YELLOW}⚠  Below 30% threshold — no value in unlocking${RESET}"
  exit 0
fi

# ── STEP 2: Attempt unlock ─────────────────────────────────────────────────
echo ""
echo "${BOLD}STEP 2 — Unlock content${RESET}"

HTTP=$(curl -s -o /tmp/mn_unlock.json -w "%{http_code}" \
  -X POST "$API/unlock" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg id "$TOP_ID" '{entryId:$id, queriedBy:"agent-skill"}')")

if [ "$HTTP" = "200" ]; then
  echo "  ${GREEN}✓ Access granted (ENFORCE_PAYMENT=false — no payment needed)${RESET}"
  jq '{domain, submittedBy, paymentConfirmed, contentLength: (.content|length)}' /tmp/mn_unlock.json
  echo ""; echo "${BOLD}Content:${RESET}"
  jq -r '.content' /tmp/mn_unlock.json | head -15 | while IFS= read -r line; do echo "  ${DIM}│${RESET} $line"; done
  exit 0
fi

if [ "$HTTP" != "402" ]; then
  echo "  ${RED}✗ Unexpected HTTP $HTTP${RESET}"
  jq . /tmp/mn_unlock.json
  exit 1
fi

# ── 402 Payment Required ───────────────────────────────────────────────────
PAY_TO=$(jq -r '.x402.payTo' /tmp/mn_unlock.json)
PAY_WEI=$(jq -r '.x402.maxAmountRequired' /tmp/mn_unlock.json)
PAY_ETH=$(echo "$PAY_WEI" | awk '{printf "%.6f", $1/1e18}')
NETWORK=$(jq -r '.x402.network' /tmp/mn_unlock.json)

echo "  ${YELLOW}402 Payment Required${RESET}"
echo "  ${DIM}network : $NETWORK${RESET}"
echo "  ${DIM}payTo   : $PAY_TO${RESET}"
echo "  ${DIM}amount  : $PAY_WEI wei ($PAY_ETH A0GI)${RESET}"

if [ -z "$AGENT_KEY" ]; then
  echo ""
  echo "  ${YELLOW}Set AGENT_PRIVATE_KEY to pay automatically, or pay manually:${RESET}"
  echo ""
  echo "  ${CYAN}# 1. Send payment on 0G Galileo${RESET}"
  echo "  cast send --rpc-url $RPC --private-key 0xYOUR_KEY --value $PAY_WEI $PAY_TO"
  echo ""
  echo "  ${CYAN}# 2. Retry unlock with tx hash${RESET}"
  echo "  curl -X POST $API/unlock \\"
  echo "    -H 'Content-Type: application/json' \\"
  echo "    -H 'X-Payment: 0xTX_HASH' \\"
  echo "    -d '{\"entryId\":\"$TOP_ID\",\"queriedBy\":\"agent-skill\"}' | jq .content"
  exit 0
fi

# ── STEP 3: Pay on-chain ───────────────────────────────────────────────────
need cast "curl -L https://foundry.paradigm.xyz | bash && foundryup"

echo ""
echo "${BOLD}STEP 3 — Send payment on-chain${RESET}"
echo "  ${DIM}Sending $PAY_ETH A0GI → $PAY_TO${RESET}"

TX_OUT=$(cast send \
  --rpc-url "$RPC" \
  --private-key "$AGENT_KEY" \
  --value "$PAY_WEI" \
  --json \
  "$PAY_TO" 2>&1)

TX_HASH=$(echo "$TX_OUT" | jq -r '.transactionHash // .hash // ""' 2>/dev/null)

if [ -z "$TX_HASH" ] || [ "$TX_HASH" = "null" ]; then
  echo "  ${RED}✗ cast send failed:${RESET}"
  echo "$TX_OUT"
  exit 1
fi

echo "  ${GREEN}✓ tx broadcast: ${CYAN}${TX_HASH}${RESET}"
echo "  ${DIM}explorer: https://chainscan-galileo.0g.ai/tx/${TX_HASH}${RESET}"
echo "  ${DIM}waiting for confirmation...${RESET}"
sleep 8

# ── STEP 4: Retry unlock with X-Payment ───────────────────────────────────
echo ""
echo "${BOLD}STEP 4 — Retry unlock with X-Payment header${RESET}"

HTTP2=$(curl -s -o /tmp/mn_unlock2.json -w "%{http_code}" \
  -X POST "$API/unlock" \
  -H "Content-Type: application/json" \
  -H "X-Payment: $TX_HASH" \
  -d "$(jq -n --arg id "$TOP_ID" '{entryId:$id, queriedBy:"agent-skill"}')")

if [ "$HTTP2" != "200" ]; then
  echo "  ${RED}✗ HTTP $HTTP2${RESET}"
  jq . /tmp/mn_unlock2.json
  exit 1
fi

echo "  ${GREEN}✓ Payment verified — content unlocked${RESET}"
jq '{domain, submittedBy, paymentConfirmed, paymentTx, contentLength: (.content|length)}' /tmp/mn_unlock2.json
echo ""
echo "${BOLD}Content:${RESET}"
jq -r '.content' /tmp/mn_unlock2.json | head -15 | while IFS= read -r line; do
  echo "  ${DIM}│${RESET} $line"
done

echo ""
echo "${BOLD}━━━ Done ━━━${RESET}"
echo "  ${GREEN}✓ Query     → ${TOP_SIM}% similarity match${RESET}"
echo "  ${GREEN}✓ Payment   → ${TX_HASH:0:20}...${RESET}"
echo "  ${GREEN}✓ Unlock    → content delivered to agent${RESET}"
echo ""
