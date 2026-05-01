'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { KnowledgeGraphCanvas } from '@/components/knowledge-graph'
import { Tag } from '@/components/design-system'
import { T } from '@/components/design-system'
import { fetchGraph } from '@/lib/api'

const DOMAINS = ['ALL', 'ECONOMICS', 'CRYPTOGRAPHY', 'PROTOCOL', 'HISTORY', 'GOVERNANCE', 'SCIENCE']

export default function ExplorePage() {
  const [domain, setDomain] = useState('ALL')
  const [edgeFilter, setEdgeFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [showWeights, setShowWeights] = useState(false)
  const [colorByStatus, setColorByStatus] = useState(false)
  const [search, setSearch] = useState('')
  const [tooltip, setTooltip] = useState<{ x: number; y: number; node: { id: string; type: string; domain?: string; queryCount?: number; submittedBy?: string } } | null>(null)

  const { data: graphData, error } = useQuery({
    queryKey: ['graph'],
    queryFn: fetchGraph,
    refetchInterval: 30_000,
    retry: false,
  })

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
            <option>ALL</option><option>SIMILAR</option><option>SUBMITTED</option><option>QUERIED</option>
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 9, color: T.muted, letterSpacing: '0.1em' }}>STATUS</span>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 3, padding: '4px 10px', fontFamily: T.codeFont, fontSize: 10, color: T.text }}>
            <option>ALL</option><option>ACTIVE</option><option>PENDING</option><option>CONTESTED</option><option>BURNED</option>
          </select>
        </div>
        <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 3, display: 'flex', alignItems: 'center', padding: '4px 10px', gap: 6 }}>
          <span style={{ fontSize: 11, color: T.muted }}>⌕</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="search nodes..."
            style={{ background: 'none', border: 'none', outline: 'none', fontFamily: T.codeFont, fontSize: 10, color: T.text, width: 160 }}
          />
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
        {graphData && (
          <span style={{ fontSize: 9, color: T.muted }}>
            {graphData.entryCount} entries · {graphData.agentCount} agents
          </span>
        )}
      </div>

      {/* Graph canvas */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: T.bg }}>
        <KnowledgeGraphCanvas fullscreen={true} />

        {error && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4,
            padding: '24px 32px', textAlign: 'center', maxWidth: 360,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 8 }}>Graph data unavailable</div>
            <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.8 }}>
              The animated graph below is a visual representation.<br />
              Real node/edge data requires: <code style={{ color: T.accent }}>GET /graph</code>
            </div>
          </div>
        )}

        {/* Legend */}
        <div style={{
          position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          background: T.surface, border: `1px solid ${T.border}`, borderRadius: 3,
          padding: '10px 20px', display: 'flex', gap: 24, alignItems: 'center',
        }}>
          {[
            { icon: '●', label: 'Entry node (size = queries)', color: T.accent },
            { icon: '◉', label: 'Agent node', color: T.muted },
            { icon: '──', label: 'similar', color: T.border },
            { icon: '──', label: 'submitted', color: '#1d4ed8' },
            { icon: '╌╌', label: 'queried', color: T.success },
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
