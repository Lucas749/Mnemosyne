import { createWalletClient, createPublicClient, http, defineChain, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { routeRoyalty } from '@mnemosyne/payments'

const zgTestnet = defineChain({
  id: 16602,
  name: '0G-Galileo-Testnet',
  nativeCurrency: { name: 'A0GI', symbol: 'A0GI', decimals: 18 },
  rpcUrls: { default: { http: ['https://evmrpc-testnet.0g.ai'] } },
})

const REGISTRY_ABI = parseAbi([
  'function submit(string storageRef, string embeddingRef, string[] tags, uint8 domain) external payable returns (bytes32)',
  'function recordQuery(bytes32 entryId, uint256 royaltyAmount) external',
  'function activateEntry(bytes32 entryId) external',
  'function getEntry(bytes32 entryId) external view returns (tuple(bytes32 id, string storageRef, string embeddingRef, string[] tags, uint8 domain, address submitter, uint256 stakeAmount, uint8 status, uint256 submittedAt, uint256 challengeWindowEnd, uint256 queryCount, uint256 royaltiesEarned, uint256 lastQueriedAt, uint256 inftTokenId))',
  'event EntryActivated(bytes32 indexed entryId, uint256 inftTokenId)',
])

const VAULT_ABI = parseAbi([
  'function depositQueryFee(address[] contributors, uint256[] shares) external payable',
  'function claimable(address) external view returns (uint256)',
])

const INFT_ABI = parseAbi([
  'function authorizeUsage(uint256 tokenId, address executor, bytes permissions) external',
  'function ownerOf(uint256 tokenId) external view returns (address)',
])

const DOMAIN_INDEX: Record<string, number> = {
  factual:          0,
  labeled_example:  1,
  structured_data:  2,
  observation:      3,
  correction:       4,
}

const MIN_STAKE = BigInt('5000000000000000') // 0.005 A0GI

function clients() {
  const key = process.env.ZG_PRIVATE_KEY
  if (!key) return null
  const rpc     = process.env.ZG_RPC_URL ?? 'https://evmrpc-testnet.0g.ai'
  const account = privateKeyToAccount(key.startsWith('0x') ? key as `0x${string}` : `0x${key}`)
  const wallet  = createWalletClient({ chain: zgTestnet, transport: http(rpc), account })
  const pub     = createPublicClient({ chain: zgTestnet, transport: http(rpc) })
  return { wallet, pub, account }
}

/**
 * Read how much A0GI each address has claimable in the RoyaltyVault on 0G.
 * Used as the proportional basis for Uniswap payouts on Sepolia.
 */
export async function readVaultClaimable(addresses: `0x${string}`[]): Promise<Map<`0x${string}`, bigint>> {
  const c = clients()
  const vault = process.env.ROYALTY_VAULT_ADDRESS as `0x${string}` | undefined
  const result = new Map<`0x${string}`, bigint>()
  if (!c || !vault) return result

  await Promise.all(addresses.map(async (addr) => {
    const amount = await c.pub.readContract({
      address: vault,
      abi: VAULT_ABI,
      functionName: 'claimable',
      args: [addr],
    }).catch(() => 0n)
    if ((amount as bigint) > 0n) result.set(addr, amount as bigint)
  }))

  return result
}

export interface DistributeEntry {
  ensName: string     // contributor's ENS name (has payment.token on Sepolia)
  amountWei: bigint   // how much to route
}

export interface DistributeResult {
  ensName: string
  txHash: `0x${string}`
  tokenOut: string
  method: 'swap' | 'eth'
}

/**
 * Route royalty payments to contributors via Uniswap.
 * Reads each contributor's payment.token from ENS and swaps ETH → preferred token.
 * Falls back to sending ETH directly if no token preference is set.
 * Runs on Ethereum/Sepolia (ROYALTY_CHAIN_ID), NOT on 0G chain.
 */
export async function distributeViaUniswap(
  entries: DistributeEntry[],
): Promise<DistributeResult[]> {
  const key = process.env.ZG_PRIVATE_KEY
  if (!key) throw new Error('ZG_PRIVATE_KEY not set')

  const pk       = (key.startsWith('0x') ? key : `0x${key}`) as `0x${string}`
  const chainId  = parseInt(process.env.ROYALTY_CHAIN_ID ?? '1')
  const rpcUrl   = process.env.ETH_RPC_URL
  const ensRpc   = process.env.SEPOLIA_RPC

  const results: DistributeResult[] = []

  for (const entry of entries) {
    const { txHash, tokenOut, method } = await routeRoyalty(pk, entry.ensName, entry.amountWei, {
      chainId,
      rpcUrl,
      ensRpcUrl: ensRpc,
    })
    results.push({ ensName: entry.ensName, txHash, tokenOut, method })
  }

  return results
}

export function getOperatorAddress(): `0x${string}` | null {
  const key = process.env.ZG_PRIVATE_KEY
  if (!key) return null
  return privateKeyToAccount(key.startsWith('0x') ? key as `0x${string}` : `0x${key}`).address
}

/**
 * Call MnemosyneRegistry.submit() on 0G testnet.
 * Returns the on-chain bytes32 entryId from the transaction receipt, or null if unconfigured.
 */
export async function submitOnChain(
  storageRef: string,
  embeddingRef: string,
  tags: string[],
  domain: string,
): Promise<`0x${string}` | null> {
  const c = clients()
  if (!c) return null
  const registry = process.env.MNEMOSYNE_REGISTRY_ADDRESS as `0x${string}` | undefined
  if (!registry) return null

  const hash = await c.wallet.writeContract({
    address: registry,
    abi: REGISTRY_ABI,
    functionName: 'submit',
    args: [storageRef, embeddingRef, tags, DOMAIN_INDEX[domain] ?? 0],
    value: MIN_STAKE,
  })

  const receipt = await c.pub.waitForTransactionReceipt({ hash })
  // entryId is the return value — encoded in the first log topic of EntrySubmitted event
  const log = receipt.logs[0]
  return (log?.topics[1] ?? null) as `0x${string}` | null
}

/**
 * Call MnemosyneRegistry.activateEntry() after the challenge window passes.
 * Returns the iNFT tokenId from the EntryActivated event, or null on failure.
 */
export async function activateEntryOnChain(entryId: `0x${string}`): Promise<bigint | null> {
  const c = clients()
  if (!c) return null
  const registry = process.env.MNEMOSYNE_REGISTRY_ADDRESS as `0x${string}` | undefined
  if (!registry) return null

  const hash = await c.wallet.writeContract({
    address: registry,
    abi: REGISTRY_ABI,
    functionName: 'activateEntry',
    args: [entryId],
  })

  const receipt = await c.pub.waitForTransactionReceipt({ hash })
  const log = receipt.logs.find(l => l.topics[0] === '0x' + Buffer.from('EntryActivated(bytes32,uint256)').toString('hex'))
  // topics[2] is the inftTokenId (2nd indexed arg)
  const tokenIdHex = receipt.logs[0]?.topics[2]
  return tokenIdHex ? BigInt(tokenIdHex) : null
}

/**
 * Read Entry from the registry and return its inftTokenId (0 if not yet activated).
 */
export async function getInftTokenId(entryId: `0x${string}`): Promise<bigint> {
  const c = clients()
  const registry = process.env.MNEMOSYNE_REGISTRY_ADDRESS as `0x${string}` | undefined
  if (!c || !registry) return 0n

  const entry = await c.pub.readContract({
    address: registry,
    abi: REGISTRY_ABI,
    functionName: 'getEntry',
    args: [entryId],
  }) as { inftTokenId: bigint }

  return entry.inftTokenId
}

/**
 * Resolve the current iNFT owner — royalties follow the token, not the original submitter.
 * Falls back to the provided fallback address if iNFT is not yet minted or chain is unavailable.
 */
export async function resolveRoyaltyRecipient(
  tokenId: bigint,
  fallback: `0x${string}`,
): Promise<`0x${string}`> {
  const c = clients()
  const inft = process.env.MNEMOSYNE_INFT_ADDRESS as `0x${string}` | undefined
  if (!c || !inft) return fallback

  const owner = await c.pub.readContract({
    address: inft,
    abi: INFT_ABI,
    functionName: 'ownerOf',
    args: [tokenId],
  }).catch(() => null)

  return (owner as `0x${string}` | null) ?? fallback
}

/**
 * Call MnemosyneINFT.authorizeUsage() — grants a querying agent read rights
 * without transferring ownership. Implements the ERC-7857 AIaaS pattern.
 */
export async function authorizeUsageOnChain(
  tokenId: bigint,
  executor: `0x${string}`,
  permissions: `0x${string}`,
): Promise<`0x${string}` | null> {
  const c = clients()
  if (!c) return null
  const inft = process.env.MNEMOSYNE_INFT_ADDRESS as `0x${string}` | undefined
  if (!inft) return null

  return c.wallet.writeContract({
    address: inft,
    abi: INFT_ABI,
    functionName: 'authorizeUsage',
    args: [tokenId, executor, permissions],
  })
}

/**
 * Call RoyaltyVault.depositQueryFee() on 0G testnet.
 * Splits the fee equally across all contributor addresses.
 * Non-funded or unconfigured silently returns null.
 */
export async function depositQueryFeeOnChain(
  contributors: `0x${string}`[],
  valueWei: bigint,
): Promise<`0x${string}` | null> {
  const c = clients()
  if (!c || contributors.length === 0) return null
  const vault = process.env.ROYALTY_VAULT_ADDRESS as `0x${string}` | undefined
  if (!vault) return null

  const n      = BigInt(contributors.length)
  const share  = BigInt(10000) / n
  const shares = contributors.map((_, i) =>
    i === contributors.length - 1 ? BigInt(10000) - share * (n - BigInt(1)) : share,
  )

  return c.wallet.writeContract({
    address: vault,
    abi: VAULT_ABI,
    functionName: 'depositQueryFee',
    args: [contributors, shares],
    value: valueWei,
  })
}
