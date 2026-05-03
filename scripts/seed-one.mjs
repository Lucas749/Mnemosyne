#!/usr/bin/env node
/**
 * Seed a single well-formed entry submitted as mnemosyne.eth.
 *
 * What this proves end-to-end:
 *   1. Content encrypted + uploaded to 0G Storage (turbo indexer)
 *   2. Stored on-chain in MnemosyneRegistry → unique bytes32 entryId via simulateContract
 *   3. DB indexed with the real on-chain entryId
 *   4. mnemosyne.eth text record "memory.index" updated on Sepolia ENS → 0G manifest
 *   5. Anyone can: resolve ENS → read manifest → discover all entries by this agent
 *
 * Usage:
 *   node scripts/seed-one.mjs
 *   API_URL=http://localhost:3000 node scripts/seed-one.mjs
 */

const API = process.env.API_URL ?? 'https://mnemosyne-api-production-7cd6.up.railway.app'

const ENTRY = {
  content: `# Mnemosyne Knowledge Protocol

Mnemosyne is a decentralized, on-chain knowledge protocol built on the 0G blockchain.

## Core Concepts

- **Entries** are knowledge units stored on 0G Storage and registered on-chain via \`MnemosyneRegistry\`
- **iNFTs** (intelligent NFTs) are minted per entry after the challenge window passes — they carry royalty streams
- **Agents** query entries via the protocol and pay micro-fees; fees flow to the staker/owner of the iNFT
- **Challenges** allow any participant to dispute an entry within the challenge window (~5 min on testnet)

## Data Flow

1. Agent submits markdown content → API encrypts with AES-256-GCM, uploads to 0G Storage
2. \`submit(storageRef, embeddingRef, tags, domain)\` is called on-chain with a 0.005 A0GI stake
3. The contract stores the entry and emits \`EntrySubmitted\` — the on-chain ID is the canonical key
4. After the challenge window, \`activateEntry(entryId)\` mints an iNFT to the submitter
5. Queries pay a royalty via the RoyaltyVault contract; iNFT owner can claim accumulated fees

## ENS Integration

The submitting agent's ENS name (e.g. \`mnemosyne.eth\`) stores a \`memory.index\` text record
pointing to a 0G manifest — a linked list of all entries this agent has submitted.
Any other agent can bootstrap its knowledge by resolving the ENS name and loading the manifest.

## Contracts (0G-Galileo Testnet)

| Contract            | Address                                      |
|---------------------|----------------------------------------------|
| MnemosyneRegistry   | \`0xaA40404DC25248c886c8fb6C27e34536aB2b8001\` |
| MnemosyneINFT       | \`0x8fbDb7666F8D301d9C974982764ab1B39917cc82\` |
| MnemosyneMarket     | \`0x8fADa38137C0407800c0320BBf6985D08016E8A3\` |
| RoyaltyVault        | \`0x4ad5B6a01CDCAcaC31Ce89e9B6e92EB5c8207507\` |
`,
  domain: 'factual',
  tags: ['MNEMOSYNE', 'PROTOCOL', 'OVERVIEW', 'KNOWLEDGE', 'ENS'],
  submittedBy: 'mnemosyne.eth',
}

async function poll(jobId, timeout = 120_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const r = await fetch(`${API}/jobs/${jobId}`)
    const j = await r.json()
    if (j.status === 'done') return j.result
    if (j.status === 'error') throw new Error(j.error)
    process.stdout.write('.')
    await new Promise(r => setTimeout(r, 3000))
  }
  throw new Error('timed out')
}

async function main() {
  console.log(`\n\x1b[1mMnemosyne Single Seed → ${API}\x1b[0m`)

  // Health check
  const health = await fetch(`${API}/health`).then(r => r.json()).catch(() => null)
  if (!health) { console.error('API offline'); process.exit(1) }
  console.log(`\x1b[32m✓ API online — ${health.entries} existing entries\x1b[0m\n`)

  console.log(`Submitting: "${ENTRY.content.split('\n')[0].replace(/^# /, '')}"`)
  console.log(`  domain: ${ENTRY.domain} · submitter: \x1b[33m${ENTRY.submittedBy}\x1b[0m`)
  console.log(`  tags: ${ENTRY.tags.join(', ')}\n`)

  // POST /store
  const res = await fetch(`${API}/store`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ENTRY),
  })
  const { jobId } = await res.json()
  console.log(`jobId: ${jobId} — polling`)
  process.stdout.write('  ')

  let result
  try {
    result = await poll(jobId)
  } catch (e) {
    console.log(`\n\x1b[31m✗ Failed: ${e.message}\x1b[0m`)
    process.exit(1)
  }

  console.log(`\n\n\x1b[32m✓ entryId: ${result.entryId}\x1b[0m`)
  console.log(`  storageRef:   ${result.storageRef}`)
  console.log(`  embeddingRef: ${result.embeddingRef}`)
  if (result.manifestRef) {
    console.log(`\n\x1b[33m✓ ENS memory.index updated\x1b[0m`)
    console.log(`  manifestRef: ${result.manifestRef}`)
    console.log(`  mnemosyne.eth text(memory.index) = ${result.manifestRef}`)
    const loadCheck = await fetch(`${API}/load-from-ens/mnemosyne.eth`).then(r => r.json()).catch(() => null)
    if (loadCheck?.error) {
      console.log(`\x1b[31m✗ ENS bootstrap check failed: ${loadCheck.error}\x1b[0m`)
    } else {
      console.log(`\x1b[32m✓ ENS bootstrap check passed: loaded ${loadCheck?.loaded ?? 0}\x1b[0m`)
    }
  } else {
    console.log(`\n\x1b[33m⚠  manifestRef missing — ENS update may have failed or ENS_PRIVATE_KEY not set\x1b[0m`)
  }

  console.log(`\n\x1b[1m────────────────────────────────────────────────────────────\x1b[0m`)
  console.log(`Entry URL: https://mnemosyne-production.up.railway.app/entry/${result.entryId}`)
  console.log(`API content: ${API}/content/${result.entryId}`)
  console.log(`ENS: https://sepolia.app.ens.domains/mnemosyne.eth`)
  console.log(`\x1b[1m────────────────────────────────────────────────────────────\x1b[0m\n`)
}

main().catch(e => { console.error(e); process.exit(1) })
