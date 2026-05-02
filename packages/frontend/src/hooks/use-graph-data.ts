'use client'

import { useMemo } from 'react'
import { useReadContracts } from 'wagmi'
import { REGISTRY_ADDRESS, REGISTRY_ABI, DOMAIN_LABELS } from '@/lib/contracts'
import { zgTestnet } from '@/lib/chains'

export type OnChainEntry = {
  id: `0x${string}`
  storageRef: string
  embeddingRef: string
  tags: string[]
  domain: number
  submitter: `0x${string}`
  stakeAmount: bigint
  status: number
  submittedAt: bigint
  challengeWindowEnd: bigint
  queryCount: bigint
  royaltiesEarned: bigint
  lastQueriedAt: bigint
  inftTokenId: bigint
}

export type FgNode = {
  id: string
  type: 'entry' | 'agent'
  domainIdx?: number
  domainLabel?: string
  queryCount?: number
  status?: number
  tags?: string[]
  submitter?: string
  // injected by force-graph
  x?: number; y?: number; vx?: number; vy?: number; fx?: number; fy?: number
}

export type FgLink = {
  source: string | FgNode
  target: string | FgNode
  type: 'submitted' | 'similar'
  value?: number
}

export type GraphBundle = {
  nodes: FgNode[]
  links: FgLink[]
  entries: OnChainEntry[]
  loading: boolean
}

export function useGraphData(limit = 60): GraphBundle {
  const { data: countData } = useReadContracts({
    contracts: [{ address: REGISTRY_ADDRESS, abi: REGISTRY_ABI, functionName: 'getTotalEntryCount', chainId: zgTestnet.id }],
  })
  const total = countData?.[0]?.result as bigint | undefined
  const fetchLimit = total !== undefined ? (total > BigInt(limit) ? BigInt(limit) : total) : undefined

  const { data: idsData } = useReadContracts({
    contracts: fetchLimit !== undefined ? [
      { address: REGISTRY_ADDRESS, abi: REGISTRY_ABI, functionName: 'getAllEntries', args: [0n, fetchLimit], chainId: zgTestnet.id },
    ] : [],
  })
  const entryIds = idsData?.[0]?.result as `0x${string}`[] | undefined

  const { data: entriesData, isLoading } = useReadContracts({
    contracts: (entryIds ?? []).map(id => ({
      address: REGISTRY_ADDRESS, abi: REGISTRY_ABI,
      functionName: 'getEntry', args: [id], chainId: zgTestnet.id,
    })),
  })

  const entries: OnChainEntry[] = (entriesData ?? [])
    .map(d => d.result as unknown as OnChainEntry)
    .filter(Boolean)

  const { nodes, links } = useMemo(() => {
    if (entries.length === 0) return { nodes: [], links: [] }

    const nodes: FgNode[] = []
    const links: FgLink[] = []
    const agentIds = new Set<string>()

    entries.forEach(e => {
      nodes.push({
        id: e.id,
        type: 'entry',
        domainIdx: e.domain,
        domainLabel: DOMAIN_LABELS[e.domain] ?? 'unknown',
        queryCount: Number(e.queryCount),
        status: e.status,
        tags: e.tags,
        submitter: e.submitter,
      })

      const agentId = e.submitter.toLowerCase()
      if (!agentIds.has(agentId)) {
        agentIds.add(agentId)
        nodes.push({ id: agentId, type: 'agent' })
      }

      links.push({ source: agentId, target: e.id, type: 'submitted' })
    })

    // Connect entries with the same domain (similar edges)
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        if (entries[i].domain === entries[j].domain) {
          links.push({ source: entries[i].id, target: entries[j].id, type: 'similar', value: 0.5 })
        }
      }
    }

    return { nodes, links }
  }, [entries])

  return {
    nodes,
    links,
    entries,
    loading: isLoading && (total === undefined || fetchLimit !== undefined),
  }
}
