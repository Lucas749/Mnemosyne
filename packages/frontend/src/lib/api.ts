const API = process.env.NEXT_PUBLIC_API_URL ?? 'https://mnemosyne-api-production-7cd6.up.railway.app'

export type JobStatus<T> =
  | { status: 'pending' }
  | { status: 'done'; result: T }
  | { status: 'error'; error: string }

export type StoreResult = {
  entryId: string
  storageRef: string
  embeddingRef: string
  manifestRef: string
}

export type QueryMatch = {
  entryId: string
  similarity: number
  storageRef: string
  tags: string[]
  domain: string
  submittedBy: string
  submitterAddress: string
  hasContent: boolean
}

export type GraphData = {
  nodes: GraphNode[]
  edges: GraphEdge[]
  entryCount: number
  agentCount: number
}

export type GraphNode = {
  id: string
  type: 'entry' | 'agent'
  content?: string
  domain?: string
  tags?: string[]
  submittedBy?: string
  inftTokenId?: string
  queryCount?: number
}

export type GraphEdge = {
  source: string
  target: string
  type: 'similar' | 'submitted' | 'queried'
  weight: number
}

export type MarketListing = {
  tokenId: string
  seller: string
  price: string
  priceEth: string
}

export type UnlockResult = {
  entryId: string
  content: string
  submittedBy: string
  domain: string
  tags: string[]
  paymentConfirmed: boolean
}

export async function apiHealth(): Promise<{ status: string; entries: number }> {
  const r = await fetch(`${API}/health`)
  return r.json()
}

export async function pollJob<T>(jobId: string, onProgress?: (status: string) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const interval = setInterval(async () => {
      try {
        const r = await fetch(`${API}/jobs/${jobId}`)
        const job: JobStatus<T> = await r.json()
        if (job.status === 'done') {
          clearInterval(interval)
          resolve(job.result)
        } else if (job.status === 'error') {
          clearInterval(interval)
          reject(new Error(job.error))
        } else if (onProgress) {
          onProgress(job.status)
        }
      } catch (e) {
        clearInterval(interval)
        reject(e)
      }
    }, 2000)
  })
}

export async function submitEntry(payload: {
  content: string
  domain: string
  tags: string[]
  submittedBy: string
}): Promise<string> {
  const r = await fetch(`${API}/store`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!r.ok) throw new Error(`Store failed: ${r.status}`)
  const { jobId } = await r.json()
  return jobId
}

export async function queryKnowledge(payload: {
  text: string
  topK?: number
  domains?: string[]
  queriedBy?: string
}): Promise<string> {
  const r = await fetch(`${API}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topK: 5, ...payload }),
  })
  if (!r.ok) throw new Error(`Query failed: ${r.status}`)
  const { jobId } = await r.json()
  return jobId
}

export async function unlockEntry(entryId: string, queriedBy: string, paymentTxHash?: string): Promise<UnlockResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (paymentTxHash) headers['X-Payment'] = paymentTxHash

  const r = await fetch(`${API}/unlock`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ entryId, queriedBy }),
  })
  if (r.status === 402) {
    const body = await r.json()
    throw Object.assign(new Error('Payment required'), { code: 402, x402: body.x402 })
  }
  if (!r.ok) throw new Error(`Unlock failed: ${r.status}`)
  return r.json()
}

export async function fetchGraph(): Promise<GraphData> {
  const r = await fetch(`${API}/graph`)
  if (!r.ok) throw new Error('Graph endpoint not available')
  return r.json()
}

export async function fetchMarketListings(): Promise<{ listings: MarketListing[] }> {
  const r = await fetch(`${API}/market/listings`)
  if (!r.ok) throw new Error('Market API not available')
  return r.json()
}

export async function buyListing(tokenId: string, recipientAddress: string, priceWei: string): Promise<{ txHash: string }> {
  const r = await fetch(`${API}/market/buy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tokenId, recipientAddress, priceWei }),
  })
  if (!r.ok) throw new Error('Market buy failed')
  return r.json()
}

export async function listForSale(tokenId: string, sellerAddress: string, priceWei: string): Promise<{ txHash: string }> {
  const r = await fetch(`${API}/market/list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tokenId, sellerAddress, priceWei }),
  })
  if (!r.ok) throw new Error('Market list failed')
  return r.json()
}

export async function cancelListing(tokenId: string): Promise<{ txHash: string }> {
  const r = await fetch(`${API}/market/listing/${tokenId}`, { method: 'DELETE' })
  if (!r.ok) throw new Error('Cancel listing failed')
  return r.json()
}

export async function updateListingPrice(tokenId: string, priceWei: string): Promise<{ txHash: string }> {
  const r = await fetch(`${API}/market/listing/${tokenId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ priceWei }),
  })
  if (!r.ok) throw new Error('Update price failed')
  return r.json()
}

export async function loadFromEns(ensName: string): Promise<{ loaded: number; total: number; ensName: string; manifestRef: string }> {
  const r = await fetch(`${API}/load-from-ens/${ensName}`)
  if (!r.ok) throw new Error('ENS load failed')
  return r.json()
}
