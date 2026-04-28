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
  swapper: string       // wallet address
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
  const body = {
    tokenIn: params.tokenIn,
    tokenOut: params.tokenOut,
    tokenInChainId: params.chainId ?? 1,
    tokenOutChainId: params.chainId ?? 1,
    type: 'EXACT_INPUT',
    amount: params.amount,
    swapper: params.swapper,
    slippageTolerance: params.slippageTolerance ?? 0.5,
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
  recipient: string,
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
  const pub = createPublicClient({ chain, transport: http(options.rpcUrl ?? process.env.ETH_RPC_URL) })

  const { routing, quote, permitData } = await getQuote({
    tokenIn: ETH_ADDRESS,
    tokenOut,
    amount: amountWei.toString(),
    swapper: account.address,
    chainId,
  })

  let txRequest: Record<string, unknown>

  if (['DUTCH_V2', 'DUTCH_V3', 'PRIORITY'].includes(routing)) {
    // UniswapX gasless order path
    const orderData = await post('/order', { quote }) as any
    return {
      txHash: orderData.orderHash,
      tokenOut,
      amountOut: (quote as any).quoteDecimals ?? '0',
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

  return { txHash, tokenOut, amountOut: (quote as any).quoteDecimals ?? '0' }
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
  options: { chainId?: number; rpcUrl?: string; ensRpcUrl?: string } = {},
): Promise<{ txHash: `0x${string}`; tokenOut: string; method: 'swap' | 'eth' }> {
  const paymentToken = await getPaymentToken(contributorEnsName, { rpcUrl: options.ensRpcUrl })

  if (paymentToken) {
    const result = await swapETHForToken(privateKey, paymentToken, amountWei, contributorEnsName, options)
    return { txHash: result.txHash, tokenOut: paymentToken, method: 'swap' }
  }

  // No token preference — send ETH directly
  const account = privateKeyToAccount(privateKey)
  const chainId = options.chainId ?? 1
  const chain   = chainId === 11155111 ? sepolia : mainnet
  const wallet  = createWalletClient({
    chain,
    transport: http(options.rpcUrl ?? process.env.ETH_RPC_URL),
    account,
  })

  // Resolve ENS name to address for direct ETH send
  const pub = createPublicClient({ chain, transport: http(options.rpcUrl ?? process.env.ETH_RPC_URL) })
  const address = await pub.getEnsAddress({ name: contributorEnsName }).catch(() => null)
  if (!address) throw new Error(`Could not resolve ${contributorEnsName} to an address`)

  const txHash = await wallet.sendTransaction({ to: address, value: amountWei })
  return { txHash, tokenOut: ETH_ADDRESS, method: 'eth' }
}
