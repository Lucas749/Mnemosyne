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
    indexerRpc: process.env.ZG_INDEXER_RPC ?? 'https://indexer-storage-testnet-turbo.0g.ai',
  })

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
