#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Mnemosyne Agent E2E Flow
#
# Usage:
#   ./scripts/test-e2e.sh
#   API_URL=http://localhost:3000 ./scripts/test-e2e.sh
#   API_URL=https://mnemosyne-api-production-7cd6.up.railway.app ./scripts/test-e2e.sh
#
# With payment (requires `cast` from foundry + ETH on 0G Galileo testnet):
#   AGENT_PRIVATE_KEY=0x... ./scripts/test-e2e.sh
#
# What this demonstrates (the agent flow):
#   1. POST /store        → submit knowledge entry, poll for entryId
#   2. POST /query        → similarity search, agent picks top match
#   3. POST /unlock       → attempt content unlock
#      a. If 402 returned → pay on-chain with `cast send`, retry with X-Payment header
#      b. If 200 returned → content delivered (ENFORCE_PAYMENT=false testnet mode)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

API="${API_URL:-https://mnemosyne-api-production-7cd6.up.railway.app}"
AGENT="bash-agent.eth"
AGENT_KEY="${AGENT_PRIVATE_KEY:-}"

# ── Colors ──────────────────────────────────────────────────────────────────
BOLD=$(printf '\033[1m')
GREEN=$(printf '\033[32m')
CYAN=$(printf '\033[36m')
YELLOW=$(printf '\033[33m')
RED=$(printf '\033[31m')
DIM=$(printf '\033[2m')
RESET=$(printf '\033[0m')

log_step() { echo ""; echo "${BOLD}$1${RESET}"; }
log_ok()   { echo "  ${GREEN}✓${RESET} $1"; }
log_info() { echo "  ${DIM}→${RESET} $1"; }
log_warn() { echo "  ${YELLOW}⚠${RESET}  $1"; }
log_err()  { echo "  ${RED}✗${RESET} $1"; }

need() {
  if ! command -v "$1" &>/dev/null; then
    log_err "Required: $1 (install with: $2)"
    exit 1
  fi
}

need curl  "brew install curl"
need jq    "brew install jq"

# ── Poll a job until done ─────────────────────────────────────────────────
poll_job() {
  local job_id="$1"
  local timeout="${2:-300}"
  local elapsed=0
  printf "  ${DIM}polling${RESET} "
  while [ "$elapsed" -lt "$timeout" ]; do
    local resp
    resp=$(curl -sf "${API}/jobs/${job_id}" 2>/dev/null || echo '{"status":"error","error":"network"}')
    local status
    status=$(echo "$resp" | jq -r '.status')
    if [ "$status" = "done" ]; then
      printf "\n"
      echo "$resp" | jq -r '.result | @json'
      return 0
    fi
    if [ "$status" = "error" ]; then
      printf "\n"
      echo "$resp" | jq -r '.error // "unknown error"' >&2
      return 1
    fi
    printf "${DIM}.${RESET}"
    sleep 3
    elapsed=$((elapsed + 3))
  done
  printf "\n"
  echo "timeout" >&2
  return 1
}

# ── Header ───────────────────────────────────────────────────────────────────
echo ""
echo "${BOLD}━━━ Mnemosyne Agent E2E Flow ━━━${RESET}"
echo "${DIM}  API: ${API}${RESET}"
echo "${DIM}  Agent: ${AGENT}${RESET}"
if [ -n "$AGENT_KEY" ]; then
  echo "${DIM}  Payment: enabled (cast will sign on-chain tx)${RESET}"
else
  echo "${DIM}  Payment: disabled (set AGENT_PRIVATE_KEY=0x... to enable)${RESET}"
fi

# ── 0. Health check ────────────────────────────────────────────────────────
health=$(curl -sf "${API}/health" 2>/dev/null || true)
if [ -z "$health" ]; then
  log_err "API offline at ${API}"
  exit 1
fi
entries=$(echo "$health" | jq -r '.entries // 0')
log_ok "API online — ${entries} entries in cache"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 1 — Submit a knowledge entry
# ─────────────────────────────────────────────────────────────────────────────
log_step "STEP 1 — Submit knowledge entry"

KNOWLEDGE_CONTENT='# Merkle Trees in Distributed Systems

A Merkle tree is a hash tree where every leaf node contains the cryptographic hash
of a data block, and every non-leaf node contains the hash of its children.

## Key Properties
- **Data Integrity**: Any change to a leaf invalidates all hashes on the path to the root.
- **Efficient Proof**: A single branch (O(log n) hashes) proves inclusion without downloading the full dataset.
- **Tamper-Evidence**: The root hash commits to the entire dataset.

## Applications
- Bitcoin / Ethereum block headers (transaction inclusion proofs)
- Git content-addressable storage
- Certificate Transparency logs
- 0G Storage integrity verification

## Verification Algorithm
1. Hash the target leaf.
2. Walk sibling hashes up to the root.
3. Compare computed root to published root — match proves inclusion.'

PAYLOAD=$(jq -n \
  --arg content "$KNOWLEDGE_CONTENT" \
  --arg agent "$AGENT" \
  '{
    content: $content,
    domain: "factual",
    tags: ["MERKLE", "CRYPTOGRAPHY", "DISTRIBUTED-SYSTEMS", "DATA-STRUCTURES"],
    submittedBy: $agent
  }')

log_info "Submitting: Merkle Trees in Distributed Systems"
log_info "Tags: MERKLE, CRYPTOGRAPHY, DISTRIBUTED-SYSTEMS, DATA-STRUCTURES"

store_resp=$(curl -sf -X POST "${API}/store" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

job_id=$(echo "$store_resp" | jq -r '.jobId')
if [ -z "$job_id" ] || [ "$job_id" = "null" ]; then
  log_err "No jobId returned from /store"
  echo "$store_resp" | jq .
  exit 1
fi
log_info "jobId: ${DIM}${job_id}${RESET}"

stored=$(poll_job "$job_id" 300) || { log_err "Submit failed"; exit 1; }

ENTRY_ID=$(echo "$stored" | jq -r '.entryId')
STORAGE_REF=$(echo "$stored" | jq -r '.storageRef // ""')
EMBEDDING_REF=$(echo "$stored" | jq -r '.embeddingRef // ""')

log_ok "entryId:      ${CYAN}${ENTRY_ID}${RESET}"
log_ok "storageRef:   ${DIM}${STORAGE_REF:0:24}...${RESET}"
if [ -n "$EMBEDDING_REF" ] && [ "$EMBEDDING_REF" != "null" ]; then
  log_ok "embeddingRef: ${DIM}${EMBEDDING_REF:0:24}...${RESET}"
else
  log_warn "embeddingRef missing — similarity search may degrade"
fi

# ─────────────────────────────────────────────────────────────────────────────
# STEP 2 — Semantic similarity search
# ─────────────────────────────────────────────────────────────────────────────
log_step "STEP 2 — Semantic similarity query"

QUERY="How do hash trees work and how do you prove data inclusion?"
log_info "Query: \"${QUERY}\""

query_resp=$(curl -sf -X POST "${API}/query" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg q "$QUERY" --arg agent "$AGENT" \
    '{text: $q, topK: 5, queriedBy: $agent}')")

query_job_id=$(echo "$query_resp" | jq -r '.jobId')
log_info "jobId: ${DIM}${query_job_id}${RESET}"

query_result=$(poll_job "$query_job_id" 120) || { log_err "Query failed"; exit 1; }

match_count=$(echo "$query_result" | jq '.matches | length')
if [ "$match_count" -eq 0 ]; then
  log_err "No matches returned — cache empty or embeddings missing"
  exit 1
fi

echo "  ${GREEN}✓ ${match_count} match(es) returned:${RESET}"
echo ""

# Print each match
i=0
while IFS= read -r match; do
  i=$((i + 1))
  m_entry_id=$(echo "$match" | jq -r '.entryId')
  m_sim=$(echo "$match" | jq -r '.similarity')
  m_domain=$(echo "$match" | jq -r '.domain // "unknown"')
  m_tags=$(echo "$match" | jq -r '(.tags // []) | join(", ")')
  m_agent=$(echo "$match" | jq -r '.submittedBy // "—"')

  # Similarity percentage and ASCII bar
  sim_pct=$(echo "$m_sim" | awk '{printf "%.1f", $1 * 100}')
  bar_len=$(echo "$m_sim" | awk '{printf "%d", $1 * 20}')
  bar=""
  for _ in $(seq 1 "$bar_len" 2>/dev/null); do bar="${bar}█"; done
  empty_len=$((20 - bar_len))
  for _ in $(seq 1 "$empty_len" 2>/dev/null); do bar="${bar}░"; done

  is_ours=""
  [ "$m_entry_id" = "$ENTRY_ID" ] && is_ours="  ${GREEN}← our entry${RESET}"

  echo "  ${BOLD}#${i}${RESET} similarity: ${CYAN}${sim_pct}%${RESET}  ${DIM}${bar}${RESET}${is_ours}"
  echo "       entryId : ${DIM}${m_entry_id}${RESET}"
  echo "       domain  : ${m_domain}"
  echo "       tags    : ${m_tags}"
  echo "       agent   : ${m_agent}"
  echo ""
done < <(echo "$query_result" | jq -c '.matches[]')

# Agent decision: pick top match if similarity ≥ 30%
TOP_MATCH=$(echo "$query_result" | jq -c '.matches[0]')
TOP_ENTRY_ID=$(echo "$TOP_MATCH" | jq -r '.entryId')
TOP_SIM=$(echo "$TOP_MATCH" | jq -r '.similarity')
TOP_SIM_PCT=$(echo "$TOP_SIM" | awk '{printf "%.1f", $1 * 100}')

echo "  ${BOLD}Agent decision: similarity ${TOP_SIM_PCT}% — threshold 30%${RESET}"

passes=$(echo "$TOP_SIM" | awk '{print ($1 >= 0.3) ? "yes" : "no"}')
if [ "$passes" != "yes" ]; then
  log_err "Top similarity ${TOP_SIM_PCT}% below threshold — not worth unlocking"
  exit 1
fi
log_ok "Similarity above threshold → proceeding to unlock"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 3 — Unlock (pay + read)
# ─────────────────────────────────────────────────────────────────────────────
log_step "STEP 3 — Unlock content"

log_info "entryId: ${DIM}${TOP_ENTRY_ID}${RESET}"

# First attempt — no payment header
unlock_resp=$(curl -sf -o /tmp/unlock_body.json -w "%{http_code}" \
  -X POST "${API}/unlock" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg id "$TOP_ENTRY_ID" --arg agent "$AGENT" \
    '{entryId: $id, queriedBy: $agent}')" 2>/dev/null) || unlock_resp="000"

http_code=$(cat /tmp/unlock_body.json 2>/dev/null && echo "" || true)
http_code="$unlock_resp"
# Re-do properly capturing status code
unlock_http=$(curl -s -o /tmp/unlock_body.json -w "%{http_code}" \
  -X POST "${API}/unlock" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg id "$TOP_ENTRY_ID" --arg agent "$AGENT" \
    '{entryId: $id, queriedBy: $agent}')")

if [ "$unlock_http" = "402" ]; then
  echo ""
  echo "  ${BOLD}${YELLOW}402 Payment Required${RESET}"

  pay_to=$(jq -r '.x402.payTo // ""' /tmp/unlock_body.json)
  pay_amount=$(jq -r '.x402.maxAmountRequired // "1000000000000000"' /tmp/unlock_body.json)
  pay_network=$(jq -r '.x402.network // "unknown"' /tmp/unlock_body.json)

  log_info "amount   : ${pay_amount} wei ($(echo "$pay_amount" | awk '{printf "%.4f ETH", $1/1e18}'))"
  log_info "recipient: ${pay_to}"
  log_info "network  : ${pay_network}"

  if [ -z "$AGENT_KEY" ]; then
    echo ""
    log_warn "AGENT_PRIVATE_KEY not set — cannot pay automatically."
    echo "  To pay and retry manually:"
    echo ""
    echo "  ${DIM}# 1. Send ETH to the recipient (requires foundry cast)${RESET}"
    echo "  ${CYAN}cast send \\${RESET}"
    echo "  ${CYAN}  --rpc-url https://evmrpc-testnet.0g.ai \\${RESET}"
    echo "  ${CYAN}  --private-key 0xYOUR_KEY \\${RESET}"
    echo "  ${CYAN}  --value ${pay_amount} \\${RESET}"
    echo "  ${CYAN}  ${pay_to}${RESET}"
    echo ""
    echo "  ${DIM}# 2. Retry unlock with the tx hash${RESET}"
    echo "  ${CYAN}curl -X POST ${API}/unlock \\${RESET}"
    echo "  ${CYAN}  -H 'Content-Type: application/json' \\${RESET}"
    echo "  ${CYAN}  -H 'X-Payment: 0xTX_HASH' \\${RESET}"
    echo "  ${CYAN}  -d '{\"entryId\":\"${TOP_ENTRY_ID}\",\"queriedBy\":\"${AGENT}\"}' | jq .${RESET}"
    echo ""
    echo "  ${DIM}Or re-run with: AGENT_PRIVATE_KEY=0x... ./scripts/test-e2e.sh${RESET}"
    exit 0
  fi

  # ── Pay on-chain with cast ─────────────────────────────────────────────
  need cast "curl -L https://foundry.paradigm.xyz | bash && foundryup"

  echo ""
  log_info "Sending ${pay_amount} wei to ${pay_to} on 0G Galileo..."

  tx_output=$(cast send \
    --rpc-url "https://evmrpc-testnet.0g.ai" \
    --private-key "$AGENT_KEY" \
    --value "$pay_amount" \
    --json \
    "$pay_to" 2>&1) || {
    log_err "cast send failed:"
    echo "$tx_output"
    exit 1
  }

  TX_HASH=$(echo "$tx_output" | jq -r '.transactionHash // .hash // ""')
  if [ -z "$TX_HASH" ] || [ "$TX_HASH" = "null" ]; then
    log_err "Could not extract tx hash from cast output:"
    echo "$tx_output"
    exit 1
  fi

  log_ok "Payment tx: ${CYAN}${TX_HASH}${RESET}"
  log_info "Waiting for confirmation..."
  sleep 6

  # ── Retry unlock with X-Payment header ───────────────────────────────
  log_info "Retrying unlock with X-Payment: ${TX_HASH}"
  unlock_http=$(curl -s -o /tmp/unlock_body.json -w "%{http_code}" \
    -X POST "${API}/unlock" \
    -H "Content-Type: application/json" \
    -H "X-Payment: ${TX_HASH}" \
    -d "$(jq -n --arg id "$TOP_ENTRY_ID" --arg agent "$AGENT" \
      '{entryId: $id, queriedBy: $agent}')")
fi

if [ "$unlock_http" != "200" ]; then
  log_err "Unlock failed (HTTP ${unlock_http}):"
  jq . /tmp/unlock_body.json 2>/dev/null || cat /tmp/unlock_body.json
  exit 1
fi

content=$(jq -r '.content // ""' /tmp/unlock_body.json)
content_len=${#content}
submitted_by=$(jq -r '.submittedBy // "—"' /tmp/unlock_body.json)
domain=$(jq -r '.domain // "—"' /tmp/unlock_body.json)
payment_ok=$(jq -r '.paymentConfirmed // false' /tmp/unlock_body.json)

echo ""
log_ok "Content unlocked — ${content_len} chars"
log_info "submittedBy : ${submitted_by}"
log_info "domain      : ${domain}"
log_info "payment OK  : ${payment_ok}"

echo ""
echo "${BOLD}Content preview:${RESET}"
echo "$content" | head -10 | while IFS= read -r line; do
  echo "  ${DIM}│${RESET} ${line}"
done

# ── Summary ───────────────────────────────────────────────────────────────
echo ""
echo "${BOLD}━━━ E2E Result ━━━${RESET}"
log_ok "Submit    → entryId: ${ENTRY_ID}"
log_ok "Query     → similarity ${TOP_SIM_PCT}% — ranked match returned"
log_ok "Unlock    → decrypted content delivered to agent"
echo ""
echo "  ${DIM}Entry URL: https://mnemosyne-production.up.railway.app/entry/${ENTRY_ID}${RESET}"
echo ""
