/**
 * Mnemosyne Demo — end-to-end agent memory loop
 *
 * Demonstrates:
 *   1. Storing facts to 0G Storage + on-chain stake (MnemosyneRegistry)
 *   2. Semantic query with cosine ranking
 *   3. Agent answering a question using only retrieved memory
 *   4. Cross-agent knowledge discovery via ENS (load-from-ens)
 *   5. Royalty deposit into RoyaltyVault on every query
 *
 * Prerequisites:
 *   cd packages/api && pnpm start    # starts the API on :3000
 *
 * Run:
 *   pnpm --filter @mnemosyne/example-agent demo
 *   # or: MNEMOSYNE_API_URL=http://... pnpm demo
 */

import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(__dirname, '../../.env') })

const API = (process.env.MNEMOSYNE_API_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const AGENT_ENS = process.env.MNEMOSYNE_ENS ?? 'demo.mnemosyne.eth'

// ─── helpers ─────────────────────────────────────────────────────────────────

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText)
    throw new Error(`${method} ${path} → ${res.status}: ${err}`)
  }
  return res.json() as Promise<Record<string, unknown>>
}

function bar(n = 60) { return '─'.repeat(n) }

function formatSimilarity(s: number) {
  const pct = Math.round(s * 100)
  const label = pct >= 80 ? 'HIGH' : pct >= 50 ? 'HINT' : 'WEAK'
  return `${pct}% [${label}]`
}

// ─── demo facts ──────────────────────────────────────────────────────────────

const FACTS = [
  {
    content: 'The Ethereum merge (transition from PoW to PoS) occurred on September 15, 2022 at epoch 144896.',
    tags: ['ethereum', 'consensus', 'history'],
  },
  {
    content: 'Bitcoin has a hard-capped maximum supply of 21 million BTC, with the last coin expected around year 2140.',
    tags: ['bitcoin', 'supply', 'economics'],
  },
  {
    content: 'The 0G network is a decentralized AI operating system providing storage, compute, and a DA layer for AI workloads.',
    tags: ['0g', 'infrastructure', 'ai'],
  },
  {
    content: 'Uniswap v3 introduced concentrated liquidity, allowing LPs to provide liquidity within custom price ranges.',
    tags: ['uniswap', 'defi', 'amm'],
  },
]

const QUESTIONS = [
  'When did Ethereum switch to proof of stake?',
  'What is the maximum supply of Bitcoin?',
  'What does 0G provide for AI applications?',
]

// ─── steps ───────────────────────────────────────────────────────────────────

async function checkHealth() {
  const health = await api('GET', '/health')
  console.log(`API  ${API}   entries in cache: ${health.entries}`)
}

async function teachAgent(): Promise<string[]> {
  console.log(`\nSubmitter: ${AGENT_ENS}\n`)
  const ids: string[] = []

  for (const fact of FACTS) {
    const result = await api('POST', '/store', {
      content: fact.content,
      domain: 'factual',
      tags: fact.tags,
      submittedBy: AGENT_ENS,
    }) as Record<string, string>

    ids.push(result.entryId)
    const onchain = result.onchainId ? `  onchain: ${result.onchainId.slice(0, 18)}...` : ''
    console.log(`  stored  ${result.entryId.slice(0, 20)}...${onchain}`)
    console.log(`          "${fact.content.slice(0, 70)}..."`)
  }

  return ids
}

async function queryMemory() {
  for (const q of QUESTIONS) {
    console.log(`\n  Q: "${q}"`)
    const result = await api('POST', '/query', { text: q, topK: 3 }) as { matches: any[] }
    const matches = result.matches ?? []

    if (matches.length === 0) {
      console.log('     no matches')
      continue
    }

    for (const m of matches) {
      const conf = formatSimilarity(m.similarity)
      console.log(`     ${conf}  "${m.content.slice(0, 75)}..."`)
    }

    // Agent answer: use top match if high confidence
    const top = matches[0]
    if (top && top.similarity >= 0.7) {
      console.log(`\n  Agent: Based on verified memory — ${top.content}`)
    } else if (top && top.similarity >= 0.45) {
      console.log(`\n  Agent: Possibly relevant — "${top.content.slice(0, 80)}..." (low confidence)`)
    } else {
      console.log(`\n  Agent: No high-confidence memory found for this question.`)
    }
  }
}

async function ensDiscovery() {
  const source = 'agent.mnemosyne.eth'
  console.log(`\n  Resolving memory.index for ${source} via ENS (Sepolia)...`)
  try {
    const result = await api('GET', `/load-from-ens/${source}`) as any
    console.log(`  Loaded ${result.loaded} entries from ${source} into local cache`)
    console.log(`  manifest: ${result.manifestRef?.slice(0, 40)}...`)
    console.log(`  Total cache size: ${result.total}`)
  } catch (err: any) {
    if (err.message?.includes('404')) {
      console.log(`  No memory.index set for ${source} yet — store entries with submittedBy: "${source}" first`)
    } else {
      console.log(`  ENS lookup: ${err.message}`)
    }
  }
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(bar())
  console.log('Mnemosyne Demo — Decentralized AI Agent Memory')
  console.log(bar())

  console.log('\n[1/4] Health check')
  await checkHealth()

  console.log('\n[2/4] Teaching the agent — storing facts to 0G + staking on-chain')
  console.log(bar(40))
  await teachAgent()

  console.log('\n[3/4] Querying — agent answers using only retrieved memory')
  console.log(bar(40))
  await queryMemory()

  console.log('\n[4/4] Cross-agent discovery via ENS')
  console.log(bar(40))
  await ensDiscovery()

  console.log(`\n${bar()}`)
  console.log('Demo complete.')
  console.log('  Facts are stored on 0G Storage (permanent, content-addressed)')
  console.log('  Each fact is staked on MnemosyneRegistry (on-chain, 0G testnet)')
  console.log('  Every query deposits a fee into RoyaltyVault → distributes via Uniswap')
  console.log('  ENS memory.index points to the 0G manifest for cross-agent discovery')
  console.log(bar())
}

main().catch(err => {
  if (err.message?.includes('ECONNREFUSED') || err.message?.includes('fetch failed')) {
    console.error('\nAPI not reachable. Start it first:')
    console.error('  cd packages/api && pnpm start')
  } else {
    console.error(err.message)
  }
  process.exit(1)
})
