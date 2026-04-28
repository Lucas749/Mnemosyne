import { describe, it, expect, beforeAll } from 'vitest'
import type { ComputeClient } from '../client.js'
import { createComputeClient } from '../client.js'
import { generateEmbedding } from '../embed.js'

const PRIVATE_KEY = process.env['ZG_PRIVATE_KEY']
const RUN = !!PRIVATE_KEY

let client: ComputeClient

describe('embeddings', () => {
  beforeAll(async () => {
    if (!RUN) return
    client = await createComputeClient({ privateKey: PRIVATE_KEY! })
  })

  it('returns a 128-dim vector', { skip: !RUN }, async () => {
    const blob = await generateEmbedding(client, '0xtest-001', 'The Ethereum merge happened on September 15, 2022.')
    expect(blob.vector).toHaveLength(128)
    expect(blob.entryId).toBe('0xtest-001')
    expect(blob.dimensions).toBe(128)
    blob.vector.forEach(v => {
      expect(typeof v).toBe('number')
      expect(isNaN(v)).toBe(false)
    })
  })

  it('similar content produces higher similarity than dissimilar', { skip: !RUN }, async () => {
    const [a, b, c] = await Promise.all([
      generateEmbedding(client, '0x1', 'Ethereum is a blockchain platform'),
      generateEmbedding(client, '0x2', 'Ethereum uses proof of stake consensus'),
      generateEmbedding(client, '0x3', 'The best recipe for chocolate cake'),
    ])
    const simAB = cosineSimilarity(a.vector, b.vector)
    const simAC = cosineSimilarity(a.vector, c.vector)
    console.log(`Ethereum/Ethereum similarity: ${simAB.toFixed(3)}`)
    console.log(`Ethereum/Cake similarity:     ${simAC.toFixed(3)}`)
    expect(simAB).toBeGreaterThan(simAC)
  })

})
