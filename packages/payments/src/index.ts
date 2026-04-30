import { createPublicClient, createWalletClient, http, parseTransaction } from 'viem'
import { mainnet, sepolia } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { getPaymentToken } from '@mnemosyne/identity'

const UNISWAP_API = 'https://trade-api.gateway.uniswap.org/v1'
const ETH_ADDRESS = '0x0000000000000000000000000000000000000000'

export interface SwapParams {
  tokenIn: string
  tokenOut: string
  amount: string        // wei string
  swapper: string       // wallet that holds ETH and signs the tx
  recipient?: string    // where output tokens land (defaults to swapper)
  chainId?: number
  slippageTolerance?: number
}

export interface QuoteResult {
  routing: string
  quote: Record<string, unknown>
  permitData: Record<string, unknown> | null
}

export interface SwapResult {
  txHash: `0x${string}`
  tokenOut: string
  amountOut: string
}

function apiKey() {
  const key = process.env.UNISWAP_API_KEY
  if (!key) throw new Error('UNISWAP_API_KEY not set in environment')
  return key
}

function headers() {
  return {
    'x-api-key': apiKey(),
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }
}

async function post(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${UNISWAP_API}${path}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(`Uniswap API ${path} ${res.status}: ${JSON.stringify(err)}`)
  }
  return res.json()
}

/** Get a quote for a swap from the Uniswap Trading API. */
export async function getQuote(params: SwapParams): Promise<QuoteResult> {
  const body: Record<string, unknown> = {
    tokenIn: params.tokenIn,
    tokenOut: params.tokenOut,
    tokenInChainId: params.chainId ?? 1,
    tokenOutChainId: params.chainId ?? 1,
    type: 'EXACT_INPUT',
    amount: params.amount,
    swapper: params.swapper,
    slippageTolerance: params.slippageTolerance ?? 0.5,
  }
  if (params.recipient && params.recipient !== params.swapper) {
    body.recipient = params.recipient
  }
  const data = await post('/quote', body) as any
  return {
    routing: data.routing,
    quote: data.quote,
    permitData: data.permitData ?? null,
  }
}

/** Build unsigned swap transaction calldata from a quote. */
export async function buildSwap(
  quote: Record<string, unknown>,
  permitData?: Record<string, unknown> | null,
  signature?: string,
): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = { quote }
  if (permitData && signature) {
    body.permitData = permitData
    body.signature = signature
  }
  const data = await post('/swap', body) as any
  return data.swap
}

/**
 * Execute a full ETH → ERC-20 swap using the Uniswap Trading API.
 * Handles quote → swap calldata → broadcast in one call.
 */
export async function swapETHForToken(
  privateKey: `0x${string}`,
  tokenOut: string,
  amountWei: bigint,
  recipientAddress: `0x${string}`,  // where output tokens land — must be resolved address, not ENS
  options: { chainId?: number; rpcUrl?: string } = {},
): Promise<SwapResult> {
  const chainId = options.chainId ?? 1
  const chain   = chainId === 11155111 ? sepolia : mainnet
  const account = privateKeyToAccount(privateKey)
  const wallet  = createWalletClient({
    chain,
    transport: http(options.rpcUrl ?? process.env.ETH_RPC_URL),
    account,
  })

  const { routing, quote, permitData } = await getQuote({
    tokenIn: ETH_ADDRESS,
    tokenOut,
    amount: amountWei.toString(),
    swapper: account.address,    // API wallet signs + pays ETH
    recipient: recipientAddress, // contributor receives the output token directly
    chainId,
  })

  let txRequest: Record<string, unknown>

  if (['DUTCH_V2', 'DUTCH_V3', 'PRIORITY'].includes(routing)) {
    // UniswapX gasless order path
    const orderData = await post('/order', { quote }) as any
    return {
      txHash: orderData.orderHash,
      tokenOut,
      amountOut: (quote as any).output?.amount ?? '0',
    }
  } else {
    txRequest = await buildSwap(quote, permitData)
  }

  if (!txRequest.data || txRequest.data === '0x') {
    throw new Error('Uniswap API returned empty transaction data')
  }

  const txHash = await wallet.sendTransaction({
    to: txRequest.to as `0x${string}`,
    data: txRequest.data as `0x${string}`,
    value: BigInt(txRequest.value as string),
    gas: txRequest.gasLimit ? BigInt(txRequest.gasLimit as string) : undefined,
  })

  return { txHash, tokenOut, amountOut: (quote as any).output?.amount ?? '0' }
}


/**
 * Route a royalty payment to a contributor.
 * Reads their preferred payment.token from ENS — if set, swaps ETH → token.
 * Falls back to sending ETH directly if no token preference is set.
 */
export async function routeRoyalty(
  privateKey: `0x${string}`,
  contributorEnsName: string,
  amountWei: bigint,
  options: { chainId?: number; rpcUrl?: string; ensRpcUrl?: string; overrideTokenOut?: string } = {},
): Promise<{ txHash: `0x${string}`; tokenOut: string; method: 'swap' | 'eth' }> {
  const chainId = options.chainId ?? 1
  const chain   = chainId === 11155111 ? sepolia : mainnet
  const rpcUrl  = options.rpcUrl ?? process.env.ETH_RPC_URL
  const account = privateKeyToAccount(privateKey)
  const wallet  = createWalletClient({ chain, transport: http(rpcUrl), account })
  const pub     = createPublicClient({ chain, transport: http(rpcUrl) })

  // Resolve ENS → address first (needed for both swap recipient and ETH send)
  const recipientAddress = await pub.getEnsAddress({ name: contributorEnsName }).catch(() => null)
  if (!recipientAddress) throw new Error(`Could not resolve ${contributorEnsName} to an address`)

  // Determine payment token: override (on-chain profile) > ENS payment.token > ETH
  const paymentToken = options.overrideTokenOut ?? await getPaymentToken(contributorEnsName, {
    ...(options.ensRpcUrl && { rpcUrl: options.ensRpcUrl }),
  })

  if (paymentToken) {
    // Swap: API wallet pays ETH → tokens land directly in contributor's wallet
    const result = await swapETHForToken(privateKey, paymentToken, amountWei, recipientAddress, options)
    return { txHash: result.txHash, tokenOut: paymentToken, method: 'swap' }
  }

  // No token preference — send ETH directly to resolved address
  const txHash = await wallet.sendTransaction({ to: recipientAddress, value: amountWei })
  return { txHash, tokenOut: ETH_ADDRESS, method: 'eth' }
}
