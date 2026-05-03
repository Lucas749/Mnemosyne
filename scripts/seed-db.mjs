#!/usr/bin/env node
/**
 * Fetches all on-chain entries, hits /content/:entryId on the API so they get saved to SQLite.
 * Usage: node scripts/seed-db.mjs
 */

import { createPublicClient, http } from '../node_modules/.pnpm/viem@2.48.4_bufferutil@4.1.0_typescript@5.9.3_utf-8-validate@5.0.10/node_modules/viem/_esm/index.js'

const API = process.env.API_URL ?? 'https://mnemosyne-api-production-7cd6.up.railway.app'
const ZG_RPC = 'https://evmrpc-testnet.0g.ai'
const REGISTRY = '0xaA40404DC25248c886c8fb6C27e34536aB2b8001'

const zgTestnet = { id: 16602, name: '0G-Galileo', nativeCurrency: { name: 'A0GI', symbol: 'A0GI', decimals: 18 }, rpcUrls: { default: { http: [ZG_RPC] } } }

const REGISTRY_ABI = [
  { name: 'getTotalEntryCount', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'getAllEntries', type: 'function', stateMutability: 'view', inputs: [{ name: 'offset', type: 'uint256' }, { name: 'limit', type: 'uint256' }], outputs: [{ type: 'bytes32[]' }] },
]

async function main() {
  const pub = createPublicClient({ chain: zgTestnet, transport: http(ZG_RPC) })

  const total = await pub.readContract({ address: REGISTRY, abi: REGISTRY_ABI, functionName: 'getTotalEntryCount' })
  console.log(`Total on-chain entries: ${total}\n`)

  const ids = await pub.readContract({ address: REGISTRY, abi: REGISTRY_ABI, functionName: 'getAllEntries', args: [0n, total] })

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]
    process.stdout.write(`[${i+1}/${ids.length}] ${id.slice(0,20)}... `)
    try {
      const res = await fetch(`${API}/content/${id}`)
      const data = await res.json()
      if (res.ok && data.content) {
        console.log(`✓  ${data.content.slice(0, 60).replace(/\n/g, ' ')}`)
      } else {
        console.log(`✗  ${data.error ?? 'no content'}: ${data.detail?.slice(0, 80) ?? ''}`)
      }
    } catch (e) {
      console.log(`✗  ${e.message}`)
    }
  }

  // Show what's in the DB now
  const entries = await fetch(`${API}/entries`).then(r => r.json()).catch(() => [])
  console.log(`\n✅ DB now has ${entries.length} entries with content.`)
}

main().catch(e => { console.error(e.message ?? e); process.exit(1) })
