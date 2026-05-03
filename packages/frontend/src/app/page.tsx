'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { MnemosyneForceGraph } from '@/components/force-graph'
import { Tag, BtnPrimary } from '@/components/design-system'
import { T } from '@/components/design-system'
import { useGraphData } from '@/hooks/use-graph-data'


const API = process.env.NEXT_PUBLIC_API_URL ?? 'https://mnemosyne-api-production-7cd6.up.railway.app'

type DbEntry = { entryId: string; content: string; tags: string[]; domain: string | null }

export default function HomePage() {
  const { nodes, links, loading } = useGraphData(60)
  const [dbEntries, setDbEntries] = useState<DbEntry[]>([])
  const [apiLoading, setApiLoading] = useState(true)

  useEffect(() => {
    fetch(`${API}/entries`)
      .then(r => r.json())
      .then((data: DbEntry[]) => {
        setDbEntries(data.filter(e => e.content))
        setApiLoading(false)
      })
      .catch(() => setApiLoading(false))
  }, [])

  const stats = [
    { label: 'TOTAL ENTRIES', value: apiLoading ? '—' : dbEntries.length.toString() },
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
              <MnemosyneForceGraph nodes={nodes} links={links} height={320} mini />
              <div style={{ position: 'absolute', bottom: 12, left: 12, display: 'flex', gap: 12, flexWrap: 'wrap', pointerEvents: 'none' }}>
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
              {loading && nodes.length === 0 && (
                <div style={{ position: 'absolute', top: 12, left: 12, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 3, padding: '4px 10px', fontSize: 9, color: T.muted, fontFamily: T.codeFont }}>
                  Loading on-chain data...
                </div>
              )}
            </div>
          </div>

          <h2 style={{ fontSize: 14, fontWeight: 700, color: T.text, borderBottom: `2px solid ${T.border}`, paddingBottom: 6, marginBottom: 16, letterSpacing: '0.04em' }}>
            Knowledge Entries
          </h2>

          {dbEntries.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {dbEntries.slice(0, 8).map((entry, i) => {
                const title = entry.content.split('\n')[0].replace(/^#+ /, '') || entry.entryId.slice(0, 16) + '...'
                return (
                  <Link key={entry.entryId} href={`/entry/${entry.entryId}`} style={{ textDecoration: 'none' }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0',
                      borderBottom: `1px solid ${T.borderLight}`, cursor: 'pointer',
                    }}>
                      <span style={{ fontSize: 12, color: T.muted, width: 18, flexShrink: 0 }}>#{i + 1}</span>
                      <span style={{ fontSize: 12, color: T.accent, flex: 1 }}>{title}</span>
                      <Tag>{entry.domain ?? 'unknown'}</Tag>
                    </div>
                  </Link>
                )
              })}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: T.muted, padding: '16px 0' }}>
              {apiLoading ? 'Loading entries...' : 'No entries found.'}
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
          </div>
        </div>
      </div>

      <div style={{ marginTop: 40, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
        <span style={{ fontSize: 9, color: T.muted, letterSpacing: '0.1em', marginRight: 12 }}>DOMAINS:</span>
        {['Economics', 'Cryptography', 'Architecture', 'AI / ML', 'Blockchain', 'Protocol', 'Governance'].map(d => (
          <Link key={d} href={`/explore?tag=${d.split(' ')[0].toUpperCase()}`} style={{ fontSize: 10, color: T.accent, marginRight: 16, textDecoration: 'none' }}>{d}</Link>
        ))}
      </div>
      <div style={{ marginTop: 12, fontSize: 9, color: T.muted }}>
        Retrieved from Mnemosyne Knowledge Protocol · Chain: 0G-Galileo (16602) · Registry: 0xaA40...8001
      </div>
    </div>
  )
}
