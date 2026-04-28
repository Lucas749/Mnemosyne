import { createWalletClient, createPublicClient, http, defineChain, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const zgTestnet = defineChain({
  id: 16602,
  name: '0G-Galileo-Testnet',
  nativeCurrency: { name: 'A0GI', symbol: 'A0GI', decimals: 18 },
  rpcUrls: { default: { http: ['https://evmrpc-testnet.0g.ai'] } },
})

const REGISTRY_ABI = parseAbi([
  'function submit(string storageRef, string embeddingRef, string[] tags, uint8 domain) external payable returns (bytes32)',
  'function recordQuery(bytes32 entryId, uint256 royaltyAmount) external',
])

const VAULT_ABI = parseAbi([
  'function depositQueryFee(address[] contributors, uint256[] shares) external payable',
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
