import { describe, it, expect } from 'vitest'
import { config } from 'dotenv'
import { resolve } from 'path'
import { getMemoryIndex, getPaymentToken, setMemoryIndex, setPaymentToken } from './index.js'

config({ path: resolve(__dirname, '../../../.env') })

describe('exports', () => {
  it('exports all four functions', () => {
    expect(typeof getMemoryIndex).toBe('function')
    expect(typeof setMemoryIndex).toBe('function')
    expect(typeof getPaymentToken).toBe('function')
    expect(typeof setPaymentToken).toBe('function')
  })
})

const SEPOLIA_RPC = process.env.SEPOLIA_RPC
const skipIfNoRpc = SEPOLIA_RPC ? describe : describe.skip

skipIfNoRpc('live ENS reads (requires SEPOLIA_RPC env)', () => {
  // ens.eth is a well-known name that exists on mainnet; on Sepolia we expect null back
  it('returns null or string for memory.index on a known name', async () => {
    const result = await getMemoryIndex('ens.eth', { rpcUrl: SEPOLIA_RPC })
    expect(result === null || typeof result === 'string').toBe(true)
  }, 10_000)

  it('returns null or string for payment.token on a known name', async () => {
    const result = await getPaymentToken('ens.eth', { rpcUrl: SEPOLIA_RPC })
    expect(result === null || typeof result === 'string').toBe(true)
  }, 10_000)
})
