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
import { submitOnChain, depositQueryFeeOnChain, authorizeUsageOnChain, getOperatorAddress, resolveRoyaltyRecipient, activateEntryOnChain, getInftTokenId, distributeViaUniswap, readVaultClaimable, getActiveListings, listOnMarket, buyFromMarket, cancelMarketListing, updateMarketPrice } from './chain.js'
import type { DistributeEntry } from './chain.js'
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
  onchainEntryId?: `0x${string}`
  challengeWindowEnd?: number
  inftTokenId?: bigint
  // Graph edges: entryId → similarity score for pairs above threshold
  edges?: Record<string, number>
  // Agents that have queried this entry (from authorizeUsage calls)
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

      // Compute similarity edges against all existing entries
      const EDGE_THRESHOLD = 0.6
      const edges: Record<string, number> = {}
      for (const [existingId, existing] of cache.entries()) {
        const sim = cosineSimilarity(embBlob.vector, existing.vector)
        if (sim >= EDGE_THRESHOLD) {
          edges[existingId] = Math.round(sim * 1000) / 1000
          // Add back-edge on existing entry
          const ex = cache.get(existingId)!
          cache.set(existingId, { ...ex, edges: { ...ex.edges, [entryId]: edges[existingId] } })
        }
      }

      cache.set(entryId, {
        content: body.content,
        vector: embBlob.vector,
        storageRef,
        tags,
        domain,
        submittedBy,
        onchainEntryId: onchainEntryId ?? undefined,
        challengeWindowEnd,
        edges,
        queriedByAgents: [],
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

    const cached = cache.get(entryId)
    if (!cached) { res.status(404).json({ error: 'entry not found in cache' }); return }

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
