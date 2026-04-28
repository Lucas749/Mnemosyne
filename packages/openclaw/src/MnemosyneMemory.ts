import { randomBytes } from 'crypto'
import type { ComputeClient } from '@mnemosyne/compute'
import { generateEmbedding } from '@mnemosyne/compute'
import type { StorageClient } from '@mnemosyne/storage'
import {
  uploadEntryBlob,
  uploadEmbeddingBlob,
  downloadEntryBlob,
  downloadEmbeddingBlob,
  downloadManifest,
  activeEntries,
} from '@mnemosyne/storage'
import type { EntryDomain, EntryBlob } from '@mnemosyne/types'
import type { MemoryAdapter, StoreOptions, StoreResult, MemoryHit } from './types.js'

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

interface CachedEntry {
  content:    string
  vector:     number[]
  storageRef: string
  tags:       string[]
  domain?:    EntryDomain
}

/**
 * MnemosyneMemory wires 0G Storage (content + embeddings) and 0G Compute
 * (Qwen embeddings via TEE) into a drop-in OpenClaw MemoryAdapter.
 *
 * Usage:
 *   const mem = new MnemosyneMemory(computeClient, storageClient)
 *   await mem.store('The Ethereum merge happened on Sep 15, 2022', { domain: 'factual' })
 *   const hits = await mem.query('when did Ethereum switch to PoS?', 3)
 */
export class MnemosyneMemory implements MemoryAdapter {
  private readonly cache = new Map<string, CachedEntry>()

  constructor(
    private readonly compute: ComputeClient,
    private readonly storage: StorageClient,
  ) {}

  async store(content: string, opts: StoreOptions = {}): Promise<StoreResult> {
    const entryId = opts.entryId ?? '0x' + randomBytes(16).toString('hex')
    const domain  = opts.domain ?? 'factual'
    const tags    = opts.tags ?? []

    const blob: EntryBlob = {
      id:          entryId,
      content,
      domain,
      tags,
      sources:     [],
      submittedBy: 'agent',
      submittedAt: Math.floor(Date.now() / 1000),
      checksum:    '',
    }

    const [storageRef, embBlob] = await Promise.all([
      uploadEntryBlob(this.storage, blob),
      generateEmbedding(this.compute, entryId, content),
    ])

    const embeddingRef = await uploadEmbeddingBlob(this.storage, embBlob)

    this.cache.set(entryId, { content, vector: embBlob.vector, storageRef, tags, domain })

    return { entryId, storageRef, embeddingRef }
  }

  async query(text: string, topK = 5): Promise<MemoryHit[]> {
    if (this.cache.size === 0) return []

    const queryEmb = await generateEmbedding(this.compute, '__query__', text)

    return Array.from(this.cache.entries())
      .map(([entryId, entry]) => ({
        entryId,
        content:    entry.content,
        similarity: cosineSimilarity(queryEmb.vector, entry.vector),
        storageRef: entry.storageRef,
        tags:       entry.tags,
        domain:     entry.domain,
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK)
  }

  async loadFromManifest(manifestRef: string): Promise<void> {
    const manifest = await downloadManifest(this.storage, manifestRef)
    const active   = activeEntries(manifest)

    await Promise.all(
      active.map(async (entry) => {
        const [embBlob, entryBlob] = await Promise.all([
          downloadEmbeddingBlob(this.storage, entry.embeddingRef),
          downloadEntryBlob(this.storage, entry.storageRef),
        ])
        this.cache.set(entry.entryId, {
          content:    entryBlob.content,
          vector:     embBlob.vector,
          storageRef: entry.storageRef,
          tags:       entry.tags,
          domain:     entry.domain,
        })
      }),
    )
  }

  get size(): number { return this.cache.size }

  clear(): void { this.cache.clear() }
}

export function createMnemosyneMemory(
  compute: ComputeClient,
  storage: StorageClient,
): MnemosyneMemory {
  return new MnemosyneMemory(compute, storage)
}
