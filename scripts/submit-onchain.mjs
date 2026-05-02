#!/usr/bin/env node
/**
 * submit-onchain.mjs
 * Submits seed entries directly to the MnemosyneRegistry smart contract on 0G-Galileo.
 * Reads storageRefs from .local/seed-results.json (produced by seed-demo.mjs).
 * Requires: Node 18+, ZG_PRIVATE_KEY in packages/frontend/.env.local
 * Usage: node scripts/submit-onchain.mjs
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT  = join(__dir, '..')

// ─── Load viem from pnpm store ────────────────────────────────────────────────
const VIEM = ROOT + '/node_modules/.pnpm/viem@2.48.4_bufferutil@4.1.0_typescript@6.0.3_utf-8-validate@5.0.10/node_modules/viem/_esm'

const { createPublicClient, createWalletClient, http, parseEther, encodeFunctionData } = await import(VIEM + '/index.js')
const { privateKeyToAccount } = await import(VIEM + '/accounts/index.js')

// ─── Config ───────────────────────────────────────────────────────────────────
const REGISTRY_ADDRESS = '0xaA40404DC25248c886c8fb6C27e34536aB2b8001'
const STAKE_VAULT_ADDRESS = '0x333E1BD1bA8970b11b0bFe13a6A98765788e5D71'
const MIN_STAKE = parseEther('0.005')
const RPC = 'https://evmrpc-testnet.0g.ai'
const CHAIN_ID = 16602

const DOMAIN_INDEX = {
  factual: 0,
  labeled_example: 1,
  structured_data: 2,
  observation: 3,
  correction: 4,
}

const REGISTRY_ABI = [
  {
    name: 'submit',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'storageRef', type: 'string' },
      { name: 'embeddingRef', type: 'string' },
      { name: 'tags', type: 'string[]' },
      { name: 'domain', type: 'uint8' },
    ],
    outputs: [{ name: 'entryId', type: 'bytes32' }],
  },
  {
    name: 'getTotalEntryCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
]

// ─── Colours ──────────────────────────────────────────────────────────────────
const R = '\x1b[0m', B = '\x1b[1m', G = '\x1b[32m', A = '\x1b[33m', RED = '\x1b[31m', D = '\x1b[2m', BL = '\x1b[34m'
const log = (c, ...a) => console.log(c + a.join(' ') + R)

// ─── Load seed results ────────────────────────────────────────────────────────
const seedPath = join(ROOT, '.local', 'seed-results.json')
const seedData = JSON.parse(readFileSync(seedPath, 'utf8'))
const entries = seedData.entries.filter(e => e.entryId)

log(B, `\nMnemosyne On-Chain Submission — ${entries.length} entries → ${REGISTRY_ADDRESS}\n`)

// ─── Setup viem ───────────────────────────────────────────────────────────────
// Check multiple env files
let envContent = ''
for (const envPath of [join(ROOT, '.env'), join(ROOT, '.env.local'), join(ROOT, 'packages', 'frontend', '.env.local')]) {
  try { envContent += '\n' + readFileSync(envPath, 'utf8') } catch {}
}
const pkMatch = envContent.match(/ZG_PRIVATE_KEY=([^\n]+)/)
if (!pkMatch) { log(RED, '✗ ZG_PRIVATE_KEY not found in packages/frontend/.env.local'); process.exit(1) }
const rawPk = pkMatch[1].trim()
const pk = rawPk.startsWith('0x') ? rawPk : '0x' + rawPk

const account = privateKeyToAccount(pk)
log(D, `Wallet: ${account.address}`)

const chain = { id: CHAIN_ID, name: '0G-Galileo', nativeCurrency: { name: 'A0GI', symbol: 'A0GI', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } }

const publicClient = createPublicClient({ chain, transport: http(RPC) })
const walletClient = createWalletClient({ account, chain, transport: http(RPC) })

// Check balance
const balance = await publicClient.getBalance({ address: account.address })
log(D, `Balance: ${(Number(balance) / 1e18).toFixed(4)} A0GI`)

const totalCost = MIN_STAKE * BigInt(entries.length)
if (balance < totalCost) {
  log(RED, `✗ Insufficient balance. Need ${(Number(totalCost) / 1e18).toFixed(4)} A0GI, have ${(Number(balance) / 1e18).toFixed(4)} A0GI`)
  log(A, `  Get testnet tokens: https://faucet.0g.ai`)
  process.exit(1)
}

// Check current count
const countBefore = await publicClient.readContract({
  address: REGISTRY_ADDRESS,
  abi: REGISTRY_ABI,
  functionName: 'getTotalEntryCount',
})
log(D, `Registry currently has ${countBefore} on-chain entries\n`)

// ─── Submit each entry ────────────────────────────────────────────────────────
const results = []

for (let i = 0; i < entries.length; i++) {
  const e = entries[i]
  log(BL, `\n[${i + 1}/${entries.length}] ${e.title}`)
  log(D, `  domain: ${e.domain} (${DOMAIN_INDEX[e.domain]}) · storageRef: ${e.entryId}`)

  try {
    const hash = await walletClient.writeContract({
      address: REGISTRY_ADDRESS,
      abi: REGISTRY_ABI,
      functionName: 'submit',
      args: [
        e.entryId,       // storageRef = the 0G storage hash from the API
        e.entryId,       // embeddingRef = same ref (embedding is co-located)
        e.tags,          // tags
        DOMAIN_INDEX[e.domain], // domain enum index
      ],
      value: MIN_STAKE,
    })

    log(A, `  Tx: ${hash}`)
    process.stdout.write(D + '  Waiting for confirmation' + R)

    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 })
    process.stdout.write('\n')

    if (receipt.status === 'success') {
      log(G, `  ✓ Confirmed in block ${receipt.blockNumber}`)
      results.push({ title: e.title, domain: e.domain, hash, status: 'success' })
    } else {
      log(RED, `  ✗ Transaction reverted`)
      results.push({ title: e.title, domain: e.domain, hash, status: 'reverted' })
    }
  } catch (err) {
    process.stdout.write('\n')
    log(RED, `  ✗ Failed: ${err.shortMessage ?? err.message}`)
    results.push({ title: e.title, domain: e.domain, hash: null, status: 'error', error: err.shortMessage ?? err.message })
  }

  // Small pause to avoid nonce issues
  if (i < entries.length - 1) await new Promise(r => setTimeout(r, 2000))
}

// ─── Summary ──────────────────────────────────────────────────────────────────
const ok = results.filter(r => r.status === 'success')
const bad = results.filter(r => r.status !== 'success')

const countAfter = await publicClient.readContract({
  address: REGISTRY_ADDRESS,
  abi: REGISTRY_ABI,
  functionName: 'getTotalEntryCount',
})

log(B, `\n${'─'.repeat(60)}`)
log(B, `Results: ${ok.length} on-chain, ${bad.length} failed`)
log(B, `Registry now has ${countAfter} total entries`)
log(B, `${'─'.repeat(60)}\n`)

ok.forEach(r => log(G, `✓ [${r.domain}] ${r.title}\n  ${D}${r.hash}${R}`))
if (bad.length > 0) {
  console.log()
  bad.forEach(r => log(RED, `✗ ${r.title}: ${r.error ?? r.status}`))
}

log(A, `\nOpen http://localhost:3000 to see the ${countAfter} entries in the graph.\n`)
