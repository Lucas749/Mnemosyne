import { createPublicClient, createWalletClient, http, labelhash, namehash, parseAbi } from 'viem'
import { sepolia } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'

import { withRetryBroad } from './retry.js'

const SEPOLIA_RECEIPT_WAIT_MS = Number(process.env.SEPOLIA_RECEIPT_WAIT_MS ?? 480_000)
const SEPOLIA_RECEIPT_POLL_MS = Number(process.env.SEPOLIA_RECEIPT_POLL_MS ?? 4_000)

const ENS_REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e' as const
const PUBLIC_RESOLVER = '0x8FADE66B79cC9f707aB26799354482EB93a5B7dD' as const

async function waitReceipt(
  pub: ReturnType<typeof createPublicClient>,
  hash: `0x${string}`,
  step: string,
  trace: string | undefined,
) {
  const w = Number.isFinite(SEPOLIA_RECEIPT_WAIT_MS) && SEPOLIA_RECEIPT_WAIT_MS > 60_000 ? SEPOLIA_RECEIPT_WAIT_MS : 480_000
  const p = Number.isFinite(SEPOLIA_RECEIPT_POLL_MS) && SEPOLIA_RECEIPT_POLL_MS > 500 ? SEPOLIA_RECEIPT_POLL_MS : 4_000
  const t = trace ? `${trace}` : '[ens]'
  console.log(`${t} step=${step} wait HASH=${hash} explorer https://sepolia.etherscan.io/tx/${hash} timeoutMs=${w}`)
  const receipt = await withRetryBroad(
    () =>
      pub.waitForTransactionReceipt({
        hash,
        timeout: w,
        pollingInterval: p,
      }),
    { maxAttempts: 5, baseDelayMs: 1_800, label: `[ens] receipt ${step}` },
  )
  console.log(`${t} step=${step} confirmed block=${receipt.blockNumber?.toString() ?? '?'} status=${receipt.status} gasUsed=${receipt.gasUsed?.toString() ?? '?'}`)
}

const ENS_ABI = parseAbi([
  'function setSubnodeRecord(bytes32 node, bytes32 label, address owner, address resolver, uint64 ttl) external',
])

const RESOLVER_ABI = parseAbi([
  'function setAddr(bytes32 node, address addr) external',
  'function setText(bytes32 node, string key, string value) external',
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

function entryName(entryId: string): string {
  const hex = entryId.replace('0x', '')
  const b0 = parseInt(hex.slice(0, 2), 16) % WORDS.length
  const b1 = parseInt(hex.slice(4, 6), 16) % WORDS.length
  const b2 = parseInt(hex.slice(8, 10), 16) % WORDS.length
  return `${WORDS[b0]}.${WORDS[b1]}.${WORDS[b2]}`
}

export async function registerEntryEnsName(params: {
  privateKey: `0x${string}`
  entryId: string
  targetAddress: `0x${string}`
  parentName?: string
  sepoliaRpc?: string
  /** e.g. `[store:jobHex]` prepended to every ENS log line */
  trace?: string
}) {
  const baseParent = params.parentName ?? 'mnemosyne.eth'
  const rpc = params.sepoliaRpc ?? process.env.SEPOLIA_RPC ?? 'https://1rpc.io/sepolia'
  const trace = params.trace ?? ''
  const log = (...m: unknown[]) => console.log(trace || '[ens]', ...m)

  const traceArg = trace || undefined
  const account = privateKeyToAccount(params.privateKey)
  const wallet = createWalletClient({ account, chain: sepolia, transport: http(rpc) })
  const pub = createPublicClient({ chain: sepolia, transport: http(rpc) })

  const [w1, w2, w3] = entryName(params.entryId).split('.')
  log(`START entryId=${params.entryId} wordLabels=${w1}.${w2}.${w3}.mnemo… rpc=${rpc} parent=${baseParent} signer=${account.address}`)

  const parentNode = namehash(baseParent)

  const mnemoName = `mnemo.${baseParent}`
  const mnemoNode = namehash(mnemoName)
  const txMnemo = await wallet.writeContract({
    address: ENS_REGISTRY,
    abi: ENS_ABI,
    functionName: 'setSubnodeRecord',
    args: [parentNode, labelhash('mnemo'), account.address, PUBLIC_RESOLVER, 0n],
  })
  log(`setSubnodeRecord mnemo TX=${txMnemo}`)
  await waitReceipt(pub, txMnemo, 'mnemo', traceArg)

  const level3Name = `${w3}.${mnemoName}`
  const level3Node = namehash(level3Name)
  const tx3 = await wallet.writeContract({
    address: ENS_REGISTRY,
    abi: ENS_ABI,
    functionName: 'setSubnodeRecord',
    args: [mnemoNode, labelhash(w3), account.address, PUBLIC_RESOLVER, 0n],
  })
  log(`setSubnodeRecord lvl3 ${w3} TX=${tx3}`)
  await waitReceipt(pub, tx3, 'lvl3', traceArg)

  const level2Name = `${w2}.${level3Name}`
  const level2Node = namehash(level2Name)
  const tx2 = await wallet.writeContract({
    address: ENS_REGISTRY,
    abi: ENS_ABI,
    functionName: 'setSubnodeRecord',
    args: [level3Node, labelhash(w2), account.address, PUBLIC_RESOLVER, 0n],
  })
  log(`setSubnodeRecord lvl2 ${w2} TX=${tx2}`)
  await waitReceipt(pub, tx2, 'lvl2', traceArg)

  const fullName = `${w1}.${level2Name}`
  const node = namehash(fullName)
  const tx1 = await wallet.writeContract({
    address: ENS_REGISTRY,
    abi: ENS_ABI,
    functionName: 'setSubnodeRecord',
    args: [level2Node, labelhash(w1), account.address, PUBLIC_RESOLVER, 0n],
  })
  log(`setSubnodeRecord lvl1 ${w1} fullName=${fullName} TX=${tx1}`)
  await waitReceipt(pub, tx1, 'lvl1', traceArg)

  const addrTx = await wallet.writeContract({
    address: PUBLIC_RESOLVER,
    abi: RESOLVER_ABI,
    functionName: 'setAddr',
    args: [node, params.targetAddress],
  })
  log(`resolver setAddr target=${params.targetAddress} TX=${addrTx}`)
  await waitReceipt(pub, addrTx, 'addr', traceArg)

  const textTx = await wallet.writeContract({
    address: PUBLIC_RESOLVER,
    abi: RESOLVER_ABI,
    functionName: 'setText',
    args: [node, 'mnemosyne.entryId', params.entryId],
  })
  log(`resolver setText mnemosyne.entryId TX=${textTx}`)
  await waitReceipt(pub, textTx, 'entryId-text', traceArg)

  log(`DONE fullName=${fullName}`)
  return { fullName, addrTx, textTx }
}
