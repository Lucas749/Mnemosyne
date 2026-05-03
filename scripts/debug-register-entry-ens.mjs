#!/usr/bin/env node

import { createPublicClient, createWalletClient, http, labelhash, namehash, parseAbi } from '../node_modules/.pnpm/viem@2.48.4_bufferutil@4.1.0_typescript@5.9.3_utf-8-validate@5.0.10/node_modules/viem/_esm/index.js'
import { privateKeyToAccount } from '../node_modules/.pnpm/viem@2.48.4_bufferutil@4.1.0_typescript@5.9.3_utf-8-validate@5.0.10/node_modules/viem/_esm/accounts/index.js'

const ENS_REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e'
const PUBLIC_RESOLVER = '0x8FADE66B79cC9f707aB26799354482EB93a5B7dD'

const ENS_ABI = parseAbi([
  'function setSubnodeRecord(bytes32 node, bytes32 label, address owner, address resolver, uint64 ttl) external',
])
const RESOLVER_ABI = parseAbi([
  'function setAddr(bytes32 node, address addr) external',
  'function setText(bytes32 node, string key, string value) external',
])

const WORDS = [
  'ace','arc','ash','bay','bit','bog','bow','bud','bug','bus','cap','cat','cod','cop','cot','cup','cut','dam','den','dew',
  'dig','dim','dip','dot','dye','ear','eel','egg','elf','elm','end','era','eve','eye','fan','far','fat','fee','fen','fig',
  'fin','fix','fly','fog','fox','fur','gap','gem','gin','gnu','god','gun','gut','hay','hex','hid','hip','hog','hop','hot',
  'hub','hue','hum','ice','imp','ink','ion','ivy','jab','jam','jar','jaw','jet','jot','joy','jug','jut','keg','key','kid',
  'kin','kit','lab','lag','lap','law','lay','lea','leg','let','lid','lip','lit','log','lot','low','lug','mad','map','mar',
  'mat','mob','mod','mop','mud','mug','nag','net','nip','nit','nod','nor','nub','nun','nut','oak','oar','oat','odd','off',
  'oil','old','one','orb','ore','our','out','owe','own','pad','pan','pat','pea','peg','pen','pet','pie','pig','pin','pit',
  'pod','pop','pot','pub','pun','pup','put','rag','ran','rap','rat','raw','ray','red','ref','rep','rev','rid','rim','rip',
  'rob','rod','rot','row','rub','rum','run','rut','sad','sap','sat','saw','say','sea','set','sew','shy','sin','sip','sir',
  'sit','ski','sky','sly','sob','son','sow','soy','spa','spy','sub','sum','sun','tab','tan','tap','tar','tax','tee','tip',
  'ton','top','tot','tow','toy','tub','tug','two','urn','use','van','vat','via','vie','vim','vow','war','wax','web','wed',
  'wet','wig','win','wit','woe','woo','yak','yam','yap','yaw','yen','yet','yew','yip','zen','zip','zoo','arc','ash','bay',
  'blue','bold','bone','book','born','both','burn','byte','call','calm','care','cast','cave','city','clan','clay','clip','code',
]

function entryName(entryId) {
  const hex = entryId.replace('0x', '')
  const b0 = parseInt(hex.slice(0, 2), 16) % WORDS.length
  const b1 = parseInt(hex.slice(4, 6), 16) % WORDS.length
  const b2 = parseInt(hex.slice(8, 10), 16) % WORDS.length
  return `${WORDS[b0]}.${WORDS[b1]}.${WORDS[b2]}`
}

async function main() {
  const entryId = process.argv[2]
  if (!entryId) {
    console.error('Usage: node scripts/debug-register-entry-ens.mjs <entryId>')
    process.exit(1)
  }
  const rawKey = process.env.ENS_PRIVATE_KEY ?? process.env.ZG_PRIVATE_KEY
  if (!rawKey) {
    console.error('Missing ENS_PRIVATE_KEY/ZG_PRIVATE_KEY')
    process.exit(1)
  }
  const privateKey = rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`
  const rpc = process.env.SEPOLIA_RPC ?? 'https://1rpc.io/sepolia'
  const account = privateKeyToAccount(privateKey)
  const sepolia = { id: 11155111, name: 'Sepolia', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [rpc] } } }
  const wallet = createWalletClient({ account, chain: sepolia, transport: http(rpc) })
  const pub = createPublicClient({ chain: sepolia, transport: http(rpc) })

  const [w1, w2, w3] = entryName(entryId).split('.')
  const parent = 'mnemosyne.eth'
  const parentNode = namehash(parent)
  const mnemoName = `mnemo.${parent}`
  const mnemoNode = namehash(mnemoName)
  const level3Name = `${w3}.${mnemoName}`
  const level3Node = namehash(level3Name)
  const level2Name = `${w2}.${level3Name}`
  const level2Node = namehash(level2Name)
  const fullName = `${w1}.${level2Name}`
  const fullNode = namehash(fullName)

  console.log('wallet:', account.address)
  console.log('fullName:', fullName)

  const tx0 = await wallet.writeContract({ address: ENS_REGISTRY, abi: ENS_ABI, functionName: 'setSubnodeRecord', args: [parentNode, labelhash('mnemo'), account.address, PUBLIC_RESOLVER, 0n] })
  console.log('mnemo tx:', tx0)
  await pub.waitForTransactionReceipt({ hash: tx0 })

  const tx3 = await wallet.writeContract({ address: ENS_REGISTRY, abi: ENS_ABI, functionName: 'setSubnodeRecord', args: [mnemoNode, labelhash(w3), account.address, PUBLIC_RESOLVER, 0n] })
  console.log('w3 tx:', tx3)
  await pub.waitForTransactionReceipt({ hash: tx3 })

  const tx2 = await wallet.writeContract({ address: ENS_REGISTRY, abi: ENS_ABI, functionName: 'setSubnodeRecord', args: [level3Node, labelhash(w2), account.address, PUBLIC_RESOLVER, 0n] })
  console.log('w2 tx:', tx2)
  await pub.waitForTransactionReceipt({ hash: tx2 })

  const tx1 = await wallet.writeContract({ address: ENS_REGISTRY, abi: ENS_ABI, functionName: 'setSubnodeRecord', args: [level2Node, labelhash(w1), account.address, PUBLIC_RESOLVER, 0n] })
  console.log('w1 tx:', tx1)
  await pub.waitForTransactionReceipt({ hash: tx1 })

  const txAddr = await wallet.writeContract({ address: PUBLIC_RESOLVER, abi: RESOLVER_ABI, functionName: 'setAddr', args: [fullNode, account.address] })
  console.log('addr tx:', txAddr)
  await pub.waitForTransactionReceipt({ hash: txAddr })

  const txText = await wallet.writeContract({ address: PUBLIC_RESOLVER, abi: RESOLVER_ABI, functionName: 'setText', args: [fullNode, 'mnemosyne.entryId', entryId] })
  console.log('text tx:', txText)
  await pub.waitForTransactionReceipt({ hash: txText })

  console.log('done')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
