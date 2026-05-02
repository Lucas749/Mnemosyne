'use client'

import dynamic from 'next/dynamic'
import { useRef, useCallback, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { T } from './design-system'
import type { FgNode, FgLink } from '@/hooks/use-graph-data'

const ForceGraph2D = dynamic(
  () => import('react-force-graph').then(m => m.ForceGraph2D),
  { ssr: false }
)

const DOMAIN_COLORS = ['#b45309', '#d97706', '#c2410c', '#92400e', '#a16207', '#78350f']

interface MnemosyneGraphProps {
  nodes: FgNode[]
  links: FgLink[]
  height?: number
  mini?: boolean
  onNodeClick?: (node: FgNode) => void
  filterDomain?: string
  filterStatus?: string
  filterEdge?: string
  showWeights?: boolean
}

export function MnemosyneForceGraph({
  nodes,
  links,
  height = 320,
  mini = false,
  onNodeClick,
  filterDomain = 'ALL',
  filterStatus = 'ALL',
  filterEdge = 'ALL',
  showWeights = false,
}: MnemosyneGraphProps) {
  const router = useRouter()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)
  const [hovered, setHovered] = useState<FgNode | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  // Apply domain/status/edge filters
  const filteredNodes = nodes.filter(n => {
    if (n.type === 'agent') return true
    if (filterDomain !== 'ALL' && n.domainLabel?.toUpperCase() !== filterDomain) return false
    if (filterStatus !== 'ALL') {
      const statusMap: Record<string, number> = { PENDING: 0, ACTIVE: 1, CONTESTED: 2, STALE: 3, BURNED: 4 }
      if (n.status !== statusMap[filterStatus]) return false
    }
    return true
  })
  const filteredNodeIds = new Set(filteredNodes.map(n => n.id))

  const filteredLinks = links.filter(l => {
    const srcId = typeof l.source === 'string' ? l.source : (l.source as FgNode).id
    const tgtId = typeof l.target === 'string' ? l.target : (l.target as FgNode).id
    if (!filteredNodeIds.has(srcId) || !filteredNodeIds.has(tgtId)) return false
    if (filterEdge !== 'ALL' && l.type.toUpperCase() !== filterEdge) return false
    return true
  })

  const nodeColor = useCallback((node: FgNode) => {
    if (node.type === 'agent') return '#1c1814'
    return DOMAIN_COLORS[node.domainIdx ?? 0] ?? '#b45309'
  }, [])

  const nodeVal = useCallback((node: FgNode) => {
    if (node.type === 'agent') return mini ? 3 : 8
    return Math.max(2, Math.log((node.queryCount ?? 0) + 1) * (mini ? 1.5 : 3))
  }, [mini])

  const linkColor = useCallback((link: FgLink) => {
    if (link.type === 'similar') return '#c8bfb0'
    return '#4A90D9'
  }, [])

  const linkDirectionalParticles = useCallback((link: FgLink) => {
    return link.type === 'submitted' && !mini ? 1 : 0
  }, [mini])

  const handleNodeClick = useCallback((node: FgNode) => {
    if (mini) return
    if (onNodeClick) { onNodeClick(node); return }
    if (node.type === 'entry') router.push(`/entry/${node.id}`)
    else router.push(`/agent/${node.id}`)
  }, [router, mini, onNodeClick])

  const handleNodeHover = useCallback((node: FgNode | null) => {
    setHovered(node)
    if (containerRef.current && node) {
      // tooltip position is approximated; ForceGraph2D handles canvas coordinates
    }
  }, [])

  const nodeCanvasObject = useCallback((node: FgNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const isAgent = node.type === 'agent'
    const color = isAgent ? '#1c1814' : (DOMAIN_COLORS[node.domainIdx ?? 0] ?? '#b45309')
    const r = isAgent ? (mini ? 3 : 6) : Math.max(2, Math.log((node.queryCount ?? 0) + 1) * (mini ? 1.5 : 2.5))

    if (isAgent) {
      // Ring style for agents
      ctx.beginPath()
      ctx.arc(node.x ?? 0, node.y ?? 0, r, 0, Math.PI * 2)
      ctx.strokeStyle = color + 'cc'
      ctx.lineWidth = mini ? 1 : 1.5
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(node.x ?? 0, node.y ?? 0, r * 0.4, 0, Math.PI * 2)
      ctx.fillStyle = color + '55'
      ctx.fill()
    } else {
      // Glowing dot for entries
      const grd = ctx.createRadialGradient(node.x ?? 0, node.y ?? 0, 0, node.x ?? 0, node.y ?? 0, r * 2.5)
      grd.addColorStop(0, color + '40')
      grd.addColorStop(1, 'transparent')
      ctx.beginPath()
      ctx.arc(node.x ?? 0, node.y ?? 0, r * 2.5, 0, Math.PI * 2)
      ctx.fillStyle = grd
      ctx.fill()
      ctx.beginPath()
      ctx.arc(node.x ?? 0, node.y ?? 0, r, 0, Math.PI * 2)
      ctx.fillStyle = color + 'cc'
      ctx.fill()
    }

    // Show label if zoomed in enough
    if (!mini && globalScale > 1.5 && node.domainLabel) {
      ctx.font = `${Math.max(6, 9 / globalScale)}px 'Space Mono', monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillStyle = color
      ctx.fillText(node.domainLabel.slice(0, 8), node.x ?? 0, (node.y ?? 0) + r + 2)
    }
  }, [mini])

  const hasData = nodes.length > 0

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height, overflow: 'hidden' }}>
      {hasData ? (
        <ForceGraph2D
          ref={fgRef}
          graphData={{ nodes: filteredNodes, links: filteredLinks }}
          nodeCanvasObject={nodeCanvasObject as unknown as (node: object, ctx: CanvasRenderingContext2D, scale: number) => void}
          nodeCanvasObjectMode={() => 'replace'}
          linkColor={linkColor as unknown as (link: object) => string}
          linkWidth={mini ? 0.5 : 0.8}
          linkDirectionalParticles={linkDirectionalParticles as unknown as number}
          linkDirectionalParticleSpeed={0.004}
          linkDirectionalParticleWidth={1.5}
          backgroundColor={mini ? T.surface : T.bg}
          width={width}
          height={height}
          onNodeClick={handleNodeClick as unknown as (node: object) => void}
          onNodeHover={handleNodeHover as unknown as (node: object | null) => void}
          cooldownTicks={mini ? 50 : 120}
          onEngineStop={() => fgRef.current?.zoomToFit(400, 40)}
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.3}
        />
      ) : (
        // Fall back to canvas animation while loading
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontFamily: T.codeFont, fontSize: 10, color: T.muted }}>Loading graph data...</span>
        </div>
      )}

      {/* Hover tooltip */}
      {hovered && !mini && (
        <div style={{
          position: 'absolute', top: 12, left: 12, pointerEvents: 'none',
          background: T.surface, border: `1px solid ${T.accent}`, borderRadius: 4,
          padding: '12px 16px', width: 200, zIndex: 10,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.text, marginBottom: 4 }}>
            {hovered.type === 'agent' ? 'Agent' : `Entry — ${hovered.domainLabel ?? 'unknown'}`}
          </div>
          <div style={{ fontSize: 9, color: T.muted, marginBottom: 6 }}>
            {hovered.id.slice(0, 20)}...
          </div>
          {hovered.type === 'entry' && (
            <div style={{ fontSize: 9, color: T.muted }}>
              {(hovered.queryCount ?? 0).toLocaleString()} queries
              {hovered.tags && hovered.tags.length > 0 && (
                <span> · {hovered.tags.slice(0, 2).join(', ')}</span>
              )}
            </div>
          )}
          {!mini && (
            <div style={{ marginTop: 8, fontSize: 9, color: T.accent, fontFamily: T.codeFont }}>
              {hovered.type === 'entry' ? 'Click → view entry' : 'Click → view agent'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
