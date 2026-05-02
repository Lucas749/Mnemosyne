'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { MnemosyneForceGraph } from '@/components/force-graph'
import { Tag } from '@/components/design-system'
import { T } from '@/components/design-system'
import { useGraphData, type FgNode, type OnChainEntry } from '@/hooks/use-graph-data'
import { entryEns } from '@/lib/entry-name'
import { STATUS_LABELS } from '@/lib/contracts'

// Knowledge domains extracted from entry tags
const KNOWLEDGE_DOMAINS = ['ALL', 'ECONOMICS', 'CRYPTOGRAPHY', 'ARCHITECTURE', 'AI', 'BLOCKCHAIN', 'PROTOCOL', 'GOVERNANCE', 'HISTORY', 'SCIENCE']

function matchesDomain(entry: OnChainEntry, domain: string): boolean {
  if (domain === 'ALL') return true
  return entry.tags.some(t => t.toUpperCase() === domain || t.toUpperCase().includes(domain))
}

const DOMAIN_DESCRIPTIONS: Record<string, string> = {
  ECONOMICS: 'Covers tokenomics, staking mechanisms, fee models, economic incentives, and market dynamics in decentralized systems.',
  CRYPTOGRAPHY: 'Zero-knowledge proofs, cryptographic primitives, privacy techniques, and proof systems used in blockchain protocols.',
  ARCHITECTURE: 'System design, storage layers, network topology, consensus mechanisms, and infrastructure components.',
  AI: 'Machine learning models, agent memory systems, LLM integrations, and AI tooling for blockchain applications.',
  BLOCKCHAIN: 'On-chain data structures, smart contract patterns, protocol internals, and chain-specific implementations.',
  PROTOCOL: 'Protocol specifications, standard definitions, interface contracts, and governance frameworks.',
  GOVERNANCE: 'Decentralized governance models, voting mechanisms, DAO structures, and protocol upgrade processes.',
  NFT: 'Non-fungible token standards, metadata schemas, royalty models, and marketplace mechanics.',
}

function generatePreview(entry: OnChainEntry): string {
  const knowledgeTags = entry.tags.filter(t =>
    !['factual','labeled_example','structured_data','observation','correction'].includes(t.toLowerCase())
  )
  const primaryTag = knowledgeTags[0]?.toUpperCase() ?? ''
  const base = DOMAIN_DESCRIPTIONS[primaryTag] ?? ''
  if (base) return base
  if (knowledgeTags.length > 0) {
    return `This entry covers ${knowledgeTags.slice(0, 3).join(', ').toLowerCase()}. Click to read the full article and view on-chain provenance data.`
  }
  return 'On-chain knowledge entry. Click to read the full article.'
}

function EntryCard({ entry }: { entry: OnChainEntry }) {
  const name = entryEns(entry.id)
  const topTags = entry.tags.filter(t => !['factual','labeled_example','structured_data','observation','correction'].includes(t.toLowerCase())).slice(0, 4)
  const statusLabel = STATUS_LABELS[entry.status] ?? 'PENDING'
  const preview = generatePreview(entry)

  return (
    <Link href={`/entry/${entry.id}`} style={{ textDecoration: 'none' }}>
      <div style={{
        padding: '20px 24px', borderBottom: `1px solid ${T.borderLight}`,
        cursor: 'pointer',
      }}
        onMouseEnter={e => (e.currentTarget.style.background = T.faint)}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: T.accent, marginBottom: 4, fontFamily: T.codeFont }}>
              {name}
            </div>
            <div style={{ fontSize: 11, color: T.text, lineHeight: 1.7, marginBottom: 10, maxWidth: 680 }}>
              {preview}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {topTags.map(t => (
                <Tag key={t}>{t}</Tag>
              ))}
              <Tag variant={entry.status === 1 ? 'success' : entry.status === 2 ? 'danger' : 'warning'}>
                {statusLabel}
              </Tag>
              <span style={{ fontSize: 9, color: T.muted, marginLeft: 8 }}>
                by {entry.submitter.slice(0, 10)}...
              </span>
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0, paddingTop: 4 }}>
            <div style={{ fontSize: 10, color: T.muted }}>{entry.queryCount.toLocaleString()} queries</div>
            <div style={{ fontSize: 9, color: T.accent, marginTop: 6 }}>READ →</div>
          </div>
        </div>
      </div>
    </Link>
  )
}

function ExploreInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const urlTag = searchParams.get('tag') ?? searchParams.get('domain') ?? 'ALL'

  const [domain, setDomain] = useState(urlTag.toUpperCase())
  const [view, setView] = useState<'list' | 'graph'>(urlTag !== 'ALL' ? 'list' : 'list')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [graphHeight, setGraphHeight] = useState(600)
  const containerRef = useRef<HTMLDivElement>(null)

  const { nodes, links, entries, loading } = useGraphData(120)

  useEffect(() => {
    const tag = searchParams.get('tag') ?? searchParams.get('domain') ?? 'ALL'
    setDomain(tag.toUpperCase())
  }, [searchParams])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setGraphHeight(e.contentRect.height))
    ro.observe(el)
    setGraphHeight(el.clientHeight)
    return () => ro.disconnect()
  }, [])

  const filteredEntries = entries.filter(e => {
    const domainMatch = matchesDomain(e, domain)
    const statusMatch = statusFilter === 'ALL'
      || (statusFilter === 'ACTIVE' && e.status === 1)
      || (statusFilter === 'PENDING' && e.status === 0)
      || (statusFilter === 'CONTESTED' && e.status === 2)
    return domainMatch && statusMatch
  })

  const handleNodeClick = (node: FgNode) => {
    if (node.type === 'entry') router.push(`/entry/${node.id}`)
    else router.push(`/agent/${node.id}`)
  }

  const agentCount = nodes.filter(n => n.type === 'agent').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 52px)', fontFamily: T.codeFont }}>
      {/* Controls bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, padding: '10px 24px',
        background: T.surface, borderBottom: `1px solid ${T.border}`, flexShrink: 0, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 9, color: T.muted, letterSpacing: '0.1em' }}>DOMAIN</span>
          <select
            value={domain}
            onChange={e => {
              setDomain(e.target.value)
              router.replace(e.target.value === 'ALL' ? '/explore' : `/explore?tag=${e.target.value}`, { scroll: false })
            }}
            style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 3, padding: '4px 10px', fontFamily: T.codeFont, fontSize: 10, color: T.text }}
          >
            {KNOWLEDGE_DOMAINS.map(d => <option key={d}>{d}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 9, color: T.muted, letterSpacing: '0.1em' }}>STATUS</span>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 3, padding: '4px 10px', fontFamily: T.codeFont, fontSize: 10, color: T.text }}>
            <option>ALL</option><option>PENDING</option><option>ACTIVE</option><option>CONTESTED</option>
          </select>
        </div>

        {/* View toggle */}
        <div style={{ display: 'flex', gap: 0, border: `1px solid ${T.border}`, borderRadius: 3, overflow: 'hidden' }}>
          {(['list', 'graph'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '4px 14px', fontFamily: T.codeFont, fontSize: 9, letterSpacing: '0.08em',
              background: view === v ? T.accent : T.bg,
              color: view === v ? '#fff' : T.muted,
              border: 'none', cursor: 'pointer',
            }}>
              {v.toUpperCase()}
            </button>
          ))}
        </div>

        <div style={{ marginLeft: 'auto', fontSize: 9, color: T.muted }}>
          {loading ? 'loading...' : `${filteredEntries.length} entries · ${agentCount} agents`}
        </div>
      </div>

      {/* Article list view */}
      {view === 'list' && (
        <div style={{ flex: 1, overflowY: 'auto', background: T.bg }}>
          {loading && filteredEntries.length === 0 && (
            <div style={{ padding: '32px 24px', fontSize: 11, color: T.muted }}>Loading entries from chain...</div>
          )}
          {!loading && filteredEntries.length === 0 && (
            <div style={{ padding: '32px 24px', fontSize: 11, color: T.muted }}>
              No entries found for domain <strong>{domain}</strong>.
              {domain !== 'ALL' && (
                <span> Entries are tagged with knowledge topics — try <Link href="/explore" style={{ color: T.accent }}>ALL</Link>.</span>
              )}
            </div>
          )}
          <div style={{ maxWidth: 860, margin: '0 auto' }}>
            {filteredEntries.map(entry => (
              <EntryCard key={entry.id} entry={entry} />
            ))}
          </div>
        </div>
      )}

      {/* Graph view */}
      {view === 'graph' && (
        <div ref={containerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden', background: T.bg }}>
          <MnemosyneForceGraph
            nodes={nodes}
            links={links}
            height={graphHeight}
            filterDomain={domain}
            filterStatus={statusFilter}
            filterEdge="ALL"
            showWeights={false}
            onNodeClick={handleNodeClick}
          />
          <div style={{
            position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
            background: T.surface, border: `1px solid ${T.border}`, borderRadius: 3,
            padding: '10px 20px', display: 'flex', gap: 24, alignItems: 'center', pointerEvents: 'none',
          }}>
            {[
              { icon: '●', label: 'Entry node', color: T.accent },
              { icon: '◉', label: 'Agent node', color: T.muted },
            ].map(l => (
              <span key={l.label} style={{ fontSize: 10, color: l.color, whiteSpace: 'nowrap' }}>
                {l.icon} <span style={{ color: T.muted }}>{l.label}</span>
              </span>
            ))}
          </div>
          <div style={{ position: 'absolute', top: 16, right: 16, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 3, padding: '10px 16px', fontSize: 9, color: T.muted, lineHeight: 1.8 }}>
            Click entry → view article<br />
            Click agent → view profile
          </div>
        </div>
      )}
    </div>
  )
}

export default function ExplorePage() {
  return (
    <Suspense>
      <ExploreInner />
    </Suspense>
  )
}
