import { describe, it, expect, vi, beforeEach } from 'vitest'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(__dirname, '../../../.env') })

// Mock fetch globally for unit tests
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock identity package so we don't need a real ENS call
vi.mock('@mnemosyne/identity', () => ({
  getPaymentToken: vi.fn().mockResolvedValue(null),
}))

import { getQuote, buildSwap } from './index.js'

function mockApiResponse(body: unknown, status = 200) {
  mockFetch.mockResolvedValueOnce({
    ok: status < 400,
    status,
    json: async () => body,
    statusText: status === 200 ? 'OK' : 'Error',
  })
}

beforeEach(() => { mockFetch.mockReset() })

describe('getQuote', () => {
  it('calls the Uniswap quote endpoint with correct params', async () => {
    process.env.UNISWAP_API_KEY = 'test-key'
    mockApiResponse({
      routing: 'CLASSIC',
      quote: { output: { amountDecimals: '1000' } },
      permitData: null,
    })

    const result = await getQuote({
      tokenIn: '0x0000000000000000000000000000000000000000',
      tokenOut: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      amount: '1000000000000000000',
      swapper: '0xf2a38D8B44DdD5e12AB955d22f1EABcad0B32eAc',
      chainId: 1,
    })

    expect(result.routing).toBe('CLASSIC')
    expect(result.permitData).toBeNull()

    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://trade-api.gateway.uniswap.org/v1/quote')
    const body = JSON.parse(opts.body as string)
    expect(body.type).toBe('EXACT_INPUT')
    expect(body.tokenIn).toBe('0x0000000000000000000000000000000000000000')
    expect((opts.headers as Record<string, string>)['x-api-key']).toBe('test-key')
  })

  it('throws on non-200 response', async () => {
    process.env.UNISWAP_API_KEY = 'test-key'
    mockApiResponse({ error: 'No quotes available', message: 'No routes found' }, 400)
    await expect(getQuote({
      tokenIn: '0x000',
      tokenOut: '0x000',
      amount: '1',
      swapper: '0x000',
    })).rejects.toThrow('Uniswap API /quote 400')
  })
})

describe('buildSwap', () => {
  it('calls /swap and returns transaction request', async () => {
    process.env.UNISWAP_API_KEY = 'test-key'
    const mockTx = { to: '0xRouter', data: '0xcalldata', value: '0', gasLimit: '200000' }
    mockApiResponse({ swap: mockTx })

    const quote = { quoteId: 'abc123', methodParameters: {} }
    const tx = await buildSwap(quote)

    expect(tx).toEqual(mockTx)
    const [url] = mockFetch.mock.calls[0] as [string]
    expect(url).toBe('https://trade-api.gateway.uniswap.org/v1/swap')
  })
})

describe('missing API key', () => {
  it('throws clearly when UNISWAP_API_KEY is not set', async () => {
    const saved = process.env.UNISWAP_API_KEY
    delete process.env.UNISWAP_API_KEY
    try {
      await expect(getQuote({
        tokenIn: '0x0',
        tokenOut: '0x0',
        amount: '1',
        swapper: '0x0',
      })).rejects.toThrow('UNISWAP_API_KEY not set')
    } finally {
      if (saved) process.env.UNISWAP_API_KEY = saved
    }
  })
})

// ─── Live tests (skipped unless UNISWAP_API_KEY is set in env) ───────────────

const USDC    = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const ETH     = '0x0000000000000000000000000000000000000000'
const WALLET  = '0xf2a38D8B44DdD5e12AB955d22f1EABcad0B32eAc'
const HAS_KEY = !!process.env.UNISWAP_API_KEY

const liveDescribe = HAS_KEY ? describe : describe.skip

liveDescribe('live: Uniswap Trading API', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    config({ path: resolve(__dirname, '../../../.env'), override: true })
  })

  it('gets a real ETH → USDC quote on mainnet', async () => {
    const result = await getQuote({
      tokenIn: ETH,
      tokenOut: USDC,
      amount: '10000000000000000', // 0.01 ETH
      swapper: WALLET,
      chainId: 1,
    })

    expect(result.routing).toBeTruthy()
    const output = (result.quote as any).output
    const amountOut = output?.amount
    expect(Number(amountOut)).toBeGreaterThan(0)
    expect(result.permitData).toBeNull()
    console.log(`  routing: ${result.routing}  →  ${amountOut} USDC  (0.01 ETH in)`)
  }, 15_000)
})

