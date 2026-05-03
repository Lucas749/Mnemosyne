#!/usr/bin/env node

import { createPublicClient, createWalletClient, http, namehash, parseAbi } from '../node_modules/.pnpm/viem@2.48.4_bufferutil@4.1.0_typescript@5.9.3_utf-8-validate@5.0.10/node_modules/viem/_esm/index.js'
import { privateKeyToAccount } from '../node_modules/.pnpm/viem@2.48.4_bufferutil@4.1.0_typescript@5.9.3_utf-8-validate@5.0.10/node_modules/viem/_esm/accounts/index.js'

const ENS_REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e'
const NAME_WRAPPER = '0x0635513f179D50A207757E05759CbD106d7dFcE8'
const SEPOLIA_PUBLIC_RESOLVER = '0x8FADE66B79cC9f707aB26799354482EB93a5B7dD'
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const KEY = 'memory.index'

const REGISTRY_ABI = parseAbi([
  'function owner(bytes32 node) external view returns (address)',
  'function resolver(bytes32 node) external view returns (address)',
  'function setResolver(bytes32 node, address resolver) external',
])

const WRAPPER_ABI = parseAbi([
  'function ownerOf(uint256 id) external view returns (address)',
])

const RESOLVER_ABI = parseAbi([
  'function text(bytes32 node, string key) external view returns (string)',
  'function setText(bytes32 node, string key, string value) external',
])

const args = process.argv.slice(2)
const ensName = args.find(a => !a.startsWith('--')) ?? 'mnemosyne.eth'
const writeIndex = args.indexOf('--write')
const writeValue = writeIndex >= 0 ? args[writeIndex + 1] : null
const usePublicResolver = args.includes('--set-public-resolver')

const rawKey = (process.env.ENS_PRIVATE_KEY ?? process.env.ZG_PRIVATE_KEY ?? '').trim()
if (!rawKey) {
  console.error('Missing ENS_PRIVATE_KEY or ZG_PRIVATE_KEY')
  process.exit(1)
}
const privateKey = rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`
const rpc = process.env.SEPOLIA_RPC ?? process.env.ENS_RPC_URL ?? 'https://1rpc.io/sepolia'

const account = privateKeyToAccount(privateKey)
const sepolia = {
  id: 11155111,
  name: 'Sepolia',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
}
const pub = createPublicClient({ chain: sepolia, transport: http(rpc) })
const wallet = createWalletClient({ chain: sepolia, transport: http(rpc), account })

async function main() {
  const node = namehash(ensName)

  console.log(`ENS name:    ${ensName}`)
  console.log(`RPC:         ${rpc}`)
  console.log(`Wallet:      ${account.address}`)
  console.log(`Node:        ${node}`)

  const owner = await pub.readContract({
    address: ENS_REGISTRY,
    abi: REGISTRY_ABI,
    functionName: 'owner',
    args: [node],
  })
  const resolver = await pub.readContract({
    address: ENS_REGISTRY,
    abi: REGISTRY_ABI,
    functionName: 'resolver',
    args: [node],
  })

  console.log(`ENS owner:   ${owner}`)
  console.log(`Resolver:    ${resolver}`)
  console.log(`Owner match: ${owner.toLowerCase() === account.address.toLowerCase() ? 'yes' : 'no'}`)

  if (owner.toLowerCase() === NAME_WRAPPER.toLowerCase()) {
    const wrappedOwner = await pub.readContract({
      address: NAME_WRAPPER,
      abi: WRAPPER_ABI,
      functionName: 'ownerOf',
      args: [BigInt(node)],
    }).catch(() => null)
    console.log(`Wrapped owner: ${wrappedOwner ?? 'unavailable'}`)
    if (wrappedOwner) {
      console.log(`Wrapped match: ${wrappedOwner.toLowerCase() === account.address.toLowerCase() ? 'yes' : 'no'}`)
    }
  }

  if (resolver === ZERO_ADDRESS) {
    console.log('No resolver set on this ENS name. setMemoryIndex will fail until resolver exists.')
    process.exit(0)
  }

  const current = await pub.readContract({
    address: resolver,
    abi: RESOLVER_ABI,
    functionName: 'text',
    args: [node, KEY],
  })
  console.log(`Current ${KEY}: ${current || '(empty)'}`)

  const candidate = writeValue ?? current ?? `debug-${Date.now()}`
  console.log(`Simulate setText(${KEY}): ${candidate}`)

  try {
    await pub.simulateContract({
      address: resolver,
      abi: RESOLVER_ABI,
      functionName: 'setText',
      args: [node, KEY, candidate],
      account,
    })
    console.log('Simulate result: success')
  } catch (err) {
    console.log(`Simulate result: failed`)
    console.log((err instanceof Error ? err.message : String(err)).slice(0, 400))
    const publicSim = await pub.simulateContract({
      address: SEPOLIA_PUBLIC_RESOLVER,
      abi: RESOLVER_ABI,
      functionName: 'setText',
      args: [node, KEY, candidate],
      account,
    }).then(() => true).catch(() => false)
    console.log(`Simulate against Sepolia public resolver (${SEPOLIA_PUBLIC_RESOLVER}): ${publicSim ? 'success' : 'failed'}`)
    if (!usePublicResolver) process.exit(1)
  }

  if (usePublicResolver && resolver.toLowerCase() !== SEPOLIA_PUBLIC_RESOLVER.toLowerCase()) {
    console.log(`Switching resolver to Sepolia public resolver: ${SEPOLIA_PUBLIC_RESOLVER}`)
    const setResolverTx = await wallet.writeContract({
      address: ENS_REGISTRY,
      abi: REGISTRY_ABI,
      functionName: 'setResolver',
      args: [node, SEPOLIA_PUBLIC_RESOLVER],
    })
    console.log(`setResolver tx: ${setResolverTx}`)
    await pub.waitForTransactionReceipt({ hash: setResolverTx })
  }

  if (!writeValue) {
    console.log('Dry run complete. Pass --write "<manifestRef>" to actually write.')
    return
  }

  const targetResolver = usePublicResolver ? SEPOLIA_PUBLIC_RESOLVER : resolver
  const txHash = await wallet.writeContract({
    address: targetResolver,
    abi: RESOLVER_ABI,
    functionName: 'setText',
    args: [node, KEY, writeValue],
  })
  console.log(`Write tx: ${txHash}`)
  await pub.waitForTransactionReceipt({ hash: txHash })

  const after = await pub.readContract({
    address: targetResolver,
    abi: RESOLVER_ABI,
    functionName: 'text',
    args: [node, KEY],
  })
  console.log(`Updated ${KEY}: ${after || '(empty)'}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
