import type { EmbeddingBlob } from '@mnemosyne/types'
import type { ComputeClient } from './client.js'

const EMBEDDING_DIMENSIONS = 128

const SYSTEM_PROMPT = `You are an embedding model. Given any text, return ONLY a JSON array of exactly ${EMBEDDING_DIMENSIONS} floats between -1 and 1 that semantically represent the input. No explanation, no markdown, just the raw JSON array.`

export async function generateEmbedding(
  client: ComputeClient,
  entryId: string,
  content: string,
): Promise<EmbeddingBlob> {
  const headers = await client.broker.inference.getRequestHeaders(
    client.service.providerAddress,
  )

  const res = await fetch(`${client.service.endpoint}/chat/completions`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({
      model:    client.service.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content },
      ],
      temperature: 0,
    }),
  })

  if (!res.ok) {
    throw new Error(`0G Compute embedding failed: ${res.status} ${await res.text()}`)
  }

  const data = await res.json() as { id: string; choices: { message: { content: string } }[] }

  // optionally verify TEE signature
  const zgResKey = res.headers.get('ZG-Res-Key') ?? data.id
  if (zgResKey) {
    await client.broker.inference.processResponse(client.service.providerAddress, zgResKey)
  }

  const raw = data.choices[0]?.message.content ?? '[]'
  let vector: number[]
  try {
    vector = JSON.parse(raw) as number[]
  } catch {
    throw new Error(`0G Compute returned non-JSON embedding: ${raw.slice(0, 100)}`)
  }

  if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Expected ${EMBEDDING_DIMENSIONS}-dim vector, got ${Array.isArray(vector) ? vector.length : typeof vector}`,
    )
  }

  return {
    entryId,
    model:      client.service.model,
    vector,
    dimensions: EMBEDDING_DIMENSIONS,
  }
}

// cosine similarity between two embedding vectors
export function cosineSimilarity(a: number[], b: number[]): number {
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
