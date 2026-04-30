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
import { submitOnChain, depositQueryFeeOnChain, authorizeUsageOnChain, getOperatorAddress, resolveRoyaltyRecipient, activateEntryOnChain, getInftTokenId } from './chain.js'
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
  submitterAddress?: `0x${string}`
  onchainEntryId?: `0x${string}`  // bytes32 from EntrySubmitted event
  challengeWindowEnd?: number      // unix seconds — when activateEntry becomes callable
  inftTokenId?: bigint             // set once activateEntry is called
}

type JobStatus = 'pending' | 'done' | 'error'
interface Job {
  status: JobStatus
  result?: unknown
  error?: string
  createdAt: number
}

function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length)
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < len; i++) {
    dot   += (a[i] ?? 0) * (b[i] ?? 0)
    normA += (a[i] ?? 0) ** 2
    normB += (b[i] ?? 0) ** 2
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
  const jobs  = new Map<string, Job>()

  // Purge jobs older than 10 minutes to avoid unbounded memory growth
  setInterval(() => {
    const cutoff = Date.now() - 10 * 60 * 1000
    for (const [id, job] of jobs) {
      if (job.createdAt < cutoff) jobs.delete(id)
    }
  }, 60_000).unref()

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', entries: cache.size })
  })

  // ─── GET /jobs/:jobId ─────────────────────────────────────────────────────

  app.get('/jobs/:jobId', (req, res) => {
    const job = jobs.get(req.params.jobId)
    if (!job) { res.status(404).json({ error: 'job not found' }); return }
    res.json(job)
  })

  // ─── POST /store ─────────────────────────────────────────────────────────

  app.post('/store', (req, res) => {
    const jobId = '0x' + randomBytes(8).toString('hex')
    jobs.set(jobId, { status: 'pending', createdAt: Date.now() })
    res.status(202).json({ jobId })

    const body        = req.body as StoreRequest
    const entryId     = '0x' + randomBytes(16).toString('hex')
    const domain      = body.domain ?? 'factual'
    const tags        = body.tags ?? []
    const submittedBy = body.submittedBy ?? 'agent'

    const JOB_TIMEOUT_MS = 240_000
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('job timed out after 240s — 0G storage unresponsive')), JOB_TIMEOUT_MS)
    )

    ;(async () => {
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

      const storageRef   = await Promise.race([uploadEntryBlob(storage, blob), timeout])
      const embBlob      = await Promise.race([generateEmbedding(compute, entryId, body.content), timeout])
      const embeddingRef = await Promise.race([uploadEmbeddingBlob(storage, embBlob), timeout])

      const onchainEntryId = await submitOnChain(storageRef, embeddingRef, tags, domain).catch(() => null)
      const CHALLENGE_WINDOW_MS = 5 * 60 * 1000 // matches contract (5 min testnet)
      const challengeWindowEnd = onchainEntryId
        ? Math.floor((Date.now() + CHALLENGE_WINDOW_MS) / 1000)
        : undefined

      cache.set(entryId, {
        content: body.content,
        vector: embBlob.vector,
        storageRef,
        tags,
        domain,
        submittedBy,
        onchainEntryId: onchainEntryId ?? undefined,
        challengeWindowEnd,
      })

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
        setMemoryIndex(ensKey, submittedBy, manifestRef).catch((err) =>
          console.error('[ens] setMemoryIndex failed:', err?.message ?? err)
        )
      }

      const result: StoreResponse = { entryId, storageRef, embeddingRef, manifestRef }
      jobs.set(jobId, { status: 'done', result, createdAt: Date.now() })
    })().catch((err) => {
      console.error('[store] job failed:', err?.message ?? err)
      jobs.set(jobId, { status: 'error', error: err?.message ?? String(err), createdAt: Date.now() })
    })
  })

  // ─── POST /query ─────────────────────────────────────────────────────────

  app.post('/query', (req, res) => {
    const jobId = '0x' + randomBytes(8).toString('hex')
    jobs.set(jobId, { status: 'pending', createdAt: Date.now() })
    res.status(202).json({ jobId })

    const body    = req.body as QueryRequest
    const topK    = body.topK ?? 5
    const domains = body.domains

    if (cache.size === 0) {
      jobs.set(jobId, { status: 'done', result: { matches: [] } as QueryResponse, createdAt: Date.now() })
      return
    }

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('job timed out after 240s — 0G storage unresponsive')), 240_000)
    )

    ;(async () => {
      const queryEmb = await Promise.race([generateEmbedding(compute, '__query__', body.text), timeout])

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
          submitterAddress: e.submitterAddress,
        }))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, topK)

      const royaltyWei = BigInt(process.env.ROYALTY_WEI ?? '1000000000000000')
      // Royalties flow to the current iNFT owner, not necessarily the original submitter.
      // This means buying an iNFT transfers the royalty stream too.
      const contributorPromises = matches.map(async (m) => {
        const cached = cache.get(m.entryId)
        if (cached?.inftTokenId && m.submitterAddress) {
          return resolveRoyaltyRecipient(cached.inftTokenId, m.submitterAddress)
        }
        return m.submitterAddress as `0x${string}` | undefined
      })
      const contributors = (await Promise.all(contributorPromises))
        .filter((a): a is `0x${string}` => !!a)
      depositQueryFeeOnChain(contributors, royaltyWei * BigInt(matches.length)).catch(() => {})

      // Authorize the API wallet as executor for each matched iNFT — ERC-7857 AIaaS pattern.
      // Grants read rights without transferring ownership.
      const operatorAddress = getOperatorAddress()
      if (operatorAddress) {
        const permissions = `0x${Buffer.from(JSON.stringify({ expiresAt: Date.now() + 3600_000, query: body.text })).toString('hex')}` as `0x${string}`
        for (const m of matches) {
          const cached = cache.get(m.entryId)
          if (cached?.inftTokenId) {
            authorizeUsageOnChain(cached.inftTokenId, operatorAddress, permissions).catch(() => {})
          }
        }
      }

      jobs.set(jobId, { status: 'done', result: { matches } as QueryResponse, createdAt: Date.now() })
    })().catch((err) => {
      console.error('[query] job failed:', err?.message ?? err)
      jobs.set(jobId, { status: 'error', error: err?.message ?? String(err), createdAt: Date.now() })
    })
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
          downloadEntryBlob(storage, entry.storageRef, entry.entryId),
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
  // Agent B bootstraps knowledge from agent A by calling GET /load-from-ens/agentA.eth

  app.get('/load-from-ens/:ensName', async (req, res) => {
    const ensName     = req.params.ensName
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
          downloadEntryBlob(storage, entry.storageRef, entry.entryId),
        ])
        cache.set(entry.entryId, {
          content: entryBlob.content,
          vector: embBlob.vector,
          storageRef: entry.storageRef,
          tags: entry.tags,
          domain: entry.domain,
          submittedBy: ensName,
        })
      }),
    )

    res.json({ loaded: active.length, total: cache.size, manifestRef, ensName })
  })

  // ─── iNFT activation keeper ──────────────────────────────────────────────
  // Runs every 2 minutes. For entries past their challenge window that have an
  // onchainEntryId but no inftTokenId, calls activateEntry and caches the tokenId.

  setInterval(async () => {
    const now = Math.floor(Date.now() / 1000)
    for (const [localId, entry] of cache.entries()) {
      if (!entry.onchainEntryId || entry.inftTokenId) continue
      if (entry.challengeWindowEnd && now < entry.challengeWindowEnd) continue

      // Try to activate — may already be activated by a previous attempt
      const tokenId = await activateEntryOnChain(entry.onchainEntryId)
        .catch(() => getInftTokenId(entry.onchainEntryId!).catch(() => null))

      if (tokenId && tokenId > 0n) {
        cache.set(localId, { ...entry, inftTokenId: tokenId })
      }
    }
  }, 2 * 60 * 1000)

  return app
}
