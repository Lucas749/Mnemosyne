'use client'

import { useState, useEffect, useRef } from 'react'
import { MnemosyneForceGraph } from '@/components/force-graph'
import { T } from '@/components/design-system'
import { useGraphData, type FgNode } from '@/hooks/use-graph-data'

const DOMAINS = ['ALL', 'FACTUAL', 'LABELED_EXAMPLE', 'STRUCTURED_DATA', 'OBSERVATION', 'CORRECTION']

export default function ExplorePage() {
  const [domain, setDomain] = useState('ALL')
  const [edgeFilter, setEdgeFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [showWeights, setShowWeights] = useState(false)
  const [colorByStatus, setColorByStatus] = useState(false)
  const [graphHeight, setGraphHeight] = useState(600)
  const containerRef = useRef<HTMLDivElement>(null)

  const { nodes, links, entries } = useGraphData(120)

  const agentCount = nodes.filter(n => n.type === 'agent').length

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setGraphHeight(entry.contentRect.height))
    ro.observe(el)
    setGraphHeight(el.clientHeight)
    return () => ro.disconnect()
  }, [])

  const handleNodeClick = (node: FgNode) => {
    if (node.type === 'entry') {
      window.location.href = `/entry/${node.id}`
    } else {
      window.location.href = `/agent/${node.id}`
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 52px)', fontFamily: T.codeFont }}>
      {/* Controls bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, padding: '10px 24px',
        background: T.surface, borderBottom: `1px solid ${T.border}`, flexShrink: 0, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 9, color: T.muted, letterSpacing: '0.1em' }}>DOMAIN</span>
          <select value={domain} onChange={e => setDomain(e.target.value)} style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 3, padding: '4px 10px', fontFamily: T.codeFont, fontSize: 10, color: T.text }}>
            {DOMAINS.map(d => <option key={d}>{d}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 9, color: T.muted, letterSpacing: '0.1em' }}>EDGES</span>
          <select value={edgeFilter} onChange={e => setEdgeFilter(e.target.value)} style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 3, padding: '4px 10px', fontFamily: T.codeFont, fontSize: 10, color: T.text }}>
            <option>ALL</option><option>SIMILAR</option><option>SUBMITTED</option>
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 9, color: T.muted, letterSpacing: '0.1em' }}>STATUS</span>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 3, padding: '4px 10px', fontFamily: T.codeFont, fontSize: 10, color: T.text }}>
            <option>ALL</option><option>ACTIVE</option><option>PENDING</option><option>CONTESTED</option><option>BURNED</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 16, marginLeft: 'auto' }}>
          {[
            { label: 'Show edge weights', val: showWeights, set: setShowWeights },
            { label: 'Color by status', val: colorByStatus, set: setColorByStatus },
          ].map(toggle => (
            <label key={toggle.label} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 10, color: T.muted }}>
              <input type="checkbox" checked={toggle.val} onChange={e => toggle.set(e.target.checked)} style={{ accentColor: T.accent }} />
              {toggle.label}
            </label>
          ))}
        </div>
        {entries.length > 0 && (
          <span style={{ fontSize: 9, color: T.muted }}>
            {entries.length} entries · {agentCount} agents
          </span>
        )}
      </div>

      {/* Graph canvas */}
      <div ref={containerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden', background: T.bg }}>
        <MnemosyneForceGraph
          nodes={nodes}
          links={links}
          height={graphHeight}
          filterDomain={domain}
          filterStatus={statusFilter}
          filterEdge={edgeFilter}
          showWeights={showWeights}
          onNodeClick={handleNodeClick}
        />

        {/* Legend */}
        <div style={{
          position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          background: T.surface, border: `1px solid ${T.border}`, borderRadius: 3,
          padding: '10px 20px', display: 'flex', gap: 24, alignItems: 'center',
          pointerEvents: 'none',
        }}>
          {[
            { icon: '●', label: 'Entry node (size = queries)', color: T.accent },
            { icon: '◉', label: 'Agent node', color: T.muted },
            { icon: '──', label: 'similar', color: T.border },
            { icon: '──', label: 'submitted', color: '#1d4ed8' },
          ].map(l => (
            <span key={l.label} style={{ fontSize: 10, color: l.color, whiteSpace: 'nowrap' }}>
              {l.icon} <span style={{ color: T.muted }}>{l.label}</span>
            </span>
          ))}
        </div>

        {/* Hint */}
        <div style={{ position: 'absolute', top: 16, right: 16, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 3, padding: '10px 16px', fontSize: 9, color: T.muted, lineHeight: 1.8 }}>
          Click entry node → view details<br />
          Click agent node → view profile<br />
          Hover → preview tooltip
        </div>
      </div>
    </div>
  )
}
