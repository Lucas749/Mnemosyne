import { createPublicClient, createWalletClient, http, keccak256, namehash, toHex } from 'viem'
import { sepolia } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { addEnsContracts } from '@ensdomains/ensjs'
import { getTextRecord, getAvailable, getPrice } from '@ensdomains/ensjs/public'
import { commitName, registerName } from '@ensdomains/ensjs/wallet'
import { randomSecret } from '@ensdomains/ensjs/utils'

const MEMORY_INDEX_KEY = 'memory.index'
const PAYMENT_TOKEN_KEY = 'payment.token'
const ONE_YEAR_SECONDS = 31_536_000

export interface IdentityOptions {
  /** Ethereum JSON-RPC URL (defaults to ENS_RPC_URL env or public Sepolia) */
  rpcUrl?: string
}

const DEFAULT_RPC = 'https://rpc.sepolia.org'

function rpc(options: IdentityOptions) {
  return options.rpcUrl ?? process.env.ENS_RPC_URL ?? process.env.SEPOLIA_RPC ?? DEFAULT_RPC
}

function makePublicClient(rpcUrl: string) {
  return createPublicClient({
    chain: addEnsContracts(sepolia),
    transport: http(rpcUrl),
  })
}

function makeWalletClient(privateKey: `0x${string}`, rpcUrl: string) {
  const account = privateKeyToAccount(privateKey)
  return createWalletClient({
    chain: addEnsContracts(sepolia),
    transport: http(rpcUrl),
    account,
  })
}

const ENS_REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e' as const

const REGISTRY_ABI = [
  {
    name: 'setSubnodeOwner',
    type: 'function' as const,
    inputs: [{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'address' }],
    outputs: [{ type: 'bytes32' }],
    stateMutability: 'nonpayable' as const,
  },
  {
    name: 'resolver',
    type: 'function' as const,
    inputs: [{ type: 'bytes32' }],
    outputs: [{ type: 'address' }],
    stateMutability: 'view' as const,
  },
  {
    name: 'setResolver',
    type: 'function' as const,
    inputs: [{ type: 'bytes32' }, { type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },
]

const RESOLVER_ABI = [{
  name: 'setText',
  type: 'function' as const,
  inputs: [{ type: 'bytes32' }, { type: 'string' }, { type: 'string' }],
  outputs: [],
  stateMutability: 'nonpayable' as const,
}]

/**
 * Ensures a resolver is set for `name`. If not, inherits the parent name's resolver.
 * Returns the resolver address.
 */
async function ensureResolver(
  pub: ReturnType<typeof makePublicClient>,
  wallet: ReturnType<typeof makeWalletClient>,
  name: string,
): Promise<`0x${string}`> {
  const node = namehash(name)
  let resolverAddr = await pub.readContract({
    address: ENS_REGISTRY,
    abi: REGISTRY_ABI,
    functionName: 'resolver',
    args: [node],
  }) as `0x${string}`

  if (resolverAddr === '0x0000000000000000000000000000000000000000') {
    const parts = name.split('.')
    const parentName = parts.slice(1).join('.')
    resolverAddr = await pub.readContract({
      address: ENS_REGISTRY,
      abi: REGISTRY_ABI,
      functionName: 'resolver',
      args: [namehash(parentName)],
    }) as `0x${string}`

    await wallet.writeContract({
      address: ENS_REGISTRY,
      abi: REGISTRY_ABI,
      functionName: 'setResolver',
      args: [node, resolverAddr],
    })
  }

  return resolverAddr
}

// ─── Text records ─────────────────────────────────────────────────────────────

/** Read memory.index text record from an ENS name (→ 0G manifest rootHash). */
export async function getMemoryIndex(
  name: string,
  options: IdentityOptions = {},
): Promise<string | null> {
  const client = makePublicClient(rpc(options))
  return getTextRecord(client, { name, key: MEMORY_INDEX_KEY })
}

/**
 * Write memory.index text record for an ENS name.
 * Automatically sets resolver if none is configured (inherits from parent).
 * @returns transaction hash
 */
export async function setMemoryIndex(
  privateKey: `0x${string}`,
  name: string,
  manifestRef: string,
  options: IdentityOptions = {},
): Promise<`0x${string}`> {
  const rpcUrl  = rpc(options)
  const pub     = makePublicClient(rpcUrl)
  const wallet  = makeWalletClient(privateKey, rpcUrl)
  const resolver = await ensureResolver(pub, wallet, name)
  return wallet.writeContract({
    address: resolver,
    abi: RESOLVER_ABI,
    functionName: 'setText',
    args: [namehash(name), MEMORY_INDEX_KEY, manifestRef],
  })
}

/** Read payment.token text record from an ENS name (→ ERC-20 contract address). */
export async function getPaymentToken(
  name: string,
  options: IdentityOptions = {},
): Promise<string | null> {
  const client = makePublicClient(rpc(options))
  return getTextRecord(client, { name, key: PAYMENT_TOKEN_KEY })
}

/**
 * Write payment.token text record for an ENS name.
 * @returns transaction hash
 */
export async function setPaymentToken(
  privateKey: `0x${string}`,
  name: string,
  token: string,
  options: IdentityOptions = {},
): Promise<`0x${string}`> {
  const rpcUrl  = rpc(options)
  const pub     = makePublicClient(rpcUrl)
  const wallet  = makeWalletClient(privateKey, rpcUrl)
  const resolver = await ensureResolver(pub, wallet, name)
  return wallet.writeContract({
    address: resolver,
    abi: RESOLVER_ABI,
    functionName: 'setText',
    args: [namehash(name), PAYMENT_TOKEN_KEY, token],
  })
}

// ─── Registration ─────────────────────────────────────────────────────────────

/** Check whether a .eth 2LD is available to register. */
export async function isNameAvailable(
  name: string,
  options: IdentityOptions = {},
): Promise<boolean> {
  const client = makePublicClient(rpc(options))
  return getAvailable(client, { name })
}

/**
 * Register a .eth 2LD (e.g. "mnemosyne.eth") via the two-step commit/reveal flow.
 * Waits 65 seconds between commit and register for the minimum commitment age.
 * @returns { commitHash, registerHash }
 */
export async function registerEthName(
  privateKey: `0x${string}`,
  name: string,
  options: IdentityOptions & { durationSeconds?: number } = {},
): Promise<{ commitHash: `0x${string}`; registerHash: `0x${string}` }> {
  const rpcUrl   = rpc(options)
  const pub      = makePublicClient(rpcUrl)
  const wallet   = makeWalletClient(privateKey, rpcUrl)
  const owner    = wallet.account.address
  const duration = options.durationSeconds ?? ONE_YEAR_SECONDS

  const available = await getAvailable(pub, { name })
  if (!available) throw new Error(`${name} is not available on Sepolia`)

  const { base, premium } = await getPrice(pub, { nameOrNames: name, duration })
  const value = (base + premium) * 110n / 100n // 10% buffer

  const secret = randomSecret()
  const params = { name, owner, duration, secret }

  const commitHash = await commitName(wallet, params)
  console.log(`[identity] commit tx: ${commitHash} — waiting 65s for min commitment age...`)
  await new Promise(r => setTimeout(r, 65_000))

  const registerHash = await registerName(wallet, { ...params, value })
  console.log(`[identity] register tx: ${registerHash}`)

  return { commitHash, registerHash }
}

/**
 * Create a subname under a name you own.
 * e.g. registerSubname("mnemosyne.eth", "agent", owner) → creates "agent.mnemosyne.eth"
 * @returns transaction hash
 */
export async function registerSubname(
  privateKey: `0x${string}`,
  parentName: string,
  label: string,
  owner: `0x${string}`,
  options: IdentityOptions = {},
): Promise<`0x${string}`> {
  const wallet = makeWalletClient(privateKey, rpc(options))
  return wallet.writeContract({
    address: ENS_REGISTRY,
    abi: REGISTRY_ABI,
    functionName: 'setSubnodeOwner',
    args: [namehash(parentName), keccak256(toHex(label)), owner],
  })
}
