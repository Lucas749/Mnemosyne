import { describe, it, expect, beforeAll } from 'vitest'
import type { ComputeClient } from '../client.js'
import { createComputeClient } from '../client.js'
import { generateEmbedding } from '../embed.js'

const PRIVATE_KEY = process.env['ZG_PRIVATE_KEY']
const RUN = !!PRIVATE_KEY

let client: ComputeClient

function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length)
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < len; i++) {
    dot   += (a[i] ?? 0) * (b[i] ?? 0)
    normA += (a[i] ?? 0) ** 2
    normB += (b[i] ?? 0) ** 2
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

describe('embeddings', () => {
  beforeAll(async () => {
    if (!RUN) return
    client = await createComputeClient({ privateKey: PRIVATE_KEY! })
  })

  it('returns a valid embedding vector', { skip: !RUN }, async () => {
    const blob = await generateEmbedding(client, '0xtest-001', 'The Ethereum merge happened on September 15, 2022.')
    expect(blob.vector.length).toBeGreaterThan(0)
    expect(blob.entryId).toBe('0xtest-001')
    expect(blob.dimensions).toBe(blob.vector.length)
    blob.vector.forEach(v => {
      expect(typeof v).toBe('number')
      expect(isNaN(v)).toBe(false)
    })
    console.log(`  embedding dimensions: ${blob.dimensions}`)
  })

  it('similar content produces higher similarity than dissimilar', { skip: !RUN }, async () => {
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
    const a = await generateEmbedding(client, '0x1', 'Ethereum is a blockchain platform')
    await sleep(7000)
    const b = await generateEmbedding(client, '0x2', 'Ethereum uses proof of stake consensus')
    await sleep(7000)
    const c = await generateEmbedding(client, '0x3', 'The best recipe for chocolate cake')
    const simAB = cosineSimilarity(a.vector, b.vector)
    const simAC = cosineSimilarity(a.vector, c.vector)
    console.log(`Ethereum/Ethereum similarity: ${simAB.toFixed(3)}`)
    console.log(`Ethereum/Cake similarity:     ${simAC.toFixed(3)}`)
    expect(simAB).toBeGreaterThan(simAC)
  })

})
