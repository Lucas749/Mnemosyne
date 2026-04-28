import { describe, it, expect, beforeAll } from 'vitest'
import type { ComputeClient } from '../client.js'
import { createComputeClient } from '../client.js'
import { verifyClaim } from '../verify.js'

const PRIVATE_KEY = process.env['ZG_PRIVATE_KEY']
const RUN = !!PRIVATE_KEY

let client: ComputeClient

describe('verifyClaim', () => {
  beforeAll(async () => {
    if (!RUN) return
    client = await createComputeClient({ privateKey: PRIVATE_KEY! })
  })

  it('upholds a clearly correct entry', { skip: !RUN }, async () => {
    const result = await verifyClaim(
      client,
      'The Ethereum merge happened on September 15, 2022.',
      'This is wrong, the merge never happened.',
    )
    console.log('Verdict (should uphold):', result)
    expect(result.verdict).toBe('uphold')
    expect(result.confidence).toBeGreaterThan(0.5)
    expect(result.reasoning).toBeTruthy()
  })

  it('overturns a clearly wrong entry', { skip: !RUN }, async () => {
    const result = await verifyClaim(
      client,
      'The Ethereum merge happened on January 1, 2010.',
      'This date is completely wrong.',
      'The Ethereum network did not exist in 2010. The merge occurred in September 2022.',
    )
    console.log('Verdict (should overturn):', result)
    expect(result.verdict).toBe('overturn')
    expect(result.confidence).toBeGreaterThan(0.5)
  })

  it('returns a verdict with all required fields', { skip: !RUN }, async () => {
    const result = await verifyClaim(
      client,
      'Bitcoin was created by Satoshi Nakamoto.',
      'This is disputed.',
    )
    expect(['uphold', 'overturn']).toContain(result.verdict)
    expect(typeof result.confidence).toBe('number')
    expect(result.confidence).toBeGreaterThanOrEqual(0)
    expect(result.confidence).toBeLessThanOrEqual(1)
    expect(typeof result.reasoning).toBe('string')
    expect(typeof result.teeVerified).toBe('boolean')
  })
})
