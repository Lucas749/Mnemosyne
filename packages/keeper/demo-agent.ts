/**
 * Mnemosyne × KeeperHub — Agentic Demo
 *
 * Shows the full autonomous agent lifecycle:
 *   1. Agent stores a knowledge entry in Mnemosyne
 *   2. Polls KeeperHub keeper status until challenge window passes
 *   3. Agent triggers iNFT activation via /keeper/activate-pending
 *   4. Agent queries the brain — receives similarity scores (no content yet)
 *   5. Agent unlocks high-confidence entry — x402 payment issued, content returned
 *   6. Agent triggers royalty distribution via KeeperHub
 *
 * Run: npx ts-node packages/keeper/demo-agent.ts
 */

const API = process.env.MNEMOSYNE_API_URL ?? 'https://mnemosyne-api-production-7cd6.up.railway.app'
const AGENT_ENS = process.env.MNEMOSYNE_ENS ?? 'demo.mnemosyne.eth'

async function post(path: string, body: unknown = {}) {
  const r = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return r.json()
}

async function get(path: string) {
  const r = await fetch(`${API}${path}`)
  return r.json()
}

async function poll(jobId: string, label: string): Promise<unknown> {
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 3000))
    const job = await get(`/jobs/${jobId}`) as { status: string; result?: unknown; error?: string }
    process.stdout.write(`\r  ${label}: ${job.status}...`)
    if (job.status === 'done') { process.stdout.write('\n'); return job.result }
    if (job.status === 'error') throw new Error(job.error)
  }
  throw new Error('job timed out')
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  console.log('\n══════════════════════════════════════════')
  console.log(' Mnemosyne × KeeperHub — Agentic Demo')
  console.log('══════════════════════════════════════════\n')

  // ── Step 1: Store knowledge ────────────────────────────────────────────────
  console.log('[1] Storing knowledge entry...')
  const storeJob = await post('/store', {
    content: '# ERC-7857 iNFT Standard\n\nThe ERC-7857 iNFT standard enables AI agents to be tokenized with encrypted metadata and authorized usage without ownership transfer. Royalties flow to the current owner on every query.',
    domain: 'factual',
    tags: ['erc-7857', 'inft', '0g', 'ai-agents'],
    submittedBy: AGENT_ENS,
  }) as { jobId: string }

  const stored = await poll(storeJob.jobId, 'storing') as { entryId: string }
  const entryId = stored.entryId
  console.log(`  entryId: ${entryId}`)

  // ── Step 2: Poll keeper status until ready ─────────────────────────────────
  console.log('\n[2] Polling keeper status (waiting for challenge window)...')
  console.log('  (In production, KeeperHub runs this on a 5-min schedule autonomously)')

  let ready = false
  for (let i = 0; i < 20; i++) {
    await sleep(30_000)
    const status = await get('/keeper/status') as { readyToActivate: number }
    console.log(`  readyToActivate: ${status.readyToActivate}`)
    if (status.readyToActivate > 0) { ready = true; break }
  }

  if (!ready) {
    console.log('  Challenge window not passed yet — in production KeeperHub activates automatically.')
    console.log('  Continuing demo without activation...\n')
  }

  // ── Step 3: Activate via keeper endpoint (what KeeperHub workflow calls) ───
  if (ready) {
    console.log('\n[3] Triggering iNFT activation (KeeperHub workflow: activate-pending)...')
    const activation = await post('/keeper/activate-pending') as { activated: number; results: Array<{ inftTokenId: string }> }
    if (activation.activated > 0) {
      console.log(`  Activated ${activation.activated} iNFT(s)`)
      console.log(`  Token IDs: ${activation.results.map((r) => r.inftTokenId).join(', ')}`)
    } else {
      console.log('  Nothing to activate yet')
    }
  }

  // ── Step 4: Query — discovery phase (free, no content) ────────────────────
  console.log('\n[4] Querying brain (discovery — no content yet)...')
  const queryJob = await post('/query', {
    text: 'What is the ERC-7857 iNFT standard?',
    topK: 3,
    queriedBy: AGENT_ENS,
  }) as { jobId: string }

  const queryResult = await poll(queryJob.jobId, 'querying') as {
    matches: Array<{ entryId: string; similarity: number; submittedBy?: string; hasContent: boolean }>
  }

  console.log(`  ${queryResult.matches.length} match(es):`)
  for (const m of queryResult.matches) {
    console.log(`  [${m.similarity.toFixed(3)}] ${m.entryId.slice(0, 20)}... by ${m.submittedBy ?? 'unknown'} (content: ${m.hasContent ? 'locked' : 'n/a'})`)
  }

  // ── Step 5: Unlock best match — x402 payment ──────────────────────────────
  const best = queryResult.matches[0]
  if (best && best.similarity > 0.5 && best.hasContent) {
    console.log(`\n[5] Unlocking entry ${best.entryId.slice(0, 20)}... (similarity: ${best.similarity.toFixed(3)})`)
    console.log('  Paying royalty via /unlock (x402 protocol)...')

    const unlock = await post('/unlock', {
      entryId: best.entryId,
      queriedBy: AGENT_ENS,
    }) as { content?: string; paymentConfirmed: boolean; paymentTx?: string }

    console.log(`  Payment confirmed: ${unlock.paymentConfirmed}`)
    if (unlock.content) {
      console.log(`  Content preview: ${unlock.content.slice(0, 120)}...`)
    }
  } else {
    console.log('\n[5] No high-confidence match to unlock (similarity too low or entry not yet in cache)')
  }

  // ── Step 6: Trigger royalty distribution via KeeperHub endpoint ────────────
  console.log('\n[6] Triggering royalty distribution (KeeperHub workflow: weekly-distribution)...')
  const dist = await post('/keeper/distribute') as { distributed: number }
  console.log(`  Distributed to ${dist.distributed} contributor(s) via Uniswap`)

  console.log('\n══════════════════════════════════════════')
  console.log(' Demo complete')
  console.log('══════════════════════════════════════════')
  console.log(`
KeeperHub integration points demonstrated:
  ✓ GET  /keeper/status           — agent checks pending activations
  ✓ POST /keeper/activate-pending — agent triggers iNFT minting (KeeperHub schedule)
  ✓ POST /keeper/distribute       — agent triggers royalty payout (KeeperHub weekly cron)
  ✓ POST /unlock                  — x402 payment: 402 response → agent pays → content unlocked

In production:
  • KeeperHub runs activate-pending every 5 minutes (workflow: activate-pending.json)
  • KeeperHub runs distribute every Sunday (workflow: weekly-distribution.json)
  • Agents with KeeperHub MCP can trigger these conversationally
  • ENFORCE_PAYMENT=true enables hard x402 gate — agents pay autonomously via kh execute transfer
`)
}

main().catch((err) => { console.error(err); process.exit(1) })
