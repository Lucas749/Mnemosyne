#!/usr/bin/env node
/**
 * Test 0G Storage upload + download round-trip.
 * Usage: ZG_PRIVATE_KEY=0x... node scripts/test-storage.mjs
 */

import { createHmac, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const SDK_PATH = '../node_modules/.pnpm/@0gfoundation+0g-ts-sdk@1.2.6_bufferutil@4.1.0_ethers@6.13.1_bufferutil@4.1.0_utf-8-validate@_nq7rqarhl5ucogkzoy2cqihzze/node_modules/@0gfoundation/0g-ts-sdk/lib.commonjs/index.js'
const ETHERS_PATH = '../node_modules/.pnpm/ethers@6.13.1_bufferutil@4.1.0_utf-8-validate@5.0.10/node_modules/ethers/lib.commonjs/index.js'

const { Indexer, MemData } = await import(SDK_PATH)
const { ethers } = await import(ETHERS_PATH)

const INDEXERS = [
  'https://indexer-storage-testnet-standard.0g.ai',
  'https://indexer-storage-testnet-turbo.0g.ai',
]
const RPC = process.env.ZG_RPC_URL ?? 'https://evmrpc-testnet.0g.ai'
const KEY = process.env.ZG_PRIVATE_KEY

if (!KEY) { console.error('Set ZG_PRIVATE_KEY'); process.exit(1) }

const enc = new TextEncoder()
const dec = new TextDecoder()

function deriveKey(entryId) {
  return createHmac('sha256', KEY).update(entryId).digest()
}

function encrypt(plaintext, entryId) {
  const key = deriveKey(entryId)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), ct])
}

function decrypt(buf, entryId) {
  const key = deriveKey(entryId)
  const d = createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12))
  d.setAuthTag(buf.subarray(12, 28))
  return Buffer.concat([d.update(buf.subarray(28)), d.final()])
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC)
  const signer = new ethers.Wallet(KEY, provider)
  console.log('Wallet:', await signer.getAddress())

  const TEST_ID = '0xtest-' + randomBytes(4).toString('hex')
  const TEST_CONTENT = `Test entry ${TEST_ID} — ${new Date().toISOString()}`
  const blob = { id: TEST_ID, content: TEST_CONTENT, domain: 'factual', tags: ['TEST'], sources: [], submittedBy: 'test', submittedAt: Math.floor(Date.now() / 1000), checksum: '' }
  const payload = encrypt(enc.encode(JSON.stringify(blob)), TEST_ID)

  // ── Upload ─────────────────────────────────────────────────────────────────
  let rootHash = null
  let uploadIndexer = null
  for (const url of INDEXERS) {
    process.stdout.write(`Upload via ${url.replace('https://', '')}... `)
    try {
      const [tx, err] = await new Indexer(url).upload(new MemData(new Uint8Array(payload)), RPC, signer)
      if (err) { console.log('✗', err); continue }
      rootHash = tx.rootHash ?? tx.rootHashes?.[0]
      uploadIndexer = url
      console.log('✓  rootHash:', rootHash)
      break
    } catch (e) { console.log('✗', e.message) }
  }

  if (!rootHash) { console.error('\n❌ All uploads failed'); process.exit(1) }

  // ── Download + decrypt from each indexer ──────────────────────────────────
  console.log('')
  for (const url of INDEXERS) {
    process.stdout.write(`Download via ${url.replace('https://', '')}... `)
    try {
      const [dlBlob, dlErr] = await new Indexer(url).downloadToBlob(rootHash, { proof: true })
      if (dlErr) { console.log('✗', dlErr); continue }
      const plain = decrypt(Buffer.from(await dlBlob.arrayBuffer()), TEST_ID)
      const parsed = JSON.parse(dec.decode(plain))
      const ok = parsed.content === TEST_CONTENT
      console.log(ok ? `✓  content matches` : `✗  content mismatch`)
    } catch (e) { console.log('✗', e.message) }
  }

  console.log('\n✅ Done. Upload indexer:', uploadIndexer)
}

main().catch(e => { console.error(e.message ?? e); process.exit(1) })
