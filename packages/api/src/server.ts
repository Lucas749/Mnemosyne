import 'dotenv/config'
import { createStorageClient } from '@mnemosyne/storage'
import { createComputeClient } from '@mnemosyne/compute'
import { createMnemosyneApp } from './app.js'

const PORT = process.env.PORT ?? 3000

async function main() {
  const storage = await createStorageClient({
    privateKey:  process.env.ZG_PRIVATE_KEY!,
    rpc:         process.env.ZG_RPC_URL,
    indexerRpc:  process.env.ZG_INDEXER_RPC,
  })

  const compute = await createComputeClient({
    privateKey: process.env.ZG_PRIVATE_KEY!,
    rpc:        process.env.ZG_RPC_URL,
  })

  const app = createMnemosyneApp(compute, storage)

  app.listen(PORT, () => {
    console.log(`Mnemosyne API listening on http://localhost:${PORT}`)
  })
}

main()
