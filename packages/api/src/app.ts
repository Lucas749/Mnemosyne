import express from 'express'
import cors from 'cors'
import { randomBytes } from 'crypto'
import { privateKeyToAccount } from 'viem/accounts'
import { generateEmbedding } from '@mnemosyne/compute'
import {
  createStorageClient,
  uploadEntryBlob,
  uploadEmbeddingBlob,
  downloadEntryBlob,
  downloadEmbeddingBlob,
  downloadManifest,
  addEntryToManifest,
  activeEntries,
} from '@mnemosyne/storage'
import { getMemoryIndex, setMemoryIndex } from '@mnemosyne/identity'
import { submitOnChain, depositQueryFeeOnChain, authorizeUsageOnChain, getOperatorAddress, resolveRoyaltyRecipient, activateEntryOnChain, getInftTokenId, getEntryFromChain, distributeViaUniswap, readVaultClaimable, getActiveListings, listOnMarket, buyFromMarket, cancelMarketListing, updateMarketPrice, getEntryIdFromTxHash, REGISTRY_ADDRESS, REGISTRY_SUBMIT_STAKE_WEI } from './chain.js'
import { registerEntryEnsName } from './ens.js'
import {
  upsertEntry, getDbEntry, migrateEntryPrimaryKey, getAllDbEntries, deleteEntry,
  addDiscussion, getDiscussions, getEntryIdsByAttributionWallet,
} from './db.js'
import type { DistributeEntry } from './chain.js'
import type { EntryBlob, ManifestEntry } from '@mnemosyne/types'
import type { ComputeClient } from '@mnemosyne/compute'
import type { StorageClient } from '@mnemosyne/storage'
import type { StoreRequest, StoreResponse, QueryRequest, QueryResponse } from './types.js'
import { withRetry, withRetryBroad } from './retry.js'

interface CachedEntry {
  content: string
  vector: number[]
  storageRef: string
  tags: string[]
  domain?: string
  submittedBy?: string
  submitterAddress?: `0x${string}`
  onchainEntryId?: `0x${string}`
  /** EntryBlob.id for AES decryption (may differ from on-chain bytes32 cache key). */
  encryptionEntryId?: string
  submitTxHash?: `0x${string}`
  challengeWindowEnd?: number
  inftTokenId?: bigint
  edges?: Record<string, number>
  queriedByAgents?: string[]
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

// Try both 0G indexers — turbo first (standard often returns 503)
const INDEXER_URLS = [
  'https://indexer-storage-testnet-turbo.0g.ai',
  'https://indexer-storage-testnet-standard.0g.ai',
]

async function downloadWithFallback(_primaryStorage: StorageClient, storageRef: string, entryId: string): Promise<EntryBlob> {
  const errors: string[] = []
  const rpcUrl = process.env.ZG_RPC_URL
  for (const indexerRpc of INDEXER_URLS) {
    try {
      return await withRetry(
        async () => {
          const client = createStorageClient({
            privateKey: process.env.ZG_PRIVATE_KEY ?? '',
            ...(rpcUrl ? { rpcUrl } : {}),
            indexerRpc,
          })
          return downloadEntryBlob(client, storageRef, entryId)
        },
        { maxAttempts: 4, baseDelayMs: 350, label: `[download] ${indexerRpc.replace('https://', '')}` },
      )
    } catch (err) {
      errors.push(`${indexerRpc.replace('https://', '')}: ${(err as Error).message?.slice(0, 80)}`)
    }
  }
  throw new Error(`file not found on any 0G indexer. Errors: ${errors.join(' | ')}`)
}

function manifestDecryptId(e: ManifestEntry): string {
  return e.storageDecryptId ?? e.entryId
}

// TODO: add Authorization: Bearer token middleware once API is publicly hosted
export function createMnemosyneApp(compute: ComputeClient, storage: StorageClient) {
  const app = express()
  app.use(cors())
  app.use(express.json())

  // TODO: replace in-memory cache with SQLite — entries are lost on restart
  const cache = new Map<string, CachedEntry>()
  const jobs  = new Map<string, Job>()

  // Hydrate in-memory cache from DB on startup so similarity search works after restart
  ;(async () => {
    const rows = getAllDbEntries()
    let hydrated = 0
    for (const row of rows) {
      if (!row.content) continue
      const vector = row.embeddingVector ?? []
      cache.set(row.entryId, {
        content: row.content,
        vector,
        storageRef: row.storageRef ?? '',
        tags: row.tags,
        domain: row.domain ?? undefined,
        submittedBy: row.submitter ?? undefined,
        encryptionEntryId: row.encryptionEntryId,
        onchainEntryId: row.entryId as `0x${string}`,
        submitTxHash: row.submitTxHash as `0x${string}` | undefined ?? undefined,
        inftTokenId: row.inftTokenId && row.inftTokenId !== '0' ? BigInt(row.inftTokenId) : undefined,
        edges: {}, queriedByAgents: [],
      })
      hydrated++
    }
    if (hydrated > 0) console.log(`[startup] cache hydrated from DB: ${hydrated} entries`)
  })().catch(err => console.warn('[startup] cache hydration error:', err))

  // Purge jobs older than 10 minutes to avoid unbounded memory growth
  setInterval(() => {
    const cutoff = Date.now() - 10 * 60 * 1000
    for (const [id, job] of jobs) {
      if (job.createdAt < cutoff) jobs.delete(id)
    }
  }, 60_000).unref()

  const CHALLENGE_WINDOW_MS = 5 * 60 * 1000 // 5 min testnet challenge window
  const ACTIVATE_BUFFER_MS  = 30_000         // 30s buffer after window closes

  // Fire-and-forget: mint the iNFT automatically after challenge window elapses.
  function scheduleActivation(onchainEntryId: `0x${string}`, localCacheKey: string) {
    const delay = CHALLENGE_WINDOW_MS + ACTIVATE_BUFFER_MS
    setTimeout(async () => {
      console.log(`[autoActivate] challenge window elapsed, activating entryId=${onchainEntryId}`)
      try {
        const tokenId = await activateEntryOnChain(onchainEntryId)
        if (tokenId && tokenId > 0n) {
          upsertEntry(onchainEntryId, { status: 1, inftTokenId: tokenId.toString() })
          const cached = cache.get(localCacheKey) ?? cache.get(onchainEntryId)
          if (cached) {
            cache.set(onchainEntryId, { ...cached, inftTokenId: tokenId })
            if (localCacheKey !== onchainEntryId) cache.set(localCacheKey, { ...cached, inftTokenId: tokenId })
          }
          console.log(`[autoActivate] iNFT minted tokenId=${tokenId} for entryId=${onchainEntryId}`)
        } else {
          console.warn(`[autoActivate] activateEntryOnChain returned null/0 for entryId=${onchainEntryId}`)
        }
      } catch (err) {
        console.error(`[autoActivate] failed for entryId=${onchainEntryId}:`, (err as Error)?.message ?? err)
      }
    }, delay).unref()
  }

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', entries: cache.size })
  })

  app.get('/entries/attributed/:wallet', (req, res) => {
    res.json({ entryIds: getEntryIdsByAttributionWallet(req.params.wallet) })
  })

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

    const body           = req.body as StoreRequest
    const encryptionKeyId = '0x' + randomBytes(16).toString('hex')
    const domain         = body.domain ?? 'factual'
    const tags           = body.tags ?? []
    const submittedBy    = body.submittedBy ?? 'agent'
    const attributionRaw = (body.attributionWallet ?? '').trim()
    const attributionWallet = /^0x[a-f0-9]{40}$/i.test(attributionRaw)
      ? attributionRaw.toLowerCase()
      : /^0x[a-f0-9]{40}$/i.test(String(submittedBy).trim())
        ? String(submittedBy).trim().toLowerCase()
        : undefined

    const STORE_JOB_RAW = Number(process.env.STORE_JOB_TIMEOUT_MS ?? 1_800_000)
    const STORE_JOB_MS = Number.isFinite(STORE_JOB_RAW) && STORE_JOB_RAW >= 120_000 ? STORE_JOB_RAW : 1_800_000
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`job timed out after ${STORE_JOB_MS}ms — 0G storage / Galileo receipts / ENS`)),
        STORE_JOB_MS,
      )
    )

    ;(async () => {
      const tJob = Date.now()
      const slog = (...parts: unknown[]) => console.log(`[store:${jobId} +${Date.now() - tJob}ms]`, ...parts)
      const submitterSnip =
        typeof submittedBy === 'string' && submittedBy.length > 24
          ? `${submittedBy.slice(0, 10)}…${submittedBy.slice(-6)}`
          : String(submittedBy)

      slog(
        `START submitter=${submitterSnip} domain="${domain}" tags=${tags.length} contentChars=${body.content?.length ?? 0} operatorSet=${!!process.env.ZG_PRIVATE_KEY} ensSignerSet=${!!process.env.ENS_PRIVATE_KEY} jobTimeoutMs=${STORE_JOB_MS}`,
      )

      slog(`STEP 0 encryptionKeyId(upload)=${encryptionKeyId}`)
      const blob: EntryBlob = {
        id: encryptionKeyId,
        content: body.content,
        domain,
        tags,
        sources: [],
        submittedBy,
        submittedAt: Math.floor(Date.now() / 1000),
        checksum: '',
      }

      const storageRef = await Promise.race([
        withRetryBroad(() => uploadEntryBlob(storage, blob), {
          maxAttempts: 6,
          baseDelayMs: 400,
          label: `[store] job=${jobId} upload blob`,
        }),
        timeout,
      ])
      slog(`STEP 1 0G blob uploaded storageRef=${storageRef}`)

      let embeddingRef = ''
      let embVector: number[] = []
      try {
        // generateEmbedding runs locally via HuggingFace transformers — no compute client needed
        const embBlob = await Promise.race([
          generateEmbedding(null as any, encryptionKeyId, body.content),
          timeout,
        ])
        embVector = embBlob.vector
        embeddingRef = await Promise.race([
          withRetryBroad(() => uploadEmbeddingBlob(storage, embBlob), {
            maxAttempts: 5,
            baseDelayMs: 400,
            label: `[store] job=${jobId} upload embedding`,
          }),
          timeout,
        ])
        slog(`STEP 2 embedding uploaded ref=${embeddingRef} vectorDims=${embVector.length}`)
      } catch (embErr) {
        slog(`STEP 2 embedding SKIPPED ${(embErr as Error).message?.slice?.(0, 120)}`)
      }

      // ── STEP 3: cache + DB — entry is now searchable ─────────────────────
      // Build edges against existing vectors before inserting into cache.
      const EDGE_THRESHOLD = 0.6
      const edges: Record<string, number> = {}
      if (embVector.length > 0) {
        for (const [existingId, existing] of cache.entries()) {
          if (!existing.vector?.length) continue
          const sim = cosineSimilarity(embVector, existing.vector)
          if (sim >= EDGE_THRESHOLD) {
            edges[existingId] = Math.round(sim * 1000) / 1000
            const ex = cache.get(existingId)!
            cache.set(existingId, { ...ex, edges: { ...ex.edges, [encryptionKeyId]: edges[existingId] } })
          }
        }
      }

      cache.set(encryptionKeyId, {
        content: body.content,
        vector: embVector,
        storageRef,
        tags,
        domain,
        submittedBy,
        encryptionEntryId: encryptionKeyId,
        edges,
        queriedByAgents: [],
      })

      upsertEntry(encryptionKeyId, {
        storageRef, tags, domain, submitter: submittedBy, submitterWallet: attributionWallet ?? null,
        content: body.content, submittedAt: Math.floor(Date.now() / 1000),
        encryptionEntryId: encryptionKeyId,
        embeddingRef: embeddingRef || null,
        embeddingVector: embVector.length > 0 ? embVector : null,
      })
      slog(`STEP 3 cache+sqlite ready entryId(temp)=${encryptionKeyId}`)

      // ── Mark job done — content is uploaded and searchable ────────────────
      // Chain submit + ENS continue in the background; they will migrate the
      // entryId from encryptionKeyId to the on-chain bytes32 when confirmed.
      const result: StoreResponse = {
        entryId: encryptionKeyId,
        storageRef,
        embeddingRef,
      }
      jobs.set(jobId, { status: 'done', result, createdAt: Date.now() })
      slog(`DONE (storage+search ready) — chain submit continuing in background`)

      // ── STEP 4: chain submit (background, fire-and-forget from job POV) ───
      slog('BG STEP 4 Galileo MnemosyneRegistry.submit starting…')
      const zgConfigured = !!(process.env.ZG_PRIVATE_KEY && String(process.env.ZG_PRIVATE_KEY).trim())
      let onchainSubmission: Awaited<ReturnType<typeof submitOnChain>> = { entryId: null, txHash: null }

      if (zgConfigured) {
        const submitAttempts = 5
        for (let a = 1; a <= submitAttempts; a++) {
          try {
            onchainSubmission = await submitOnChain(storageRef, embeddingRef, tags, domain)
          } catch (err) {
            slog(`BG submit attempt ${a}/${submitAttempts} THREW`, (err as Error)?.message ?? err)
            if (a === submitAttempts) break
            await new Promise(r => setTimeout(r, 700 * 2 ** (a - 1)))
            continue
          }
          if (onchainSubmission.txHash ?? onchainSubmission.entryId) break
          await new Promise(r => setTimeout(r, 700 * 2 ** (a - 1)))
        }
      }

      const onchainEntryId = onchainSubmission.entryId
      const trackedTxHash  = onchainSubmission.txHash

      if (onchainEntryId && encryptionKeyId !== onchainEntryId && trackedTxHash) {
        const mv = migrateEntryPrimaryKey(encryptionKeyId, onchainEntryId, trackedTxHash)
        if (!mv.ok) {
          slog(`BG SQLite migrate FAILED ${encryptionKeyId}→${onchainEntryId}: ${mv.reason}`)
        } else {
          // Update cache key to canonical on-chain bytes32
          const existing = cache.get(encryptionKeyId)
          if (existing) {
            cache.set(onchainEntryId, {
              ...existing,
              onchainEntryId,
              submitTxHash: trackedTxHash,
              challengeWindowEnd: Math.floor((Date.now() + CHALLENGE_WINDOW_MS) / 1000),
            })
            cache.delete(encryptionKeyId)
          }
          slog(`BG SQLite+cache migrated uploadKey→${onchainEntryId}`)
        }
        scheduleActivation(onchainEntryId, encryptionKeyId)
        slog(`BG autoActivate scheduled in ${(CHALLENGE_WINDOW_MS + ACTIVATE_BUFFER_MS) / 1000}s`)
      } else if (!onchainEntryId) {
        slog('BG WARN no Galileo submit — entry lives as upload-key only; check ZG_PRIVATE_KEY / operator balance')
      }

      // ── STEP 5: ENS manifest + subdomain (background) ─────────────────────
      const dbPublicId = onchainEntryId ?? encryptionKeyId
      let manifestRef: string | undefined
      let entryEnsName: string | undefined
      const ensKey = process.env.ENS_PRIVATE_KEY as `0x${string}` | undefined
      const collectiveManifest = process.env.ENS_MEMORY_INDEX_DOMAIN?.trim() || 'mnemosyne.eth'

      const manifestOwners: string[] = []
      if (submittedBy.endsWith('.eth')) manifestOwners.push(submittedBy)
      if (ensKey && !manifestOwners.some(o => o.toLowerCase() === collectiveManifest.toLowerCase())) {
        manifestOwners.push(collectiveManifest)
      }

      if (manifestOwners.length > 0 && ensKey) {
        slog(`BG STEP 5 ENS manifest owners=[${manifestOwners.join(',')}]`)
        const manifestEntryPayload: ManifestEntry = {
          entryId: dbPublicId,
          ...(encryptionKeyId !== dbPublicId ? { storageDecryptId: encryptionKeyId } : {}),
          storageRef,
          embeddingRef,
          domain: domain as ManifestEntry['domain'],
          tags,
          status: 'active',
          submittedAt: Math.floor(Date.now() / 1000),
        }

        for (const ownerEns of manifestOwners) {
          try {
            const currentRef = await withRetryBroad(() => getMemoryIndex(ownerEns), {
              maxAttempts: 4, baseDelayMs: 400, label: `[store] getMemoryIndex(${ownerEns})`,
            }).catch(() => null)
            const nextManifestRef = await withRetryBroad(
              () => addEntryToManifest(storage, currentRef, ownerEns, manifestEntryPayload),
              { maxAttempts: 5, baseDelayMs: 500, label: `[store] addEntryToManifest(${ownerEns})` },
            )
            await withRetryBroad(
              () => setMemoryIndex(ensKey, ownerEns, nextManifestRef),
              { maxAttempts: 6, baseDelayMs: 600, label: `[store] setMemoryIndex(${ownerEns})` },
            )
            manifestRef = nextManifestRef
            slog(`BG STEP 5 ENS manifest ok owner=${ownerEns}`)
          } catch (err) {
            slog(`BG STEP 5 ENS manifest FAILED owner=${ownerEns}`, (err as Error)?.message ?? err)
          }
        }
      }

      if (ensKey) {
        const targetAddress = privateKeyToAccount(ensKey).address
        if (targetAddress) {
          try {
            const ensResult = await withRetryBroad(
              () => registerEntryEnsName({
                privateKey: ensKey, entryId: dbPublicId, targetAddress,
                parentName: 'mnemosyne.eth', trace: `[store:${jobId}]`,
              }),
              { maxAttempts: 4, baseDelayMs: 1_400, label: `[store] registerEntryEnsName` },
            )
            entryEnsName = ensResult.fullName
            slog(`BG STEP 5 ENS subdomain ok entryEnsName=${entryEnsName}`)
          } catch (ensErr) {
            slog(`BG STEP 5 ENS subdomain FAILED`, (ensErr as Error)?.message ?? ensErr)
          }
        }
      }
      slog(`BG ALL DONE dbPublicId=${dbPublicId} manifestRef=${manifestRef ?? 'none'} ensName=${entryEnsName ?? 'none'}`)
    })().catch((err) => {
      const msg =
        (err as { shortMessage?: string })?.shortMessage
        ?? (err as { details?: string })?.details
        ?? (err as { message?: string })?.message
        ?? String(err)
      console.error(`[store:${jobId}] FAILED:`, msg, err)
      jobs.set(jobId, { status: 'error', error: msg, createdAt: Date.now() })
    })
  })

  // ─── POST /store/prepare ─────────────────────────────────────────────────
  // Phase-1 of user-signed submit: upload content to 0G, return refs + stake params.
  // The frontend then calls MnemosyneRegistry.submit from the user's wallet (wagmi).

  app.post('/store/prepare', (req, res) => {
    const jobId = '0x' + randomBytes(8).toString('hex')
    jobs.set(jobId, { status: 'pending', createdAt: Date.now() })
    res.status(202).json({ jobId })

    const body = req.body as StoreRequest
    const encryptionKeyId = '0x' + randomBytes(16).toString('hex')
    const domain = body.domain ?? 'factual'
    const tags = body.tags ?? []
    const submittedBy = body.submittedBy ?? 'agent'
    const DOMAIN_INDEX_MAP: Record<string, number> = {
      factual: 0, labeled_example: 1, structured_data: 2, observation: 3, correction: 4,
    }

    const PREPARE_TIMEOUT_MS = 900_000
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`prepare timed out after ${PREPARE_TIMEOUT_MS}ms`)), PREPARE_TIMEOUT_MS)
    )

    ;(async () => {
      const blob: EntryBlob = {
        id: encryptionKeyId,
        content: body.content,
        domain,
        tags,
        sources: [],
        submittedBy,
        submittedAt: Math.floor(Date.now() / 1000),
        checksum: '',
      }

      const storageRef = await Promise.race([
        withRetryBroad(() => uploadEntryBlob(storage, blob), { maxAttempts: 6, baseDelayMs: 400, label: '[prepare] upload' }),
        timeout,
      ])

      let embeddingRef = ''
      try {
        const embBlob = await Promise.race([generateEmbedding(null as any, encryptionKeyId, body.content), timeout])
        embeddingRef = await Promise.race([uploadEmbeddingBlob(storage, embBlob), timeout])
      } catch {
        // embedding optional — search degrades gracefully
      }

      jobs.set(jobId, {
        status: 'done',
        result: {
          storageRef,
          embeddingRef,
          encryptionKeyId,
          registryAddress: REGISTRY_ADDRESS,
          domainIndex: DOMAIN_INDEX_MAP[domain] ?? 0,
          stakeWei: REGISTRY_SUBMIT_STAKE_WEI.toString(),
        },
        createdAt: Date.now(),
      })
    })().catch((err) => {
      const msg = (err as Error)?.message ?? String(err)
      jobs.set(jobId, { status: 'error', error: msg, createdAt: Date.now() })
    })
  })

  // ─── POST /store/confirm ──────────────────────────────────────────────────
  // Phase-2: frontend sends the user's txHash + refs; we read the entryId from
  // the EntrySubmitted event and index the entry in DB + ENS manifest.

  app.post('/store/confirm', async (req, res) => {
    const {
      txHash,
      storageRef,
      embeddingRef = '',
      encryptionKeyId,
      content,
      domain = 'factual',
      tags = [],
      submittedBy = 'agent',
      attributionWallet,
    } = req.body as {
      txHash: `0x${string}`
      storageRef: string
      embeddingRef?: string
      encryptionKeyId: string
      content: string
      domain: string
      tags: string[]
      submittedBy: string
      attributionWallet?: string
    }

    if (!txHash || !storageRef || !content) {
      res.status(400).json({ error: 'txHash, storageRef, and content are required' })
      return
    }

    // Check receipt first so we can give a clear error if tx failed
    const { entryId, txStatus } = await (async () => {
      try {
        const c = (await import('./chain.js')).clients ? null : null // ensure module loaded
        // Re-use getEntryIdFromTxHash but also expose receipt status
        const id = await getEntryIdFromTxHash(txHash)
        return { entryId: id, txStatus: id ? 'success' : 'no-event' }
      } catch {
        return { entryId: null, txStatus: 'error' }
      }
    })()

    if (!entryId) {
      const hint = txStatus === 'no-event'
        ? 'Tx may have reverted (out of gas or InsufficientStake). Check the tx on https://chainscan-galileo.0g.ai'
        : 'Could not read tx receipt from 0G chain.'
      res.status(422).json({ error: `EntrySubmitted event not found — ${hint}`, txHash })
      return
    }

    const dbPublicId = entryId

    upsertEntry(dbPublicId, {
      storageRef, tags, domain, submitter: submittedBy,
      submitterWallet: attributionWallet ?? null,
      content, submittedAt: Math.floor(Date.now() / 1000),
      submitTxHash: txHash,
      encryptionEntryId: encryptionKeyId ?? dbPublicId,
      embeddingRef: embeddingRef || null,
    })

    cache.set(dbPublicId, {
      content, vector: [], storageRef, tags, domain, submittedBy,
      onchainEntryId: dbPublicId, submitTxHash: txHash,
      encryptionEntryId: encryptionKeyId ?? dbPublicId,
      challengeWindowEnd: Math.floor((Date.now() + CHALLENGE_WINDOW_MS) / 1000),
      edges: {}, queriedByAgents: [],
    })

    // Auto-mint iNFT after challenge window
    scheduleActivation(dbPublicId, dbPublicId)

    // Update ENS manifest async (non-blocking for response)
    const ensKey = process.env.ENS_PRIVATE_KEY as `0x${string}` | undefined
    const collectiveManifest = process.env.ENS_MEMORY_INDEX_DOMAIN?.trim() || 'mnemosyne.eth'
    if (ensKey) {
      const manifestOwners: string[] = []
      if (submittedBy.endsWith('.eth')) manifestOwners.push(submittedBy)
      if (!manifestOwners.some(o => o.toLowerCase() === collectiveManifest.toLowerCase())) {
        manifestOwners.push(collectiveManifest)
      }
      const manifestEntryPayload: ManifestEntry = {
        entryId: dbPublicId,
        ...(encryptionKeyId && encryptionKeyId !== dbPublicId ? { storageDecryptId: encryptionKeyId } : {}),
        storageRef, embeddingRef,
        domain: domain as ManifestEntry['domain'],
        tags, status: 'active',
        submittedAt: Math.floor(Date.now() / 1000),
      }
      ;(async () => {
        for (const ownerEns of manifestOwners) {
          const currentRef = await withRetryBroad(() => getMemoryIndex(ownerEns), {
            maxAttempts: 4, baseDelayMs: 400, label: `[confirm] getMemoryIndex(${ownerEns})`,
          }).catch(() => null)
          const nextRef = await withRetryBroad(
            () => addEntryToManifest(storage, currentRef, ownerEns, manifestEntryPayload),
            { maxAttempts: 5, baseDelayMs: 500, label: `[confirm] addEntryToManifest(${ownerEns})` },
          )
          await withRetryBroad(() => setMemoryIndex(ensKey, ownerEns, nextRef), {
            maxAttempts: 6, baseDelayMs: 600, label: `[confirm] setMemoryIndex(${ownerEns})`,
          }).catch(err => console.warn('[confirm] setMemoryIndex failed:', (err as Error)?.message))
        }
      })().catch(err => console.warn('[confirm] ENS manifest error:', (err as Error)?.message))
    }

    res.json({ entryId: dbPublicId, txHash })
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
      const queryEmb = await Promise.race([generateEmbedding(null as any, '__query__', body.text), timeout])

      let entries = Array.from(cache.entries())
      if (domains && domains.length > 0) {
        entries = entries.filter(([, e]) => domains.includes(e.domain as any))
      }

      // Return metadata + similarity only — content is gated behind POST /unlock.
      // The agent decides which entries to pay for based on the scores returned here.
      const matches = entries
        .map(([entryId, e]) => ({
          entryId,
          similarity: cosineSimilarity(queryEmb.vector, e.vector),
          storageRef: e.storageRef,
          tags: e.tags,
          domain: e.domain as any,
          submittedBy: e.submittedBy,
          submitterAddress: e.submitterAddress,
          hasContent: true, // indicates content is available via POST /unlock
        }))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, topK)

      // Track querying agent in cache for the graph (no payment needed for discovery)
      const queriedBy = body.queriedBy
      if (queriedBy) {
        for (const m of matches) {
          const cached = cache.get(m.entryId)
          if (cached) {
            const agents = cached.queriedByAgents ?? []
            if (!agents.includes(queriedBy)) {
              cache.set(m.entryId, { ...cached, queriedByAgents: [...agents, queriedBy] })
            }
          }
        }
      }

      jobs.set(jobId, { status: 'done', result: { matches } as QueryResponse, createdAt: Date.now() })
    })().catch((err) => {
      console.error('[query] job failed:', err?.message ?? err)
      jobs.set(jobId, { status: 'error', error: err?.message ?? String(err), createdAt: Date.now() })
    })
  })

  // ─── POST /unlock ─────────────────────────────────────────────────────────
  // Decrypted content gated behind payment. Implements the x402 payment protocol
  // so agents (via KeeperHub or any x402-aware client) can pay autonomously.
  //
  // x402 flow (when ENFORCE_PAYMENT=true):
  //   1. Client POSTs without X-Payment header
  //      → 402 response with payment details (amount, recipient, network)
  //   2. Agent pays on-chain (KeeperHub executes the tx)
  //   3. Client retries with X-Payment: <txHash>
  //      → 200 with decrypted Markdown content
  //
  // When ENFORCE_PAYMENT=false (testnet default): skips payment gate entirely.

  app.post('/unlock', async (req, res) => {
    const { entryId, queriedBy } = req.body as { entryId: string; queriedBy?: string }
    if (!entryId) { res.status(400).json({ error: 'entryId required' }); return }

    const dbPeek = getDbEntry(entryId)
    let cached = cache.get(entryId)

    if (!cached && dbPeek?.content) {
      cached = {
        content: dbPeek.content, vector: [], storageRef: dbPeek.storageRef ?? '',
        tags: dbPeek.tags, domain: dbPeek.domain ?? undefined,
        submittedBy: dbPeek.submitter ?? undefined,
        onchainEntryId: entryId as `0x${string}`,
        encryptionEntryId: dbPeek.encryptionEntryId,
      }
      cache.set(entryId, cached)
    }

    if (!cached) {
      const onChainEntry = await getEntryFromChain(entryId as `0x${string}`)
      if (!onChainEntry) {
        res.status(404).json({ error: 'entry not found on chain' }); return
      }
      try {
        const decryptKey =
          dbPeek?.encryptionEntryId ?? getDbEntry(entryId)?.encryptionEntryId ?? entryId
        const blob = await downloadWithFallback(storage, onChainEntry.storageRef, decryptKey)
        cached = {
          content: blob.content, vector: [], storageRef: onChainEntry.storageRef,
          tags: onChainEntry.tags, domain: blob.domain, submittedBy: blob.submittedBy,
          submitterAddress: onChainEntry.submitter, onchainEntryId: entryId as `0x${string}`,
          encryptionEntryId: blob.id,
          inftTokenId: onChainEntry.inftTokenId > 0n ? onChainEntry.inftTokenId : undefined,
        }
        cache.set(entryId, cached)
        upsertEntry(entryId, {
          storageRef: onChainEntry.storageRef, tags: onChainEntry.tags, domain: blob.domain,
          submitter: blob.submittedBy ?? onChainEntry.submitter, content: blob.content, status: onChainEntry.status,
          encryptionEntryId: blob.id,
        })
      } catch (err) {
        res.status(502).json({ error: '0G Storage unavailable', detail: (err as Error).message }); return
      }
    }

    const enforcePayment = process.env.ENFORCE_PAYMENT === 'true'
    const royaltyWei     = BigInt(process.env.ROYALTY_WEI ?? '1000000000000000')

    const recipient = cached.inftTokenId && cached.submitterAddress
      ? await resolveRoyaltyRecipient(cached.inftTokenId, cached.submitterAddress).catch(() => cached.submitterAddress as `0x${string}`)
      : cached.submitterAddress as `0x${string}` | undefined

    // ── x402: if ENFORCE_PAYMENT and no payment proof supplied, return 402 ──
    const paymentTx = req.headers['x-payment'] as string | undefined
    if (enforcePayment && !paymentTx) {
      res.status(402).json({
        error: 'Payment required',
        x402: {
          version: '1',
          scheme: 'exact',
          network: 'sepolia',
          maxAmountRequired: royaltyWei.toString(),
          resource: `${process.env.MNEMOSYNE_API_URL ?? ''}/unlock`,
          description: `Unlock knowledge entry ${entryId}`,
          mimeType: 'application/json',
          payTo: recipient ?? getOperatorAddress(),
          maxTimeoutSeconds: 300,
          asset: '0x0000000000000000000000000000000000000000', // native ETH
          extra: { entryId, submittedBy: cached.submittedBy },
        },
      })
      return
    }

    // ── Payment settlement ───────────────────────────────────────────────────
    // If a tx hash is provided (x402 retry), verify it exists on-chain (basic check).
    // Then deposit the royalty accounting entry on 0G regardless.
    let paymentOk = !enforcePayment
    if (recipient) {
      try {
        await depositQueryFeeOnChain([recipient], royaltyWei)
        paymentOk = true
      } catch (err) {
        if (enforcePayment) {
          res.status(402).json({ error: 'payment settlement failed', detail: (err as Error).message })
          return
        }
        console.error('[unlock] royalty deposit failed (ENFORCE_PAYMENT=false):', (err as Error).message)
      }
    }

    const executorAddress = (queriedBy?.startsWith('0x') ? queriedBy as `0x${string}` : null) ?? getOperatorAddress()
    if (executorAddress && cached.inftTokenId) {
      const permissions = `0x${Buffer.from(JSON.stringify({
        expiresAt: Date.now() + 3600_000,
        agent: queriedBy ?? 'api-wallet',
        paid: paymentOk,
        paymentTx: paymentTx ?? null,
      })).toString('hex')}` as `0x${string}`
      authorizeUsageOnChain(cached.inftTokenId, executorAddress, permissions).catch(() => {})
    }

    res.json({
      entryId,
      content: cached.content,
      submittedBy: cached.submittedBy,
      domain: cached.domain,
      tags: cached.tags,
      paymentConfirmed: paymentOk,
      paymentTx: paymentTx ?? null,
    })
  })

  // ─── GET /content/:entryId ───────────────────────────────────────────────
  // Fetch entry content from 0G Storage using the storageRef from chain.
  // Works even after a server restart — reads storageRef from the blockchain,
  // then downloads content from 0G and caches it for future requests.

  app.get('/content/:entryId', async (req, res) => {
    const entryId = req.params.entryId as `0x${string}`

    const cached = cache.get(entryId)
    if (cached) {
      res.json({
        entryId,
        content: cached.content,
        tags: cached.tags,
        domain: cached.domain,
        submittedBy: cached.submittedBy,
        submitTxHash: cached.submitTxHash,
      })
      return
    }

    const dbEntry = getDbEntry(entryId)
    if (dbEntry?.content) {
      res.json({
        entryId,
        content: dbEntry.content,
        tags: dbEntry.tags,
        domain: dbEntry.domain,
        submittedBy: dbEntry.submitter,
        submitTxHash: dbEntry.submitTxHash,
      })
      return
    }

    const onChainEntry = await getEntryFromChain(entryId)
    if (!onChainEntry) {
      res.status(404).json({ error: 'Entry not found on chain' })
      return
    }

    try {
      const decryptKey = dbEntry?.encryptionEntryId ?? entryId
      const blob = await downloadWithFallback(storage, onChainEntry.storageRef, decryptKey)
      const entry: CachedEntry = {
        content: blob.content,
        vector: [],
        storageRef: onChainEntry.storageRef,
        tags: onChainEntry.tags,
        domain: blob.domain,
        submittedBy: blob.submittedBy,
        submitterAddress: onChainEntry.submitter,
        onchainEntryId: entryId,
        encryptionEntryId: blob.id,
        submitTxHash: (dbEntry?.submitTxHash as `0x${string}` | undefined) ?? undefined,
        inftTokenId: onChainEntry.inftTokenId > 0n ? onChainEntry.inftTokenId : undefined,
      }
      cache.set(entryId, entry)
      upsertEntry(entryId, {
        storageRef: onChainEntry.storageRef,
        tags: onChainEntry.tags,
        domain: blob.domain,
        submitter: blob.submittedBy ?? onChainEntry.submitter,
        content: blob.content,
        status: onChainEntry.status,
        inftTokenId: onChainEntry.inftTokenId > 0n ? onChainEntry.inftTokenId.toString() : '0',
        submitTxHash: dbEntry?.submitTxHash ?? undefined,
        encryptionEntryId: blob.id,
      })
      res.json({
        entryId,
        content: blob.content,
        tags: blob.tags,
        domain: blob.domain,
        submittedBy: blob.submittedBy,
        submitTxHash: dbEntry?.submitTxHash ?? null,
      })
    } catch (err) {
      res.status(502).json({ error: '0G Storage fetch failed', detail: (err as Error).message })
    }
  })

  // ─── GET /entries ─────────────────────────────────────────────────────────
  app.get('/entries', (_req, res) => {
    res.json(getAllDbEntries())
  })

  // ─── DELETE /entries/:entryId ─────────────────────────────────────────────
  app.delete('/entries/:entryId', (req, res) => {
    if (req.headers['x-admin-token'] !== (process.env.ADMIN_TOKEN ?? 'mnemosyne-admin')) {
      res.status(403).json({ error: 'forbidden' }); return
    }
    const info = deleteEntry(req.params.entryId)
    cache.delete(req.params.entryId)
    res.json({ deleted: info.changes > 0, entryId: req.params.entryId })
  })

  // ─── POST /admin/reset ────────────────────────────────────────────────────
  app.post('/admin/reset', (req, res) => {
    if (req.headers['x-admin-token'] !== (process.env.ADMIN_TOKEN ?? 'mnemosyne-admin')) {
      res.status(403).json({ error: 'forbidden' }); return
    }
    const all = getAllDbEntries()
    for (const e of all) { deleteEntry(e.entryId); cache.delete(e.entryId) }
    res.json({ cleared: all.length })
  })

  // ─── GET /discussions/:entryId ────────────────────────────────────────────
  app.get('/discussions/:entryId', (req, res) => {
    res.json(getDiscussions(req.params.entryId))
  })

  // ─── POST /discussions/:entryId ───────────────────────────────────────────
  // Body: { author: string (ENS or address), content: string }
  app.post('/discussions/:entryId', (req, res) => {
    const { author, content } = req.body as { author?: string; content?: string }
    if (!author || !content?.trim()) {
      res.status(400).json({ error: 'author and content required' }); return
    }
    const info = addDiscussion(req.params.entryId, author, content.trim())
    res.status(201).json({ id: info.lastInsertRowid, entryId: req.params.entryId, author, content: content.trim(), createdAt: Date.now() })
  })

  // ─── POST /activate/:entryId ──────────────────────────────────────────────
  // Call activateEntry on-chain after the challenge window passes.
  app.post('/activate/:entryId', async (req, res) => {
    const entryId = req.params.entryId as `0x${string}`
    const onChainEntry = await getEntryFromChain(entryId)
    if (!onChainEntry) { res.status(404).json({ error: 'entry not found on chain' }); return }
    if (onChainEntry.status !== 0) {
      res.json({
        entryId,
        inftTokenId: onChainEntry.inftTokenId.toString(),
        status: onChainEntry.status,
      })
      return
    }

    let tokenId: bigint | null = null
    try {
      tokenId = await activateEntryOnChain(entryId)
    } catch (e) {
      const detail = ((e as Error)?.message ?? String(e)).slice(0, 520)
      console.error('[POST /activate]', entryId, detail)
      const tid = await getInftTokenId(entryId).catch(() => null)
      res.status(400).json({
        error:
          'activateEntry failed — ensure API operator wallet is setAuthorized on MnemosyneRegistry (or registry owner calls), Galileo txs ok, and challenge window elapsed.',
        detail,
        inftTokenId: tid !== null && tid > 0n ? tid.toString() : '0',
      })
      return
    }

    if (!tokenId || tokenId === 0n) {
      tokenId = await getInftTokenId(entryId).catch(() => null)
    }

    if (tokenId != null && tokenId > 0n) {
      upsertEntry(entryId, { status: 1, inftTokenId: tokenId.toString() })
    }

    const finalEntry = await getEntryFromChain(entryId)
    res.json({
      entryId,
      inftTokenId: tokenId?.toString() ?? finalEntry?.inftTokenId?.toString() ?? '0',
      status: finalEntry?.status,
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
        try {
          const dk = manifestDecryptId(entry)
          const entryBlob = await downloadEntryBlob(storage, entry.storageRef, dk)
          const embVector = entry.embeddingRef
            ? await downloadEmbeddingBlob(storage, entry.embeddingRef).then(b => b.vector).catch(() => [])
            : []
          cache.set(entry.entryId, {
            content: entryBlob.content,
            vector: embVector,
            storageRef: entry.storageRef,
            tags: entry.tags,
            domain: entry.domain,
            encryptionEntryId: entryBlob.id,
          })
        } catch (err) {
          console.warn('[load-manifest] skipping entry:', entry.entryId, (err as Error).message?.slice(0, 80))
        }
      }),
    )

    res.json({ loaded: active.length, total: cache.size })
  })

  // ─── GET /load-from-ens/:ensName ─────────────────────────────────────────
  // Resolve an ENS name → read memory.index → load its manifest into the cache.
  // Agent B bootstraps knowledge from agent A by calling GET /load-from-ens/agentA.eth

  app.get('/load-from-ens/:ensName', async (req, res) => {
    const ensName     = req.params.ensName
    let manifestRef = await getMemoryIndex(ensName)

    if (!manifestRef) {
      const dbEntries = getAllDbEntries()
        .filter(e => e.submitter?.toLowerCase() === ensName.toLowerCase() && e.content)

      if (dbEntries.length === 0) {
        res.status(404).json({ error: `No memory.index found for ${ensName}` })
        return
      }

      // Fallback bootstrap: load directly from DB so the endpoint still works
      // even when ENS text records are temporarily missing.
      for (const e of dbEntries) {
        cache.set(e.entryId, {
          content: e.content!,
          vector: [],
          storageRef: e.storageRef ?? '',
          tags: e.tags,
          domain: e.domain ?? undefined,
          submittedBy: ensName,
          onchainEntryId: e.entryId as `0x${string}`,
          encryptionEntryId: e.encryptionEntryId,
        })
      }

      // Self-heal: if possible, reconstruct and write memory.index back to ENS.
      const ensKey = process.env.ENS_PRIVATE_KEY as `0x${string}` | undefined
      const withStorage = dbEntries.filter(e => !!e.storageRef)
      if (ensKey && withStorage.length > 0) {
        try {
          let currentRef: string | null = null
          const ordered = [...withStorage].sort((a, b) => (a.submittedAt ?? 0) - (b.submittedAt ?? 0))
          for (const e of ordered) {
            currentRef = await addEntryToManifest(storage, currentRef, ensName, {
              entryId: e.entryId,
              ...(e.encryptionEntryId !== e.entryId ? { storageDecryptId: e.encryptionEntryId } : {}),
              storageRef: e.storageRef!,
              embeddingRef: '',
              domain: (e.domain ?? 'factual') as ManifestEntry['domain'],
              tags: e.tags,
              status: 'active',
              submittedAt: e.submittedAt ?? Math.floor(Date.now() / 1000),
            })
          }
          if (currentRef) {
            await setMemoryIndex(ensKey, ensName, currentRef)
            manifestRef = currentRef
          }
        } catch (err) {
          console.error('[load-from-ens] memory.index repair failed:', (err as Error).message ?? err)
        }
      }

      res.json({
        loaded: dbEntries.length,
        total: cache.size,
        manifestRef: manifestRef ?? 'db-fallback',
        ensName,
      })
      return
    }

    try {
      const manifest = await downloadManifest(storage, manifestRef)
      const active   = activeEntries(manifest)

      await Promise.all(
        active.map(async (entry) => {
          try {
            const dk = manifestDecryptId(entry)
            const entryBlob = await downloadEntryBlob(storage, entry.storageRef, dk)
            const embVector = entry.embeddingRef
              ? await downloadEmbeddingBlob(storage, entry.embeddingRef).then(b => b.vector).catch(() => [])
              : []
            cache.set(entry.entryId, {
              content: entryBlob.content,
              vector: embVector,
              storageRef: entry.storageRef,
              tags: entry.tags,
              domain: entry.domain,
              submittedBy: ensName,
              encryptionEntryId: entryBlob.id,
            })
          } catch (err) {
            console.warn('[load-from-ens] skipping entry:', entry.entryId, (err as Error).message?.slice(0, 80))
          }
        }),
      )

      res.json({ loaded: active.length, total: cache.size, manifestRef, ensName })
      return
    } catch (err) {
      console.error('[load-from-ens] manifest load failed, falling back to DB:', (err as Error).message ?? err)
      const dbEntries = getAllDbEntries()
        .filter(e => e.submitter?.toLowerCase() === ensName.toLowerCase() && e.content)
      for (const e of dbEntries) {
        cache.set(e.entryId, {
          content: e.content!,
          vector: [],
          storageRef: e.storageRef ?? '',
          tags: e.tags,
          domain: e.domain ?? undefined,
          submittedBy: ensName,
          onchainEntryId: e.entryId as `0x${string}`,
          encryptionEntryId: e.encryptionEntryId,
        })
      }
      res.json({
        loaded: dbEntries.length,
        total: cache.size,
        manifestRef,
        ensName,
        fallback: 'db',
      })
      return
    }
  })

  // ─── GET /graph ──────────────────────────────────────────────────────────
  // Returns the full knowledge graph: nodes (entries + agents) + edges.
  // Nodes: one per entry + one per unique ENS submitter (agent node).
  // Entry↔Entry edges: cosine similarity ≥ 0.6 (computed at store time).
  // Agent→Entry edges: derived from submittedBy + queriedByAgents.

  app.get('/graph', (_req, res) => {
    const nodes: object[] = []
    const edges: object[] = []
    const agentsSeen = new Set<string>()

    for (const [entryId, entry] of cache.entries()) {
      nodes.push({
        id: entryId,
        type: 'entry',
        content: entry.content.slice(0, 120),
        domain: entry.domain,
        tags: entry.tags,
        submittedBy: entry.submittedBy,
        inftTokenId: entry.inftTokenId?.toString(),
        queryCount: entry.queriedByAgents?.length ?? 0,
      })

      // Agent node for submitter
      if (entry.submittedBy) {
        if (!agentsSeen.has(entry.submittedBy)) {
          agentsSeen.add(entry.submittedBy)
          nodes.push({ id: entry.submittedBy, type: 'agent' })
        }
        edges.push({ source: entry.submittedBy, target: entryId, type: 'submitted', weight: 1 })
      }

      // Semantic similarity edges between entries
      for (const [targetId, score] of Object.entries(entry.edges ?? {})) {
        if (entryId < targetId) { // deduplicate — only emit each pair once
          edges.push({ source: entryId, target: targetId, type: 'similar', weight: score })
        }
      }

      // Agent→Entry edges for querying agents
      for (const agent of entry.queriedByAgents ?? []) {
        if (!agentsSeen.has(agent)) {
          agentsSeen.add(agent)
          nodes.push({ id: agent, type: 'agent' })
        }
        edges.push({ source: agent, target: entryId, type: 'queried', weight: 0.5 })
      }
    }

    res.json({ nodes, edges, entryCount: cache.size, agentCount: agentsSeen.size })
  })

  // ─── POST /distribute ────────────────────────────────────────────────────
  // Route accumulated royalties to contributors via Uniswap.
  // Reads payment.token from each contributor's ENS name and swaps ETH → token.
  // Body: { contributors: [{ensName, amountWei}] }
  // If contributors omitted, builds the list from the cache (1 ROYALTY_WEI per entry).

  app.post('/distribute', async (req, res) => {
    const royaltyWei = BigInt(process.env.ROYALTY_WEI ?? '1000000000000000')
    let entries: DistributeEntry[]

    if (req.body?.contributors?.length) {
      entries = (req.body.contributors as {ensName: string; amountWei: string}[]).map(c => ({
        ensName: c.ensName,
        amountWei: BigInt(c.amountWei),
      }))
    } else {
      // Collect ENS submitters + their resolved addresses from cache
      const submitterMap = new Map<string, `0x${string}`>() // ensName → address
      for (const entry of cache.values()) {
        if (!entry.submittedBy?.endsWith('.eth') || !entry.submitterAddress) continue
        submitterMap.set(entry.submittedBy, entry.submitterAddress)
      }

      // Read actual claimable balances from RoyaltyVault on 0G (accounting ledger)
      // Use those proportions to determine Sepolia payout amounts
      const addresses = Array.from(submitterMap.values())
      const vaultBalances = await readVaultClaimable(addresses)

      if (vaultBalances.size > 0) {
        // Scale vault A0GI proportions to Sepolia ETH pool (1:1 ratio for demo)
        entries = Array.from(submitterMap.entries())
          .filter(([, addr]) => vaultBalances.has(addr))
          .map(([ensName, addr]) => ({ ensName, address: addr, amountWei: vaultBalances.get(addr)! }))
      } else {
        // Fallback: no vault balances — use 1 ROYALTY_WEI per cached entry
        const totals = new Map<string, bigint>()
        for (const entry of cache.values()) {
          if (!entry.submittedBy?.endsWith('.eth')) continue
          totals.set(entry.submittedBy, (totals.get(entry.submittedBy) ?? 0n) + royaltyWei)
        }
        entries = Array.from(totals.entries()).map(([ensName, amountWei]) => ({ ensName, amountWei }))
      }
    }

    if (entries.length === 0) {
      res.status(400).json({ error: 'No contributors to distribute to' })
      return
    }

    const results = await distributeViaUniswap(entries)
    res.json({ distributed: results.length, results })
  })

  // ─── /keeper/* endpoints ─────────────────────────────────────────────────
  // Called by KeeperHub workflows (or any agent via MCP) to trigger keeper operations.
  // When USE_KEEPERHUB=true the inline setInterval keeper is disabled and these
  // endpoints become the only execution path. When false both run (belt-and-braces).
  //
  // Agents with KeeperHub MCP access can call these directly:
  //   "Activate all pending Mnemosyne iNFTs"  → POST /keeper/activate-pending
  //   "Run weekly royalty distribution"        → POST /keeper/distribute
  //   "Check pending entries"                  → GET  /keeper/status

  app.get('/keeper/status', (_req, res) => {
    const now = Math.floor(Date.now() / 1000)
    const pending: object[] = []
    const ready: object[]   = []

    for (const [localId, entry] of cache.entries()) {
      if (!entry.onchainEntryId || entry.inftTokenId) continue
      const item = {
        localId,
        onchainEntryId: entry.onchainEntryId,
        challengeWindowEnd: entry.challengeWindowEnd,
        readyToActivate: !entry.challengeWindowEnd || now >= entry.challengeWindowEnd,
      }
      if (item.readyToActivate) ready.push(item)
      else pending.push(item)
    }

    res.json({
      useKeeperHub: process.env.USE_KEEPERHUB === 'true',
      pendingActivation: pending.length + ready.length,
      readyToActivate: ready.length,
      entries: { pending, ready },
    })
  })

  app.post('/keeper/activate-pending', async (_req, res) => {
    const now = Math.floor(Date.now() / 1000)
    const results: object[] = []

    for (const [localId, entry] of cache.entries()) {
      if (!entry.onchainEntryId || entry.inftTokenId) continue
      if (entry.challengeWindowEnd && now < entry.challengeWindowEnd) continue

      const tokenId = await activateEntryOnChain(entry.onchainEntryId)
        .catch(() => getInftTokenId(entry.onchainEntryId!).catch(() => null))

      if (tokenId && tokenId > 0n) {
        cache.set(localId, { ...entry, inftTokenId: tokenId })
        results.push({ localId, onchainEntryId: entry.onchainEntryId, inftTokenId: tokenId.toString() })
      }
    }

    res.json({ activated: results.length, results })
  })

  app.post('/keeper/distribute', async (_req, res) => {
    const entries = Array.from(cache.entries())
      .filter(([, e]) => e.submittedBy)
      .map(([, e]) => ({ ensName: e.submittedBy!, amountWei: BigInt(process.env.ROYALTY_WEI ?? '1000000000000000') }))

    if (entries.length === 0) {
      res.json({ distributed: 0, results: [] }); return
    }
    const results = await distributeViaUniswap(entries)
    res.json({ distributed: results.length, results })
  })

  // ─── iNFT activation keeper (inline fallback) ────────────────────────────
  // Disabled when USE_KEEPERHUB=true — KeeperHub workflows take over.

  if (process.env.USE_KEEPERHUB !== 'true') {
    setInterval(async () => {
      const now = Math.floor(Date.now() / 1000)
      for (const [localId, entry] of cache.entries()) {
        if (!entry.onchainEntryId || entry.inftTokenId) continue
        if (entry.challengeWindowEnd && now < entry.challengeWindowEnd) continue

        const tokenId = await activateEntryOnChain(entry.onchainEntryId)
          .catch(() => getInftTokenId(entry.onchainEntryId!).catch(() => null))

        if (tokenId && tokenId > 0n) {
          cache.set(localId, { ...entry, inftTokenId: tokenId })
        }
      }
    }, 2 * 60 * 1000)
  }

  // ─── GET /market/listings ────────────────────────────────────────────────
  // Returns all active iNFT listings from the MnemosyneMarket escrow contract.

  app.get('/market/listings', async (_req, res) => {
    const listings = await getActiveListings()
    res.json({
      listings: listings.map((l) => ({
        tokenId: l.tokenId.toString(),
        seller:  l.seller,
        price:   l.price.toString(),
        priceEth: (Number(l.price) / 1e18).toFixed(6),
      })),
    })
  })

  // ─── POST /market/list ───────────────────────────────────────────────────
  // List an iNFT for sale. The API wallet (which owns all minted iNFTs) acts as relayer.
  // Body: { tokenId: string, sellerAddress: string, priceWei: string }

  app.post('/market/list', async (req, res) => {
    const { tokenId, sellerAddress, priceWei } = req.body as {
      tokenId: string
      sellerAddress: string
      priceWei: string
    }
    if (!tokenId || !sellerAddress || !priceWei) {
      res.status(400).json({ error: 'tokenId, sellerAddress, priceWei required' }); return
    }
    const txHash = await listOnMarket(
      BigInt(tokenId),
      sellerAddress as `0x${string}`,
      BigInt(priceWei),
    )
    res.json({ txHash, tokenId, sellerAddress, priceWei })
  })

  // ─── POST /market/buy ────────────────────────────────────────────────────
  // Buy a listed iNFT. API wallet pays the price in A0GI and sends the iNFT to recipient.
  // Body: { tokenId: string, recipientAddress: string, priceWei: string }

  app.post('/market/buy', async (req, res) => {
    const { tokenId, recipientAddress, priceWei } = req.body as {
      tokenId: string
      recipientAddress: string
      priceWei: string
    }
    if (!tokenId || !recipientAddress || !priceWei) {
      res.status(400).json({ error: 'tokenId, recipientAddress, priceWei required' }); return
    }
    const txHash = await buyFromMarket(
      BigInt(tokenId),
      recipientAddress as `0x${string}`,
      BigInt(priceWei),
    )
    // After purchase the royalty stream follows the new owner — resolveRoyaltyRecipient
    // will pick up the new ownerOf() automatically on the next query.
    res.json({ txHash, tokenId, recipientAddress })
  })

  // ─── DELETE /market/listing/:tokenId ─────────────────────────────────────
  // Cancel a listing and return the iNFT to the seller.

  app.delete('/market/listing/:tokenId', async (req, res) => {
    const txHash = await cancelMarketListing(BigInt(req.params.tokenId))
    res.json({ txHash, tokenId: req.params.tokenId })
  })

  // ─── PATCH /market/listing/:tokenId ──────────────────────────────────────
  // Update the price of an active listing.
  // Body: { priceWei: string }

  app.patch('/market/listing/:tokenId', async (req, res) => {
    const { priceWei } = req.body as { priceWei: string }
    if (!priceWei) { res.status(400).json({ error: 'priceWei required' }); return }
    const txHash = await updateMarketPrice(BigInt(req.params.tokenId), BigInt(priceWei))
    res.json({ txHash, tokenId: req.params.tokenId, priceWei })
  })

  return app
}
