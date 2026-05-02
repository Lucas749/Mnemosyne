/**
 * Registers ENS subdomains for all on-chain Mnemosyne entries on Sepolia.
 * Each entry gets: <word>.<word>.<word>.mnemosyne.eth
 *
 * Prerequisites: own mnemosyne.eth on Sepolia (already done ✓)
 * Usage: node scripts/register-ens-names.mjs
 */

import { createWalletClient, createPublicClient, http, parseAbi, namehash, labelhash } from '../node_modules/.pnpm/viem@2.48.4_bufferutil@4.1.0_typescript@5.9.3_utf-8-validate@5.0.10/node_modules/viem/_esm/index.js'
import { privateKeyToAccount } from '../node_modules/.pnpm/viem@2.48.4_bufferutil@4.1.0_typescript@5.9.3_utf-8-validate@5.0.10/node_modules/viem/_esm/accounts/index.js'

// ── Config ────────────────────────────────────────────────────────────────────
const RAW_KEY = (process.env.ENS_PRIVATE_KEY ?? process.env.ZG_PRIVATE_KEY ?? '').replace(/^0x/, '')
const SEPOLIA_RPC = process.env.SEPOLIA_RPC ?? 'https://1rpc.io/sepolia'
const ZG_RPC = 'https://evmrpc-testnet.0g.ai'
const REGISTRY_ZG = '0xaA40404DC25248c886c8fb6C27e34536aB2b8001'
const PARENT_NAME = 'mnemosyne.eth'

// Sepolia ENS contracts
const ENS_REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e'
const PUBLIC_RESOLVER = '0x8FADE66B79cC9f707aB26799354482EB93a5B7dD'

const REGISTRY_ABI = [
  { name: 'getTotalEntryCount', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'getAllEntries', type: 'function', stateMutability: 'view', inputs: [{ name: 'offset', type: 'uint256' }, { name: 'limit', type: 'uint256' }], outputs: [{ type: 'bytes32[]' }] },
  { name: 'getEntry', type: 'function', stateMutability: 'view', inputs: [{ name: 'entryId', type: 'bytes32' }], outputs: [{ type: 'tuple', components: [
    { name: 'id', type: 'bytes32' }, { name: 'storageRef', type: 'string' }, { name: 'embeddingRef', type: 'string' }, { name: 'tags', type: 'string[]' },
    { name: 'domain', type: 'uint8' }, { name: 'submitter', type: 'address' }, { name: 'stakeAmount', type: 'uint256' }, { name: 'status', type: 'uint8' },
    { name: 'submittedAt', type: 'uint256' }, { name: 'challengeWindowEnd', type: 'uint256' }, { name: 'queryCount', type: 'uint256' }, { name: 'royaltiesEarned', type: 'uint256' },
    { name: 'lastQueriedAt', type: 'uint256' }, { name: 'inftTokenId', type: 'uint256' },
  ] }] },
]
const ENS_ABI = parseAbi([
  'function owner(bytes32 node) external view returns (address)',
  'function setSubnodeRecord(bytes32 node, bytes32 label, address owner, address resolver, uint64 ttl) external',
])
const RESOLVER_ABI = parseAbi([
  'function setAddr(bytes32 node, address addr) external',
  'function setText(bytes32 node, string key, string value) external',
])

// ── Word list (matches entry-name.ts) ─────────────────────────────────────────
const WORDS = [
  'ace','arc','ash','bay','bit','bog','bow','bud','bug','bus',
  'cap','cat','cod','cop','cot','cup','cut','dam','den','dew',
  'dig','dim','dip','dot','dye','ear','eel','egg','elf','elm',
  'end','era','eve','eye','fan','far','fat','fee','fen','fig',
  'fin','fix','fly','fog','fox','fur','gap','gem','gin','gnu',
  'god','gun','gut','hay','hex','hid','hip','hog','hop','hot',
  'hub','hue','hum','ice','imp','ink','ion','ivy','jab','jam',
  'jar','jaw','jet','jot','joy','jug','jut','keg','key','kid',
  'kin','kit','lab','lag','lap','law','lay','lea','leg','let',
  'lid','lip','lit','log','lot','low','lug','mad','map','mar',
  'mat','mob','mod','mop','mud','mug','nag','net','nip','nit',
  'nod','nor','nub','nun','nut','oak','oar','oat','odd','off',
  'oil','old','one','orb','ore','our','out','owe','own','pad',
  'pan','pat','pea','peg','pen','pet','pie','pig','pin','pit',
  'pod','pop','pot','pub','pun','pup','put','rag','ran','rap',
  'rat','raw','ray','red','ref','rep','rev','rid','rim','rip',
  'rob','rod','rot','row','rub','rum','run','rut','sad','sap',
  'sat','saw','say','sea','set','sew','shy','sin','sip','sir',
  'sit','ski','sky','sly','sob','son','sow','soy','spa','spy',
  'sub','sum','sun','tab','tan','tap','tar','tax','tee','tip',
  'ton','top','tot','tow','toy','tub','tug','two','urn','use',
  'van','vat','via','vie','vim','vow','war','wax','web','wed',
  'wet','wig','win','wit','woe','woo','yak','yam','yap','yaw',
  'yen','yet','yew','yip','zen','zip','zoo','arc','ash','bay',
  'blue','bold','bone','book','born','both','burn','byte','call',
  'calm','care','cast','cave','city','clan','clay','clip','code',
]

function entryName(entryId) {
  const hex = entryId.replace('0x', '')
  const b0 = parseInt(hex.slice(0, 2), 16) % WORDS.length
  const b1 = parseInt(hex.slice(4, 6), 16) % WORDS.length
  const b2 = parseInt(hex.slice(8, 10), 16) % WORDS.length
  return `${WORDS[b0]}.${WORDS[b1]}.${WORDS[b2]}`
}

// Register setSubnodeRecord and set resolver records in one go
async function registerSubdomain(walletClient, pubClient, parentNode, label, newNode, targetAddr, entryId) {
  const ownerAddr = walletClient.account.address

  // Step 1: setSubnodeRecord (creates subdomain + sets resolver in one tx)
  const h1 = await walletClient.writeContract({
    address: ENS_REGISTRY, abi: ENS_ABI,
    functionName: 'setSubnodeRecord',
    args: [parentNode, labelhash(label), ownerAddr, PUBLIC_RESOLVER, 0n],
  })
  await pubClient.waitForTransactionReceipt({ hash: h1 })

  // Step 2: setAddr
  const h2 = await walletClient.writeContract({
    address: PUBLIC_RESOLVER, abi: RESOLVER_ABI,
    functionName: 'setAddr',
    args: [newNode, targetAddr],
  })
  await pubClient.waitForTransactionReceipt({ hash: h2 })

  // Step 3: setText with entryId
  const h3 = await walletClient.writeContract({
    address: PUBLIC_RESOLVER, abi: RESOLVER_ABI,
    functionName: 'setText',
    args: [newNode, 'mnemosyne.entryId', entryId],
  })
  await pubClient.waitForTransactionReceipt({ hash: h3 })
}

async function main() {
  if (!RAW_KEY) { console.error('Set ENS_PRIVATE_KEY or ZG_PRIVATE_KEY'); process.exit(1) }

  const account = privateKeyToAccount(`0x${RAW_KEY}`)
  console.log('Wallet:', account.address)

  const sepolia = {
    id: 11155111, name: 'Sepolia',
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [SEPOLIA_RPC] } },
  }
  const zgTestnet = {
    id: 16602, name: '0G-Galileo',
    nativeCurrency: { name: 'A0GI', symbol: 'A0GI', decimals: 18 },
    rpcUrls: { default: { http: [ZG_RPC] } },
  }

  const wallet = createWalletClient({ chain: sepolia, transport: http(SEPOLIA_RPC), account })
  const pub    = createPublicClient({ chain: sepolia, transport: http(SEPOLIA_RPC) })
  const pubZg  = createPublicClient({ chain: zgTestnet, transport: http(ZG_RPC) })

  // Verify ownership of mnemosyne.eth
  const parentNode = namehash(PARENT_NAME)
  const owner = await pub.readContract({
    address: ENS_REGISTRY, abi: ENS_ABI, functionName: 'owner', args: [parentNode],
  })
  console.log(`Owner of ${PARENT_NAME}: ${owner}`)
  if (owner.toLowerCase() !== account.address.toLowerCase()) {
    console.error(`❌ Wallet ${account.address} does not own ${PARENT_NAME}`)
    process.exit(1)
  }
  console.log(`✓ Verified ownership of ${PARENT_NAME}\n`)

  // Read all entries from 0G chain
  const total = await pubZg.readContract({
    address: REGISTRY_ZG, abi: REGISTRY_ABI, functionName: 'getTotalEntryCount',
  })
  console.log(`Total on-chain entries: ${total}`)

  const ids = await pubZg.readContract({
    address: REGISTRY_ZG, abi: REGISTRY_ABI,
    functionName: 'getAllEntries', args: [0n, total],
  })

  const entries = await Promise.all(ids.map(id =>
    pubZg.readContract({ address: REGISTRY_ZG, abi: REGISTRY_ABI, functionName: 'getEntry', args: [id] })
  ))

  // Register each entry as word.word.word.mnemosyne.eth
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    const entryId = ids[i]
    const name = entryName(entryId)
    const [w1, w2, w3] = name.split('.')
    const fullName = `${name}.${PARENT_NAME}`

    console.log(`[${i+1}/${entries.length}] ${fullName}`)
    console.log(`  Entry: ${entryId.slice(0, 22)}...  Submitter: ${entry.submitter}`)

    try {
      // Register w3 under mnemosyne.eth → node: w3.mnemosyne.eth
      const node3 = namehash(`${w3}.${PARENT_NAME}`)
      const h = await wallet.writeContract({
        address: ENS_REGISTRY, abi: ENS_ABI,
        functionName: 'setSubnodeRecord',
        args: [parentNode, labelhash(w3), account.address, PUBLIC_RESOLVER, 0n],
      })
      await pub.waitForTransactionReceipt({ hash: h })

      // Register w2 under w3.mnemosyne.eth → node: w2.w3.mnemosyne.eth
      const node2 = namehash(`${w2}.${w3}.${PARENT_NAME}`)
      const h2 = await wallet.writeContract({
        address: ENS_REGISTRY, abi: ENS_ABI,
        functionName: 'setSubnodeRecord',
        args: [node3, labelhash(w2), account.address, PUBLIC_RESOLVER, 0n],
      })
      await pub.waitForTransactionReceipt({ hash: h2 })

      // Register w1 under w2.w3.mnemosyne.eth → full name node
      const fullNode = namehash(fullName)
      const h3 = await wallet.writeContract({
        address: ENS_REGISTRY, abi: ENS_ABI,
        functionName: 'setSubnodeRecord',
        args: [node2, labelhash(w1), account.address, PUBLIC_RESOLVER, 0n],
      })
      await pub.waitForTransactionReceipt({ hash: h3 })

      // Set address record → submitter
      const h4 = await wallet.writeContract({
        address: PUBLIC_RESOLVER, abi: RESOLVER_ABI,
        functionName: 'setAddr',
        args: [fullNode, entry.submitter],
      })
      await pub.waitForTransactionReceipt({ hash: h4 })

      // Set text record → entryId
      const h5 = await wallet.writeContract({
        address: PUBLIC_RESOLVER, abi: RESOLVER_ABI,
        functionName: 'setText',
        args: [fullNode, 'mnemosyne.entryId', entryId],
      })
      await pub.waitForTransactionReceipt({ hash: h5 })

      console.log(`  ✓ ${fullName} → ${entry.submitter}`)
    } catch (err) {
      console.error(`  ✗ Failed: ${err.shortMessage ?? err.message}`)
    }
  }

  console.log('\n✅ Registration complete!')
  console.log(`   View: https://sepolia.app.ens.domains/${PARENT_NAME}`)
}

main().catch(err => { console.error(err); process.exit(1) })
