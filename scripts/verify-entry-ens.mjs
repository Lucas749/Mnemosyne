#!/usr/bin/env node

import { createPublicClient, http, namehash, parseAbi } from '../node_modules/.pnpm/viem@2.48.4_bufferutil@4.1.0_typescript@5.9.3_utf-8-validate@5.0.10/node_modules/viem/_esm/index.js'

const SEPOLIA_RPC = process.env.SEPOLIA_RPC ?? 'https://1rpc.io/sepolia'
const ENS_REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e'

const REGISTRY_ABI = parseAbi([
  'function resolver(bytes32 node) external view returns (address)',
])
const RESOLVER_ABI = parseAbi([
  'function text(bytes32 node, string key) external view returns (string)',
  'function addr(bytes32 node) external view returns (address)',
])

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

async function main() {
  const entryId = process.argv[2]
  const explicitName = process.argv[3]
  if (!entryId) {
    console.error('Usage: node scripts/verify-entry-ens.mjs <entryId> [fullEnsName]')
    process.exit(1)
  }

  const fullName = explicitName ?? `${entryName(entryId)}.mnemo.mnemosyne.eth`
  const node = namehash(fullName)
  const client = createPublicClient({
    chain: { id: 11155111, name: 'Sepolia', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [SEPOLIA_RPC] } } },
    transport: http(SEPOLIA_RPC),
  })

  const resolver = await client.readContract({
    address: ENS_REGISTRY,
    abi: REGISTRY_ABI,
    functionName: 'resolver',
    args: [node],
  })

  if (resolver === '0x0000000000000000000000000000000000000000') {
    console.log(JSON.stringify({ fullName, resolver: null, ok: false, reason: 'no resolver' }, null, 2))
    process.exit(1)
  }

  const [addr, linkedEntryId] = await Promise.all([
    client.readContract({ address: resolver, abi: RESOLVER_ABI, functionName: 'addr', args: [node] }).catch(() => null),
    client.readContract({ address: resolver, abi: RESOLVER_ABI, functionName: 'text', args: [node, 'mnemosyne.entryId'] }).catch(() => null),
  ])

  const ok = !!linkedEntryId && linkedEntryId.toLowerCase() === entryId.toLowerCase()
  console.log(JSON.stringify({ fullName, resolver, addr, linkedEntryId, expectedEntryId: entryId, ok }, null, 2))
  process.exit(ok ? 0 : 1)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
