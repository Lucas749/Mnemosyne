import { describe, it, expect, beforeAll } from 'vitest'
import { createComputeClient } from '@mnemosyne/compute'
import { createStorageClient } from '@mnemosyne/storage'
import { MnemosyneMemory } from '../MnemosyneMemory.js'

// mirrors the private function in MnemosyneMemory.ts — tests the mathematical properties
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error('Vector dimension mismatch')
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot   += a[i]! * b[i]!
    normA += a[i]! * a[i]!
    normB += b[i]! * b[i]!
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const v = [1, 0, 0, 1]
    expect(cosineSimilarity(v, v)).toBeCloseTo(1)
  })

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0)
  })

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1)
  })

  it('throws on dimension mismatch', () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow()
  })
})

const PRIVATE_KEY = process.env['ZG_PRIVATE_KEY']
const RUN = !!PRIVATE_KEY

let mem: MnemosyneMemory

describe('MnemosyneMemory', () => {
  beforeAll(async () => {
    if (!RUN) return
    const [compute, storage] = await Promise.all([
      createComputeClient({ privateKey: PRIVATE_KEY! }),
      Promise.resolve(createStorageClient({ privateKey: PRIVATE_KEY! })),
    ])
    mem = new MnemosyneMemory(compute, storage)
  })

  it('store uploads to 0G and returns refs', { skip: !RUN }, async () => {
    const result = await mem.store(
      'The Ethereum merge happened on September 15, 2022.',
      { domain: 'factual', tags: ['ethereum', 'merge'] },
    )
    expect(result.entryId).toBeTruthy()
    expect(result.storageRef).toBeTruthy()
    expect(result.embeddingRef).toBeTruthy()
    console.log('Stored entry:', result)
  })

  it('query returns relevant entries before dissimilar ones', { skip: !RUN }, async () => {
    // sequential — parallel storage uploads cause nonce collisions on testnet
    await mem.store('Ethereum switched to proof-of-stake in September 2022', { domain: 'factual', tags: ['ethereum'] })
    await mem.store('Bitcoin uses proof-of-work consensus', { domain: 'factual', tags: ['bitcoin'] })
    await mem.store('The best recipe for chocolate cake requires cocoa', { domain: 'observation', tags: ['food'] })

    const hits = await mem.query('How does Ethereum reach consensus?', 5)
    console.log('Query hits:', hits.map(h => ({ sim: h.similarity.toFixed(3), content: h.content.slice(0, 50) })))

    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]!.similarity).toBeGreaterThanOrEqual(hits[hits.length - 1]!.similarity)

    // The top hit should be Ethereum-related, not chocolate cake
    const topContent = hits[0]!.content.toLowerCase()
    expect(topContent).toContain('ethereum')
  })

  it('query returns empty array when cache is empty', async () => {
    const empty = new MnemosyneMemory(null as any, null as any)
    const hits = await empty.query('anything')
    expect(hits).toEqual([])
  })

  it('size reflects number of cached entries', { skip: !RUN }, async () => {
    const fresh = new MnemosyneMemory(
      await createComputeClient({ privateKey: PRIVATE_KEY! }),
      createStorageClient({ privateKey: PRIVATE_KEY! }),
    )
    expect(fresh.size).toBe(0)
    await fresh.store('test entry')
    expect(fresh.size).toBe(1)
    fresh.clear()
    expect(fresh.size).toBe(0)
  })
})
