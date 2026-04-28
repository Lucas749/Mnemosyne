/**
 * Provision mnemosyne.eth and subnames on Sepolia ENS.
 * Idempotent — skips registration if the name already exists.
 *
 * Usage:
 *   cd packages/identity && pnpm provision
 *
 * Requires ENS_PRIVATE_KEY and SEPOLIA_RPC in root .env
 */
import { config } from 'dotenv'
import { resolve } from 'path'
import { privateKeyToAccount } from 'viem/accounts'
import { isNameAvailable, registerEthName, registerSubname } from './index.js'

config({ path: resolve(__dirname, '../../../.env') })

const NAME        = 'mnemosyne.eth'
const DEMO_LABELS = ['agent', 'demo']

async function main() {
  const privateKey = process.env.ENS_PRIVATE_KEY as `0x${string}`
  const rpcUrl     = process.env.SEPOLIA_RPC
  if (!privateKey) throw new Error('ENS_PRIVATE_KEY not set in .env')

  const options = { rpcUrl }
  const owner   = privateKeyToAccount(privateKey).address

  const available = await isNameAvailable(NAME, options)
  console.log(`${NAME} available: ${available}`)

  if (available) {
    console.log(`Registering ${NAME} (commit → wait 65s → register)...`)
    const { commitHash, registerHash } = await registerEthName(privateKey, NAME, options)
    console.log(`✓ Registered ${NAME}`)
    console.log(`  commit:   ${commitHash}`)
    console.log(`  register: ${registerHash}`)
  } else {
    console.log(`${NAME} already registered — skipping registration`)
  }

  for (const label of DEMO_LABELS) {
    const fqn = `${label}.${NAME}`
    console.log(`\nCreating ${fqn} → ${owner}`)
    const hash = await registerSubname(privateKey, NAME, label, owner, options)
    console.log(`✓ Created ${fqn}  tx: ${hash}`)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
