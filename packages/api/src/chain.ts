import { createWalletClient, createPublicClient, http, defineChain, decodeEventLog } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { routeRoyalty } from '@mnemosyne/payments'

import { withRetry } from './retry.js'

// Deployed contract addresses — overridable via env vars
const ADDR = {
  registry: (process.env.MNEMOSYNE_REGISTRY_ADDRESS ?? '0xaA40404DC25248c886c8fb6C27e34536aB2b8001') as `0x${string}`,
  inft:     (process.env.MNEMOSYNE_INFT_ADDRESS     ?? '0x8fbDb7666F8D301d9C974982764ab1B39917cc82') as `0x${string}`,
  market:   (process.env.MNEMOSYNE_MARKET_ADDRESS   ?? '0x8fADa38137C0407800c0320BBf6985D08016E8A3') as `0x${string}`,
  challenge:(process.env.CHALLENGE_ADDRESS           ?? '0xAe66d96339f43F72BCB0164F70E0cB90FA959166') as `0x${string}`,
  vault:    (process.env.ROYALTY_VAULT_ADDRESS       ?? '0x4ad5B6a01CDCAcaC31Ce89e9B6e92EB5c8207507') as `0x${string}`,
}

const zgTestnet = defineChain({
  id: 16602,
  name: '0G-Galileo-Testnet',
  nativeCurrency: { name: 'A0GI', symbol: 'A0GI', decimals: 18 },
  rpcUrls: { default: { http: ['https://evmrpc-testnet.0g.ai'] } },
})

// JSON ABI format — parseAbi can't handle named tuple returns in this version of abitype
const REGISTRY_ABI = [
  { name: 'submit', type: 'function', stateMutability: 'payable',
    inputs: [{ name: 'storageRef', type: 'string' }, { name: 'embeddingRef', type: 'string' }, { name: 'tags', type: 'string[]' }, { name: 'domain', type: 'uint8' }],
    outputs: [{ type: 'bytes32' }] },
  { name: 'recordQuery', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'entryId', type: 'bytes32' }, { name: 'royaltyAmount', type: 'uint256' }], outputs: [] },
  { name: 'activateEntry', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'entryId', type: 'bytes32' }], outputs: [] },
  { name: 'getEntry', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'entryId', type: 'bytes32' }],
    outputs: [{ type: 'tuple', components: [
      { name: 'id', type: 'bytes32' }, { name: 'storageRef', type: 'string' }, { name: 'embeddingRef', type: 'string' },
      { name: 'tags', type: 'string[]' }, { name: 'domain', type: 'uint8' }, { name: 'submitter', type: 'address' },
      { name: 'stakeAmount', type: 'uint256' }, { name: 'status', type: 'uint8' }, { name: 'submittedAt', type: 'uint256' },
      { name: 'challengeWindowEnd', type: 'uint256' }, { name: 'queryCount', type: 'uint256' },
      { name: 'royaltiesEarned', type: 'uint256' }, { name: 'lastQueriedAt', type: 'uint256' },
      { name: 'inftTokenId', type: 'uint256' },
    ] }] },
  { name: 'getProfile', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ type: 'tuple', components: [
      { name: 'paymentToken', type: 'address' }, { name: 'ensName', type: 'string' },
      { name: 'totalEntries', type: 'uint256' }, { name: 'totalQueries', type: 'uint256' }, { name: 'totalRoyalties', type: 'uint256' },
    ] }] },
  { name: 'getSubmitterEntries', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'submitter', type: 'address' }], outputs: [{ type: 'bytes32[]' }] },
  { name: 'getAllEntries', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'offset', type: 'uint256' }, { name: 'limit', type: 'uint256' }], outputs: [{ type: 'bytes32[]' }] },
  { name: 'getTotalEntryCount', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'event', name: 'EntrySubmitted', inputs: [
    { name: 'entryId', type: 'bytes32', indexed: true },
    { name: 'submitter', type: 'address', indexed: true },
    { name: 'stake', type: 'uint256', indexed: false },
  ] },
  { type: 'event', name: 'EntryActivated',
    inputs: [{ name: 'entryId', type: 'bytes32', indexed: true }, { name: 'inftTokenId', type: 'uint256', indexed: false }] },
] as const

const VAULT_ABI = [
  { name: 'depositQueryFee', type: 'function', stateMutability: 'payable',
    inputs: [{ name: 'contributors', type: 'address[]' }, { name: 'shares', type: 'uint256[]' }], outputs: [] },
  { name: 'claimable', type: 'function', stateMutability: 'view',
    inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const

const INFT_ABI = [
  { name: 'authorizeUsage', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'tokenId', type: 'uint256' }, { name: 'executor', type: 'address' }, { name: 'permissions', type: 'bytes' }], outputs: [] },
  { name: 'ownerOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'address' }] },
  { name: 'approve', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'to', type: 'address' }, { name: 'tokenId', type: 'uint256' }], outputs: [] },
] as const

const MARKET_ABI = [
  { name: 'listFor', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'tokenId', type: 'uint256' }, { name: 'seller', type: 'address' }, { name: 'price', type: 'uint256' }], outputs: [] },
  { name: 'buyFor', type: 'function', stateMutability: 'payable',
    inputs: [{ name: 'tokenId', type: 'uint256' }, { name: 'recipient', type: 'address' }], outputs: [] },
  { name: 'cancel', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [] },
  { name: 'updatePrice', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'tokenId', type: 'uint256' }, { name: 'newPrice', type: 'uint256' }], outputs: [] },
  { name: 'listings', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: 'seller', type: 'address' }, { name: 'price', type: 'uint256' }, { name: 'active', type: 'bool' }] },
  { name: 'getActiveListings', type: 'function', stateMutability: 'view', inputs: [],
    outputs: [
      { name: 'tokenIds', type: 'uint256[]' },
      { name: 'lst', type: 'tuple[]', components: [{ name: 'seller', type: 'address' }, { name: 'price', type: 'uint256' }, { name: 'active', type: 'bool' }] },
    ] },
] as const

const DOMAIN_INDEX: Record<string, number> = {
  factual:          0,
  labeled_example:  1,
  structured_data:  2,
  observation:      3,
  correction:       4,
}

const MIN_STAKE = BigInt('5000000000000000') // 0.005 A0GI

/** Exported for docs / tooling — must match MnemosyneRegistry.MIN_STAKE on Galileo testnet */
export const REGISTRY_SUBMIT_STAKE_WEI = MIN_STAKE

function decodeEntrySubmittedFromReceipt(
  receipt: { logs: readonly { address: `0x${string}`; data: `0x${string}`; topics: readonly `0x${string}`[] }[] },
  registry: `0x${string}`,
): `0x${string}` | null {
  const reg = registry.toLowerCase()
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== reg) continue
    try {
      const decoded = decodeEventLog({ abi: REGISTRY_ABI, data: log.data, topics: log.topics })
      if (decoded.eventName === 'EntrySubmitted') {
        return decoded.args.entryId as `0x${string}`
      }
    } catch {
      continue
    }
  }
  return null
}

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
  const vault = ADDR.vault
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
  ensName: string              // contributor's ENS name
  amountWei: bigint            // how much to route
  address?: `0x${string}`     // contributor's address — used to read on-chain paymentToken
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

  const registry = ADDR.registry
  const c        = clients()
  const results: DistributeResult[] = []

  for (const entry of entries) {
    // Prefer on-chain paymentToken (setProfile) — ENS payment.token is fallback
    let overrideTokenOut: string | undefined
    if (c && registry && entry.address) {
      const profile = await c.pub.readContract({
        address: registry,
        abi: REGISTRY_ABI,
        functionName: 'getProfile',
        args: [entry.address as `0x${string}`],
      }).catch(() => null) as { paymentToken: string } | null
      const zero = '0x0000000000000000000000000000000000000000'
      if (profile?.paymentToken && profile.paymentToken !== zero) {
        overrideTokenOut = profile.paymentToken
      }
    }

    const { txHash, tokenOut, method } = await routeRoyalty(pk, entry.ensName, entry.amountWei, {
      chainId,
      rpcUrl,
      ensRpcUrl: ensRpc,
      ...(overrideTokenOut && { overrideTokenOut }),
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

const ZG_RECEIPT_POLL_MS = Number(process.env.ZG_RECEIPT_POLL_MS ?? 4_000)
const ZG_RECEIPT_WAIT_MS = Number(process.env.ZG_RECEIPT_WAIT_MS ?? 600_000)
const ZG_RECEIPT_FALLBACK_POLLS = Math.max(60, Number(process.env.ZG_RECEIPT_FALLBACK_POLLS ?? 180))

/**
 * Call MnemosyneRegistry.submit() on 0G testnet.
 * Returns the on-chain bytes32 entryId from the transaction receipt, or null if unconfigured.
 */
export async function submitOnChain(
  storageRef: string,
  embeddingRef: string,
  tags: string[],
  domain: string,
): Promise<{ entryId: `0x${string}` | null; txHash: `0x${string}` | null }> {
  const t0 = Date.now()
  const stamp = () => `[submitOnChain +${Date.now() - t0}ms]`
  const rpcUrl = process.env.ZG_RPC_URL ?? 'https://evmrpc-testnet.0g.ai'
  const c = clients()
  if (!c) {
    console.error(
      `[submitOnChain ${stamp()}] skip: ZG_PRIVATE_KEY is missing — no Galileo MnemosyneRegistry.submit; storage may succeed without chain.`,
    )
    return { entryId: null, txHash: null }
  }
  const registry = ADDR.registry
  const domainKey = typeof domain === 'string' ? domain.trim().toLowerCase() : 'factual'
  const domainIndex = DOMAIN_INDEX[domainKey] ?? 0
  const args = [storageRef, embeddingRef, tags, domainIndex] as const

  console.log(
    `${stamp()} args ready registry=${registry} operator=${c.account.address} stakeWei=${MIN_STAKE.toString()} domain="${domain}"->enum=${domainIndex} tags=${tags.length} storageRefLen=${storageRef.length} embedding=${embeddingRef ? 'yes' : 'empty'}`,
  )

  // Simulate first — tx may succeed even when simulate is flaky on some RPCs.
  let simulatedId: `0x${string}` | null = null
  try {
    const { result } = await withRetry(
      () => c.pub.simulateContract({
        address: registry,
        abi: REGISTRY_ABI,
        functionName: 'submit',
        args,
        value: MIN_STAKE,
        account: c.account,
      }),
      { maxAttempts: 3, baseDelayMs: 280, label: '[submitOnChain] simulate' },
    )
    simulatedId = result as `0x${string}`
    if (simulatedId) console.log(`${stamp()} simulateContract ok preliminaryBytes32=${simulatedId}`)
  } catch (simErr) {
    const em = simErr as { shortMessage?: string; message?: string; details?: string }
    console.warn(`${stamp()} simulateContract failed — continuing to write anyway:`,
      em.shortMessage ?? em.message ?? em.details ?? String(simErr).slice(0, 160))
  }

  console.log(`${stamp()} MnemosyneRegistry.submit writeContract broadcast…`)

  const hash = await withRetry(
    () => c.wallet.writeContract({
      address: registry,
      abi: REGISTRY_ABI,
      functionName: 'submit',
      args,
      value: MIN_STAKE,
    }),
    { maxAttempts: 4, baseDelayMs: 500, label: '[submitOnChain] writeContract' },
  )
  console.log(`${stamp()} HASH_BROADCAST explorer https://chainscan-galileo.0g.ai/tx/${hash}`)

  const waitPrimaryMs = Number.isFinite(ZG_RECEIPT_WAIT_MS) && ZG_RECEIPT_WAIT_MS > 60_000 ? ZG_RECEIPT_WAIT_MS : 600_000
  const POLL_MS = Number.isFinite(ZG_RECEIPT_POLL_MS) && ZG_RECEIPT_POLL_MS > 500 ? ZG_RECEIPT_POLL_MS : 4_000
  const POLL_MAX = Number.isFinite(ZG_RECEIPT_FALLBACK_POLLS) ? Math.max(60, ZG_RECEIPT_FALLBACK_POLLS) : 180

  let receipt: Awaited<ReturnType<typeof c.pub.waitForTransactionReceipt>> | null = null

  console.log(`${stamp()} waitForTransactionReceipt start timeoutMs=${waitPrimaryMs} pollMs=${POLL_MS} HASH=${hash}`)
  try {
    receipt = await c.pub.waitForTransactionReceipt({
      hash,
      timeout: waitPrimaryMs,
      pollingInterval: POLL_MS,
    })
    console.log(
      `${stamp()} waitForTransactionReceipt resolved block=${receipt.blockNumber?.toString() ?? '?'} status=${receipt.status}`,
    )
  } catch (waitErr) {
    console.warn(
      `${stamp()} waitForTransactionReceipt gave up (${(waitErr as Error)?.shortMessage ?? (waitErr as Error)?.message ?? waitErr}); manual receipt polls ${POLL_MAX}×/${POLL_MS}ms SAME_HASH`,
      hash,
    )
    for (let i = 0; i < POLL_MAX; i++) {
      receipt = await c.pub.getTransactionReceipt({ hash }).catch(() => null)
      if (receipt) {
        console.log(
          `${stamp()} receipt OK via fallback poll (${i + 1}/${POLL_MAX}) block=${receipt.blockNumber?.toString() ?? '?'} status=${receipt.status} logs=${receipt.logs?.length ?? 0} gasUsed=${receipt.gasUsed?.toString() ?? '?'}`,
        )
        break
      }
      if ((i + 1) % 15 === 0) {
        const pending = await c.pub.getTransaction({ hash }).catch(() => null)
        console.warn(
          `${stamp()} fallback heartbeat ${i + 1}/${POLL_MAX}: no receipt yet; getTransaction=${pending ? `nonce=${pending.nonce}` : 'null'}`,
        )
      }
      await new Promise(r => setTimeout(r, POLL_MS))
    }
    if (!receipt) {
      console.error(`${stamp()} RECEIPT MISSING after primary+${POLL_MAX} polls — HASH=${hash} persisted; next poll will need explorer/manual`)
      return { entryId: simulatedId, txHash: hash }
    }
  }

  const confirmationsStr = receipt.confirmations !== undefined ? String(receipt.confirmations) : '?'
  console.log(
    `${stamp()} RECEIPT FINAL HASH=${hash} status=${receipt.status} block=${receipt.blockNumber?.toString() ?? '?'} logs=${receipt.logs?.length ?? 0} gasUsed=${receipt.gasUsed?.toString() ?? '?'} confirmations=${confirmationsStr}`,
  )
  if (receipt.status !== 'success') {
    console.error(`${stamp()} transaction NOT success on-chain HASH=${hash}`)
    return { entryId: simulatedId, txHash: hash }
  }

  const entryIdFromLog = decodeEntrySubmittedFromReceipt(receipt, registry)
  const finalId = entryIdFromLog ?? simulatedId
  if (!entryIdFromLog) {
    const reg = registry.toLowerCase()
    console.warn(
      `${stamp()} EntrySubmitted log missing — simulatedId fallback=${simulatedId} registryMatchedLogs=${receipt.logs.filter(l => l.address.toLowerCase() === reg).length}`,
    )
  }
  console.log(`${stamp()} SUCCESS canonicalEntryId=${finalId} HASH=${hash} totalElapsed=${Date.now() - t0}ms`)
  return { entryId: finalId, txHash: hash }
}

/**
 * Call MnemosyneRegistry.activateEntry() after the challenge window passes.
 * Returns the iNFT tokenId from the EntryActivated event, or null on failure.
 */
export async function activateEntryOnChain(entryId: `0x${string}`): Promise<bigint | null> {
  const c = clients()
  if (!c) return null
  const registry = ADDR.registry

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
 * Read a full Entry struct from the registry on-chain.
 */
export async function getEntryFromChain(entryId: `0x${string}`): Promise<{
  storageRef: string; embeddingRef: string; tags: string[]; domain: number
  submitter: `0x${string}`; stakeAmount: bigint; status: number; inftTokenId: bigint
} | null> {
  const c = clients()
  const registry = ADDR.registry
  if (!c || !registry) return null
  try {
    return await withRetry(
      () => c.pub.readContract({
        address: registry, abi: REGISTRY_ABI, functionName: 'getEntry', args: [entryId],
      }) as Promise<{
        storageRef: string; embeddingRef: string; tags: string[]; domain: number
        submitter: `0x${string}`; stakeAmount: bigint; status: number; inftTokenId: bigint
      }>,
      { maxAttempts: 4, baseDelayMs: 300, label: '[getEntryFromChain]' },
    )
  } catch (err) {
    console.warn('[getEntryFromChain]', entryId.slice(0, 18) + '…', (err as Error).message?.slice(0, 100))
    return null
  }
}

/**
 * Read Entry from the registry and return its inftTokenId (0 if not yet activated).
 */
export async function getInftTokenId(entryId: `0x${string}`): Promise<bigint> {
  const c = clients()
  const registry = ADDR.registry
  if (!c || !registry) return 0n

  const entry = await withRetry(
    () => c.pub.readContract({
      address: registry,
      abi: REGISTRY_ABI,
      functionName: 'getEntry',
      args: [entryId],
    }) as Promise<{ inftTokenId: bigint }>,
    { maxAttempts: 4, baseDelayMs: 300, label: '[getInftTokenId]' },
  )

  return entry.inftTokenId
}

/**
 * Resolve the current royalty recipient for a token.
 * Royalties follow the iNFT owner — but while a token is held in the market escrow,
 * ownerOf() returns the market contract. In that case we look up the listing's seller
 * so royalties continue flowing to them until the sale completes.
 */
export async function resolveRoyaltyRecipient(
  tokenId: bigint,
  fallback: `0x${string}`,
): Promise<`0x${string}`> {
  const c = clients()
  const inft   = ADDR.inft
  const market = marketAddress()
  if (!c || !inft) return fallback

  const owner = await c.pub.readContract({
    address: inft,
    abi: INFT_ABI,
    functionName: 'ownerOf',
    args: [tokenId],
  }).catch(() => null) as `0x${string}` | null

  if (!owner) return fallback

  // If the iNFT is sitting in escrow, route royalties to the seller, not the contract
  if (market && owner.toLowerCase() === market.toLowerCase()) {
    const listing = await c.pub.readContract({
      address: market,
      abi: MARKET_ABI,
      functionName: 'listings',
      args: [tokenId],
    }).catch(() => null) as { seller: `0x${string}`; price: bigint; active: boolean } | null

    if (listing?.active && listing.seller) return listing.seller
  }

  return owner
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
  const inft = ADDR.inft

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
  const vault = ADDR.vault

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

export interface MarketListing {
  tokenId: bigint
  seller: `0x${string}`
  price: bigint
  active: boolean
}

function marketAddress() {
  return ADDR.market
}

export async function getActiveListings(): Promise<MarketListing[]> {
  const c = clients()
  const market = marketAddress()
  if (!c || !market) return []

  const result = await c.pub.readContract({
    address: market,
    abi: MARKET_ABI,
    functionName: 'getActiveListings',
  }) as [bigint[], { seller: `0x${string}`; price: bigint; active: boolean }[]]

  const [tokenIds, lst] = result
  return tokenIds.map((tokenId, i) => ({ tokenId, ...lst[i] }))
}

export async function listOnMarket(
  tokenId: bigint,
  sellerAddress: `0x${string}`,
  priceWei: bigint,
): Promise<`0x${string}` | null> {
  const c = clients()
  const market = marketAddress()
  const inft   = ADDR.inft
  if (!c || !market || !inft) return null

  // Approve market to move the iNFT (API wallet owns it after minting)
  await c.wallet.writeContract({
    address: inft,
    abi: INFT_ABI,
    functionName: 'approve',
    args: [market, tokenId],
  })

  return c.wallet.writeContract({
    address: market,
    abi: MARKET_ABI,
    functionName: 'listFor',
    args: [tokenId, sellerAddress, priceWei],
  })
}

export async function buyFromMarket(
  tokenId: bigint,
  recipientAddress: `0x${string}`,
  priceWei: bigint,
): Promise<`0x${string}` | null> {
  const c = clients()
  const market = marketAddress()
  if (!c || !market) return null

  return c.wallet.writeContract({
    address: market,
    abi: MARKET_ABI,
    functionName: 'buyFor',
    args: [tokenId, recipientAddress],
    value: priceWei,
  })
}

export async function cancelMarketListing(tokenId: bigint): Promise<`0x${string}` | null> {
  const c = clients()
  const market = marketAddress()
  if (!c || !market) return null

  return c.wallet.writeContract({
    address: market,
    abi: MARKET_ABI,
    functionName: 'cancel',
    args: [tokenId],
  })
}

export async function updateMarketPrice(tokenId: bigint, newPriceWei: bigint): Promise<`0x${string}` | null> {
  const c = clients()
  const market = marketAddress()
  if (!c || !market) return null

  return c.wallet.writeContract({
    address: market,
    abi: MARKET_ABI,
    functionName: 'updatePrice',
    args: [tokenId, newPriceWei],
  })
}
