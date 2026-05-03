'use client'

import { useState, useEffect } from 'react'
import { DOMAIN_LABELS } from '@/lib/contracts'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'https://mnemosyne-api-production-7cd6.up.railway.app'

// Keep OnChainEntry for backward compat (entry page still uses wagmi for chain reads)
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

type ApiEntry = {
  entryId: string
  content: string | null
  tags: string[]
  domain: string | null
  submitter: string | null
  storageRef: string | null
}

const DOMAIN_INDEX: Record<string, number> = {
  factual: 0, labeled_example: 1, structured_data: 2, observation: 3, correction: 4,
}

export function useGraphData(_limit = 60): GraphBundle {
  const [nodes, setNodes] = useState<FgNode[]>([])
  const [links, setLinks] = useState<FgLink[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API}/entries`)
      .then(r => r.json())
      .then((data: ApiEntry[]) => {
        const valid = data.filter(e => e.content)
        const nodeList: FgNode[] = []
        const linkList: FgLink[] = []
        const agentsSeen = new Set<string>()

        valid.forEach(e => {
          const domainIdx = DOMAIN_INDEX[e.domain ?? ''] ?? 0
          nodeList.push({
            id: e.entryId,
            type: 'entry',
            domainIdx,
            domainLabel: e.domain ?? 'unknown',
            queryCount: 0,
            status: 0,
            tags: e.tags,
            submitter: e.submitter ?? undefined,
          })

          if (e.submitter) {
            const agentId = e.submitter.toLowerCase()
            if (!agentsSeen.has(agentId)) {
              agentsSeen.add(agentId)
              nodeList.push({ id: agentId, type: 'agent' })
            }
            linkList.push({ source: agentId, target: e.entryId, type: 'submitted' })
          }
        })

        // Connect entries with same domain
        for (let i = 0; i < valid.length; i++) {
          for (let j = i + 1; j < valid.length; j++) {
            if (valid[i].domain === valid[j].domain) {
              linkList.push({ source: valid[i].entryId, target: valid[j].entryId, type: 'similar', value: 0.5 })
            }
          }
        }

        setNodes(nodeList)
        setLinks(linkList)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  return { nodes, links, entries: [], loading }
}
