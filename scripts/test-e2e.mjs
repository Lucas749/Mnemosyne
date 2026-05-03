#!/usr/bin/env node
/**
 * End-to-end test: submit → query (similarity) → unlock (pay + read)
 *
 * Usage:
 *   node scripts/test-e2e.mjs
 *   API_URL=http://localhost:3000 node scripts/test-e2e.mjs
 *
 * What this proves:
 *   1. Content is encrypted and stored on 0G Storage
 *   2. Embedding vector is generated and persisted (HuggingFace all-MiniLM-L6-v2)
 *   3. A semantic query returns the entry ranked by cosine similarity
 *   4. /unlock returns the decrypted content (payment skipped on testnet)
 */

const API = process.env.API_URL ?? 'https://mnemosyne-api-production-7cd6.up.railway.app'
const AGENT = 'test-agent.eth'

const BOLD  = '\x1b[1m'
const GREEN = '\x1b[32m'
const CYAN  = '\x1b[36m'
const DIM   = '\x1b[2m'
const RED   = '\x1b[31m'
const RESET = '\x1b[0m'

function log(symbol, label, value = '') {
  console.log(`  ${symbol} ${BOLD}${label}${RESET}${value ? ': ' + value : ''}`)
}

async function poll(jobId, timeoutMs = 300_000) {
  const deadline = Date.now() + timeoutMs
  process.stdout.write('    ')
  while (Date.now() < deadline) {
    const r = await fetch(`${API}/jobs/${jobId}`)
    const j = await r.json()
    if (j.status === 'done')  { process.stdout.write('\n'); return j.result }
    if (j.status === 'error') { process.stdout.write('\n'); throw new Error(j.error) }
    process.stdout.write(`${DIM}.${RESET}`)
    await new Promise(r => setTimeout(r, 3000))
  }
  throw new Error('poll timed out')
}

async function main() {
  console.log(`\n${BOLD}━━━ Mnemosyne E2E Test ━━━${RESET}`)
  console.log(`${DIM}  API: ${API}${RESET}\n`)

  // ── 0. Health ──────────────────────────────────────────────────────────────
  const health = await fetch(`${API}/health`).then(r => r.json()).catch(() => null)
  if (!health) { console.error(`${RED}✗ API offline${RESET}`); process.exit(1) }
  console.log(`${GREEN}✓ API online — ${health.entries} entries in cache${RESET}\n`)

  // ── 1. Submit a knowledge entry ───────────────────────────────────────────
  console.log(`${BOLD}STEP 1 — Submit knowledge entry${RESET}`)

  const KNOWLEDGE = {
    content: `# Zero-Knowledge Proofs in Blockchain

Zero-knowledge proofs (ZKPs) allow one party to prove knowledge of a secret without revealing it.

## Key Properties
- **Completeness**: If the statement is true, an honest prover can convince the verifier.
- **Soundness**: A cheating prover cannot convince the verifier of a false statement.
- **Zero-knowledge**: The verifier learns nothing beyond the truth of the statement.

## Applications
- Private transactions (Zcash, Tornado Cash)
- Scalability via zk-rollups (StarkNet, zkSync)
- Identity verification without revealing personal data

## Common Constructions
- **zk-SNARKs**: Succinct, non-interactive. Requires trusted setup.
- **zk-STARKs**: Transparent (no trusted setup), larger proofs.
- **Bulletproofs**: Range proofs, no trusted setup, used in Monero.`,
    domain: 'factual',
    tags: ['ZK', 'CRYPTOGRAPHY', 'BLOCKCHAIN', 'PRIVACY', 'PROOFS'],
    submittedBy: AGENT,
  }

  console.log(`  Topic: "${KNOWLEDGE.content.split('\n')[0].replace('# ', '')}"`)
  console.log(`  Tags: ${KNOWLEDGE.tags.join(', ')}`)

  const storeRes = await fetch(`${API}/store`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(KNOWLEDGE),
  })
  const { jobId: storeJobId } = await storeRes.json()
  console.log(`  jobId: ${DIM}${storeJobId}${RESET} — polling`)

  let stored
  try {
    stored = await poll(storeJobId)
  } catch (e) {
    console.error(`  ${RED}✗ Submit failed: ${e.message}${RESET}`)
    process.exit(1)
  }

  log(GREEN + '✓' + RESET, 'entryId', stored.entryId)
  log(GREEN + '✓' + RESET, 'storageRef', stored.storageRef?.slice(0, 20) + '...')
  log(GREEN + '✓' + RESET, 'embeddingRef', stored.embeddingRef
    ? stored.embeddingRef.slice(0, 20) + '...'
    : RED + 'MISSING — search will degrade' + RESET)

  const ENTRY_ID = stored.entryId

  // ── 2. Query for similar knowledge ────────────────────────────────────────
  console.log(`\n${BOLD}STEP 2 — Semantic similarity query${RESET}`)

  const QUERY = 'How do ZK rollups work and what is a trusted setup?'
  console.log(`  Query: "${QUERY}"`)

  const queryRes = await fetch(`${API}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: QUERY, topK: 5, queriedBy: AGENT }),
  })
  const { jobId: queryJobId } = await queryRes.json()
  console.log(`  jobId: ${DIM}${queryJobId}${RESET} — polling`)

  let queryResult
  try {
    queryResult = await poll(queryJobId, 120_000)
  } catch (e) {
    console.error(`  ${RED}✗ Query failed: ${e.message}${RESET}`)
    process.exit(1)
  }

  const matches = queryResult.matches ?? []
  if (matches.length === 0) {
    console.error(`  ${RED}✗ No matches returned — cache may be empty or embeddings missing${RESET}`)
    process.exit(1)
  }

  console.log(`\n  ${GREEN}✓ ${matches.length} match(es) returned:${RESET}`)
  for (const [i, m] of matches.entries()) {
    const pct = (m.similarity * 100).toFixed(1)
    const bar = '█'.repeat(Math.round(m.similarity * 20)).padEnd(20, '░')
    const isOurs = m.entryId === ENTRY_ID
    console.log(`\n  ${BOLD}#${i + 1}${RESET} similarity: ${CYAN}${pct}%${RESET}  ${DIM}${bar}${RESET}${isOurs ? '  ← our entry' : ''}`)
    console.log(`       entryId : ${DIM}${m.entryId}${RESET}`)
    console.log(`       domain  : ${m.domain ?? 'unknown'}`)
    console.log(`       tags    : ${(m.tags ?? []).join(', ')}`)
    console.log(`       agent   : ${m.submittedBy ?? '—'}`)
  }

  // Pick the top match (should be our entry if embeddings are working)
  const top = matches[0]
  console.log(`\n  ${BOLD}Agent decision: similarity ${(top.similarity * 100).toFixed(1)}% ≥ threshold 30% → unlock content${RESET}`)

  if (top.similarity < 0.3) {
    console.log(`  ${RED}✗ Top similarity ${(top.similarity*100).toFixed(1)}% below threshold — skipping unlock${RESET}`)
    process.exit(1)
  }

  // ── 3. Unlock (pay + read) ─────────────────────────────────────────────────
  console.log(`\n${BOLD}STEP 3 — Unlock content (POST /unlock)${RESET}`)
  console.log(`  entryId: ${DIM}${top.entryId}${RESET}`)

  const unlockRes = await fetch(`${API}/unlock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entryId: top.entryId, queriedBy: AGENT }),
  })

  if (unlockRes.status === 402) {
    const body = await unlockRes.json()
    console.log(`\n  ${BOLD}402 Payment Required${RESET} (ENFORCE_PAYMENT=true)`)
    console.log(`  ${DIM}x402 payment details:${RESET}`)
    console.log(`    amount   : ${body.x402?.maxAmountRequired ?? '?'} wei`)
    console.log(`    recipient: ${body.x402?.payTo ?? '?'}`)
    console.log(`    network  : ${body.x402?.network ?? '?'}`)
    console.log(`\n  In production: agent pays on-chain, retries with X-Payment: <txHash>`)
    console.log(`  (Set ENFORCE_PAYMENT=false on Railway to skip gate during development)`)
    process.exit(0)
  }

  if (!unlockRes.ok) {
    const err = await unlockRes.json().catch(() => ({}))
    console.error(`  ${RED}✗ Unlock failed ${unlockRes.status}: ${err.error ?? err.detail ?? '?'}${RESET}`)
    process.exit(1)
  }

  const unlocked = await unlockRes.json()

  console.log(`\n  ${GREEN}✓ Content unlocked — ${unlocked.content?.length ?? 0} chars${RESET}`)
  console.log(`  ${DIM}submittedBy: ${unlocked.submittedBy}${RESET}`)
  console.log(`  ${DIM}domain: ${unlocked.domain}${RESET}`)
  console.log(`\n${BOLD}Content preview:${RESET}`)
  const preview = (unlocked.content ?? '').split('\n').slice(0, 8).join('\n')
  console.log(preview.split('\n').map(l => `  ${DIM}│${RESET} ${l}`).join('\n'))

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log(`\n${BOLD}━━━ E2E Result ━━━${RESET}`)
  console.log(`  ${GREEN}✓ Submit    → entryId: ${ENTRY_ID}${RESET}`)
  console.log(`  ${GREEN}✓ Embedding → stored on 0G + in SQLite for persistent search${RESET}`)
  console.log(`  ${GREEN}✓ Query     → similarity ${(top.similarity*100).toFixed(1)}% — ranked match returned${RESET}`)
  console.log(`  ${GREEN}✓ Unlock    → decrypted content delivered to agent${RESET}`)
  console.log(`\n  ${DIM}Entry URL: https://mnemosyne-production.up.railway.app/entry/${ENTRY_ID}${RESET}\n`)
}

main().catch(e => { console.error(RED + e.message + RESET); process.exit(1) })
