import 'dotenv/config'
import { createStorageClient } from '@mnemosyne/storage'
import { createMnemosyneApp } from './app.js'

const PORT = process.env.PORT ?? 3000

async function main() {
  const key = process.env.ZG_PRIVATE_KEY ?? ''
  // ethers v6 requires 0x prefix
  const normalizedKey = key.startsWith('0x') ? key : `0x${key}`

  const storage = createStorageClient({
    privateKey: normalizedKey,
    rpcUrl: process.env.ZG_RPC_URL || undefined,
    indexerRpc: process.env.ZG_INDEXER_RPC ?? 'https://indexer-storage-testnet-turbo.0g.ai',
  })

  const rpc = process.env.ZG_RPC_URL ?? '(default https://evmrpc-testnet.0g.ai)'
  const registry = process.env.MNEMOSYNE_REGISTRY_ADDRESS ?? '0xaA40404DC25248c886c8fb6C27e34536aB2b8001'
  console.log(
    `[startup] 0G storage client ready rpc=${rpc} indexer=${process.env.ZG_INDEXER_RPC ?? 'turbo default'} MnemosyneRegistry(env)=${registry} ZG_PRIVATE_KEY=${key ? 'set' : 'MISSING'} ENS_PRIVATE_KEY=${process.env.ENS_PRIVATE_KEY ? 'set' : 'unset'} STORE_JOB_TIMEOUT_MS=${process.env.STORE_JOB_TIMEOUT_MS ?? '(default1800000)'} ZG_RECEIPT_WAIT_MS=${process.env.ZG_RECEIPT_WAIT_MS ?? '(default600000)'}`,
  )

  // Pass null — compute is initialised lazily inside app.ts when needed
  const app = createMnemosyneApp(null as any, storage)

  app.listen(PORT, () => {
    console.log(`Mnemosyne API listening on http://localhost:${PORT}`)
  })
}

main().catch(err => {
  console.error('[startup] fatal:', err?.message ?? err)
  process.exit(1)
})
