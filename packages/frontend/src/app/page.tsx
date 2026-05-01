'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { useReadContract } from 'wagmi'
import { KnowledgeGraphCanvas } from '@/components/knowledge-graph'
import { Tag, WikiInfoBox, BtnPrimary, BtnGhost, ApiUnavailableBanner } from '@/components/design-system'
import { T } from '@/components/design-system'
import { fetchGraph, type GraphNode } from '@/lib/api'
import { REGISTRY_ADDRESS, REGISTRY_ABI, DOMAIN_LABELS, STATUS_LABELS } from '@/lib/contracts'
import { zgTestnet } from '@/lib/chains'
import { formatA0GI } from '@/lib/ens'

const EVENT_ICONS: Record<string, string> = {
  EntrySubmitted: '●', EntryActivated: '◆', QueryRecorded: '▶',
  ChallengeOpened: '!', EntryVerified: '✓', RoyaltyPaid: '◎',
}
const EVENT_COLORS: Record<string, string> = {
  EntrySubmitted: '#b45309', EntryActivated: '#166534', QueryRecorded: '#1d4ed8',
  ChallengeOpened: '#991b1b', EntryVerified: '#166534', RoyaltyPaid: '#92400e',
}

function LiveFeed({ nodes }: { nodes: GraphNode[] }) {
  const recentEntries = nodes.filter(n => n.type === 'entry').slice(0, 8)

  if (recentEntries.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 9, letterSpacing: '0.15em', color: T.muted, padding: '0 0 10px', borderBottom: `1px solid ${T.border}`, marginBottom: 12 }}>
          LIVE ACTIVITY
        </div>
        <div style={{ fontSize: 10, color: T.muted }}>No recent activity</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 9, letterSpacing: '0.15em', color: T.muted, padding: '0 0 10px', borderBottom: `1px solid ${T.border}`, marginBottom: 12 }}>
        LIVE ACTIVITY
      </div>
      {recentEntries.map((n, i) => {
        const eventType = 'EntrySubmitted'
        return (
          <div key={n.id} style={{ display: 'flex', gap: 10, paddingBottom: 12, marginBottom: 12, borderBottom: `1px solid ${T.borderLight}`, cursor: 'pointer' }}>
            <span style={{ color: EVENT_COLORS[eventType], fontSize: 10, marginTop: 1, flexShrink: 0 }}>{EVENT_ICONS[eventType]}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: EVENT_COLORS[eventType], letterSpacing: '0.08em', marginBottom: 2 }}>{eventType}</div>
              <div style={{ fontSize: 10, color: T.muted, lineHeight: 1.5 }}>
                {n.submittedBy ?? 'agent'} submitted entry
              </div>
              <div style={{ fontSize: 9, color: T.borderLight, marginTop: 3 }}>
                Domain: {n.domain ?? 'unknown'}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function HomePage() {
  const { data: totalCount } = useReadContract({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    functionName: 'getTotalEntryCount',
    chainId: zgTestnet.id,
  })

  const { data: graphData, error: graphError } = useQuery({
    queryKey: ['graph'],
    queryFn: fetchGraph,
    refetchInterval: 30_000,
    retry: false,
  })

  const graphAvailable = !graphError && graphData

  const topEntries = graphData?.nodes
    .filter(n => n.type === 'entry')
    .sort((a, b) => (b.queryCount ?? 0) - (a.queryCount ?? 0))
    .slice(0, 8) ?? []

  const totalQueries = graphData?.nodes
    .filter(n => n.type === 'entry')
    .reduce((sum, n) => sum + (n.queryCount ?? 0), 0) ?? 0

  const stats = [
    { label: 'TOTAL ENTRIES', value: totalCount !== undefined ? totalCount.toString() : (graphData?.entryCount.toString() ?? '—') },
    { label: 'ACTIVE AGENTS', value: graphData?.agentCount.toString() ?? '—' },
    { label: 'QUERIES SERVED', value: totalQueries > 0 ? totalQueries.toLocaleString() : '—' },
    { label: 'CHAIN', value: '0G-Galileo' },
    { label: 'REGISTRY', value: '0xaA40...8001' },
    { label: 'NETWORK', value: 'TESTNET' },
  ]

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 4 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: T.text, margin: 0, borderBottom: `1px solid ${T.border}`, paddingBottom: 6, flex: 1 }}>
          Mnemosyne Knowledge Protocol
        </h1>
      </div>
      <div style={{ fontSize: 10, color: T.muted, marginBottom: 28 }}>
        From the decentralized knowledge base — the free protocol anyone can stake
      </div>

      {graphError && (
        <ApiUnavailableBanner endpoint="GET /graph" />
      )}

      <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 13, color: T.text, lineHeight: 2, marginBottom: 24 }}>
            <strong>Mnemosyne</strong> is a decentralized, on-chain knowledge protocol built on the{' '}
            <span style={{ color: T.accent }}>0G blockchain</span>. Entries are knowledge NFTs (<em>iNFTs</em>) — staked, verified, challenged, and queried by AI agents. Every fact has a price. Every truth has a staker.
          </p>

          <div style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: T.text, borderBottom: `2px solid ${T.border}`, paddingBottom: 6, marginBottom: 16, letterSpacing: '0.04em' }}>
              Live Knowledge Graph
            </h2>
            <div style={{ position: 'relative', height: 320, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 3, overflow: 'hidden' }}>
              <KnowledgeGraphCanvas />
              <div style={{ position: 'absolute', bottom: 12, left: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {[['● Entry node', '#b45309'], ['◉ Agent node', '#d97706'], ['── cluster edge', '#c8bfb0']].map(([label, color]) => (
                  <span key={label} style={{ fontSize: 9, color, fontFamily: T.codeFont }}>{label}</span>
                ))}
              </div>
              <Link href="/explore" style={{
                position: 'absolute', top: 12, right: 12, textDecoration: 'none',
                background: T.accent, color: '#fff', borderRadius: 3,
                padding: '6px 14px', fontFamily: T.codeFont, fontSize: 9,
                letterSpacing: '0.1em',
              }}>FULL SCREEN →</Link>
              {!graphAvailable && (
                <div style={{ position: 'absolute', top: 12, left: 12, background: T.warningBg, border: `1px solid ${T.tagBorder}`, borderRadius: 3, padding: '4px 10px', fontSize: 9, color: T.warning, fontFamily: T.codeFont }}>
                  Live graph data unavailable — /graph API needed
                </div>
              )}
            </div>
          </div>

          <h2 style={{ fontSize: 14, fontWeight: 700, color: T.text, borderBottom: `2px solid ${T.border}`, paddingBottom: 6, marginBottom: 16, letterSpacing: '0.04em' }}>
            Most Queried Entries
          </h2>

          {topEntries.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {topEntries.map((entry, i) => (
                <Link key={entry.id} href={`/entry/${entry.id}`} style={{ textDecoration: 'none' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0',
                    borderBottom: `1px solid ${T.borderLight}`, cursor: 'pointer',
                  }}>
                    <span style={{ fontSize: 12, color: T.muted, width: 18, flexShrink: 0 }}>#{i + 1}</span>
                    <span style={{ fontSize: 12, color: T.accent, flex: 1 }}>
                      {entry.content ? entry.content.slice(0, 60) : entry.id.slice(0, 20) + '...'}
                    </span>
                    <Tag>{entry.domain ?? 'unknown'}</Tag>
                    <span style={{ fontSize: 10, color: T.muted, width: 60, textAlign: 'right' }}>
                      {(entry.queryCount ?? 0).toLocaleString()} q
                    </span>
                    <span style={{ fontSize: 10, color: T.muted, width: 80, textAlign: 'right' }}>
                      {entry.submittedBy ?? ''}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: T.muted, padding: '16px 0' }}>
              {graphError ? 'Entry list requires the /graph API endpoint.' : 'Loading entries...'}
            </div>
          )}
        </div>

        <div style={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ background: T.faint, padding: '8px 14px', borderBottom: `1px solid ${T.border}`, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: T.text, textAlign: 'center' }}>
              PROTOCOL STATS
            </div>
            {stats.map((s, i) => (
              <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 14px', borderBottom: i < stats.length - 1 ? `1px solid ${T.borderLight}` : 'none' }}>
                <span style={{ fontSize: 9, color: T.muted, letterSpacing: '0.06em' }}>{s.label}</span>
                <span style={{ fontSize: 11, color: T.text, fontWeight: 700 }}>{s.value}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Link href="/submit" style={{ textDecoration: 'none' }}>
              <BtnPrimary style={{ width: '100%', textAlign: 'center' }}>+ SUBMIT ENTRY</BtnPrimary>
            </Link>
            <Link href="/challenge" style={{ textDecoration: 'none' }}>
              <BtnGhost style={{ width: '100%', textAlign: 'center' }}>CHALLENGE ARENA</BtnGhost>
            </Link>
          </div>

          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 3, padding: '14px 16px' }}>
            <LiveFeed nodes={graphData?.nodes ?? []} />
          </div>
        </div>
      </div>

      <div style={{ marginTop: 40, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
        <span style={{ fontSize: 9, color: T.muted, letterSpacing: '0.1em', marginRight: 12 }}>DOMAINS:</span>
        {['Economics', 'Cryptography', 'Protocol', 'History', 'Governance', 'Science', 'Law', 'Philosophy'].map(d => (
          <span key={d} style={{ fontSize: 10, color: T.accent, marginRight: 16, cursor: 'pointer' }}>{d}</span>
        ))}
      </div>
      <div style={{ marginTop: 12, fontSize: 9, color: T.muted }}>
        Retrieved from Mnemosyne Knowledge Protocol · Chain: 0G-Galileo (16602) · Registry: 0xaA40...8001
      </div>
    </div>
  )
}
