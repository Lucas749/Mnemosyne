import express from 'express'
import cors from 'cors'
import { randomBytes } from 'crypto'
import { generateEmbedding } from '@mnemosyne/compute'
import {
  uploadEntryBlob,
  uploadEmbeddingBlob,
  downloadEntryBlob,
  downloadEmbeddingBlob,
  downloadManifest,
  addEntryToManifest,
  activeEntries,
} from '@mnemosyne/storage'
import { getMemoryIndex, setMemoryIndex } from '@mnemosyne/identity'
import { routeRoyalty } from '@mnemosyne/payments'
import type { EntryBlob, ManifestEntry } from '@mnemosyne/types'
import type { ComputeClient } from '@mnemosyne/compute'
import type { StorageClient } from '@mnemosyne/storage'
import type { StoreRequest, StoreResponse, QueryRequest, QueryResponse } from './types.js'

interface CachedEntry {
  content: string
  vector: number[]
  storageRef: string
  tags: string[]
  domain?: string
  submittedBy?: string
}

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

// TODO: add Authorization: Bearer token middleware once API is publicly hosted
export function createMnemosyneApp(compute: ComputeClient, storage: StorageClient) {
  const app = express()
  app.use(cors())
  app.use(express.json())

  // TODO: replace in-memory cache with SQLite — entries are lost on restart
  const cache = new Map<string, CachedEntry>()

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', entries: cache.size })
  })

  // ─── POST /store ─────────────────────────────────────────────────────────

  app.post('/store', async (req, res) => {
    const body        = req.body as StoreRequest
    const entryId     = '0x' + randomBytes(16).toString('hex')
    const domain      = body.domain ?? 'factual'
    const tags        = body.tags ?? []
    const submittedBy = body.submittedBy ?? 'agent'

    const blob: EntryBlob = {
      id: entryId,
      content: body.content,
      domain,
      tags,
      sources: [],
      submittedBy,
      submittedAt: Math.floor(Date.now() / 1000),
      checksum: '',
    }

    // Sequential to avoid nonce collisions on 0G testnet
    const storageRef   = await uploadEntryBlob(storage, blob)
    const embBlob      = await generateEmbedding(compute, entryId, body.content)
    const embeddingRef = await uploadEmbeddingBlob(storage, embBlob)

    cache.set(entryId, {
      content: body.content,
      vector: embBlob.vector,
      storageRef,
      tags,
      domain,
      submittedBy,
    })

    // TODO: call MnemosyneRegistry.submit() on-chain so entry is staked (requires deployed contract addresses)

    // When submittedBy is an ENS name, update memory.index with a manifest
    // that includes this entry so other agents can discover it via ENS.
    let manifestRef: string | undefined
    const ensKey = process.env.ENS_PRIVATE_KEY as `0x${string}` | undefined
    if (submittedBy.endsWith('.eth') && ensKey) {
      const currentRef = await getMemoryIndex(submittedBy).catch(() => null)
      const entry: ManifestEntry = {
        entryId,
        storageRef,
        embeddingRef,
        domain: domain as any,
        tags,
        status: 'active',
        addedAt: Math.floor(Date.now() / 1000),
      }
      manifestRef = await addEntryToManifest(storage, currentRef, submittedBy, entry)
      await setMemoryIndex(ensKey, submittedBy, manifestRef)
    }

    const out: StoreResponse = { entryId, storageRef, embeddingRef, manifestRef }
    res.json(out)
  })

  // ─── POST /query ─────────────────────────────────────────────────────────

  app.post('/query', async (req, res) => {
    const body   = req.body as QueryRequest
    const topK   = body.topK ?? 5
    const domains = body.domains

    if (cache.size === 0) {
      const out: QueryResponse = { matches: [] }
      res.json(out)
      return
    }

    const queryEmb = await generateEmbedding(compute, '__query__', body.text)

    let entries = Array.from(cache.entries())
    if (domains && domains.length > 0) {
      entries = entries.filter(([, e]) => domains.includes(e.domain as any))
    }

    const matches = entries
      .map(([entryId, e]) => ({
        entryId,
        content: e.content,
        similarity: cosineSimilarity(queryEmb.vector, e.vector),
        storageRef: e.storageRef,
        tags: e.tags,
        domain: e.domain as any,
        submittedBy: e.submittedBy,
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK)

    // Fire-and-forget micro-royalty payments via Uniswap if configured
    const royaltyKey = process.env.ENS_PRIVATE_KEY as `0x${string}` | undefined
    if (royaltyKey) {
      const royaltyWei = BigInt(process.env.ROYALTY_WEI ?? '1000000000000000') // 0.001 ETH default
      for (const match of matches) {
        if (match.submittedBy?.endsWith('.eth')) {
          routeRoyalty(royaltyKey, match.submittedBy, royaltyWei, {
            ensRpcUrl: process.env.SEPOLIA_RPC,
          }).catch(() => {}) // non-blocking; payment failures must not break queries
        }
      }
    }

    const out: QueryResponse = { matches }
    res.json(out)
  })

  // ─── POST /load-manifest ─────────────────────────────────────────────────
  // Seed the in-memory cache from a 0G manifest ref directly.

  app.post('/load-manifest', async (req, res) => {
    const { manifestRef } = req.body as { manifestRef: string }
    const manifest = await downloadManifest(storage, manifestRef)
    const active   = activeEntries(manifest)

    await Promise.all(
      active.map(async (entry) => {
        const [embBlob, entryBlob] = await Promise.all([
          downloadEmbeddingBlob(storage, entry.embeddingRef),
          downloadEntryBlob(storage, entry.storageRef),
        ])
        cache.set(entry.entryId, {
          content: entryBlob.content,
          vector: embBlob.vector,
          storageRef: entry.storageRef,
          tags: entry.tags,
          domain: entry.domain,
        })
      }),
    )

    res.json({ loaded: active.length, total: cache.size })
  })

  // ─── GET /load-from-ens/:ensName ─────────────────────────────────────────
  // Resolve an ENS name → read memory.index → load its manifest into the cache.
  // This is the discovery endpoint: agent B bootstraps its knowledge from agent A
  // simply by calling GET /load-from-ens/agentA.eth

  app.get('/load-from-ens/:ensName', async (req, res) => {
    const ensName    = req.params.ensName
    const manifestRef = await getMemoryIndex(ensName)

    if (!manifestRef) {
      res.status(404).json({ error: `No memory.index found for ${ensName}` })
      return
    }

    const manifest = await downloadManifest(storage, manifestRef)
    const active   = activeEntries(manifest)

    await Promise.all(
      active.map(async (entry) => {
        const [embBlob, entryBlob] = await Promise.all([
          downloadEmbeddingBlob(storage, entry.embeddingRef),
          downloadEntryBlob(storage, entry.storageRef),
        ])
        cache.set(entry.entryId, {
          content: entryBlob.content,
          vector: embBlob.vector,
          storageRef: entry.storageRef,
          tags: entry.tags,
          domain: entry.domain,
          submittedBy: ensName,
        })
  })

  return app
}
