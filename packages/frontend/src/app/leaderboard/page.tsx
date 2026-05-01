'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useReadContracts } from 'wagmi'
import { Tag } from '@/components/design-system'
import { T } from '@/components/design-system'
import { REGISTRY_ADDRESS, REGISTRY_ABI, DOMAIN_LABELS, STATUS_LABELS } from '@/lib/contracts'
import { zgTestnet } from '@/lib/chains'
import { formatA0GI, truncateAddress } from '@/lib/ens'

type EntryData = {
  id: `0x${string}`; storageRef: string; embeddingRef: string; tags: string[]
  domain: number; submitter: `0x${string}`; stakeAmount: bigint; status: number
  submittedAt: bigint; challengeWindowEnd: bigint; queryCount: bigint
  royaltiesEarned: bigint; lastQueriedAt: bigint; inftTokenId: bigint
}

export default function LeaderboardPage() {
  const [tab, setTab] = useState<'entries' | 'contributors' | 'brains'>('entries')

  const { data: countData } = useReadContracts({
    contracts: [{ address: REGISTRY_ADDRESS, abi: REGISTRY_ABI, functionName: 'getTotalEntryCount', chainId: zgTestnet.id }],
  })
  const total = countData?.[0]?.result as bigint | undefined

  const { data: idsData } = useReadContracts({
    contracts: total !== undefined ? [
      { address: REGISTRY_ADDRESS, abi: REGISTRY_ABI, functionName: 'getAllEntries', args: [0n, total > 50n ? 50n : total], chainId: zgTestnet.id },
    ] : [],
  })
  const entryIds = idsData?.[0]?.result as `0x${string}`[] | undefined

  const { data: entriesData } = useReadContracts({
    contracts: (entryIds ?? []).map(id => ({
      address: REGISTRY_ADDRESS, abi: REGISTRY_ABI,
      functionName: 'getEntry', args: [id], chainId: zgTestnet.id,
    })),
  })

  const entries: EntryData[] = (entriesData ?? [])
    .map(d => d.result as unknown as EntryData)
    .filter(Boolean)

  const byQueries = [...entries].sort((a, b) => Number(b.queryCount - a.queryCount))

  const submitterMap: Record<string, EntryData[]> = {}
  entries.forEach(e => {
    const key = e.submitter
    if (!submitterMap[key]) submitterMap[key] = []
    submitterMap[key].push(e)
  })
  const contributors = Object.entries(submitterMap)
    .map(([addr, es]) => ({
      addr: addr as `0x${string}`,
      entries: es.length,
      totalQueries: es.reduce((s, e) => s + e.queryCount, 0n),
      totalRoyalties: es.reduce((s, e) => s + e.royaltiesEarned, 0n),
      totalStaked: es.reduce((s, e) => s + e.stakeAmount, 0n),
      verifiedCount: es.filter(e => e.status === 1).length,
    }))
    .sort((a, b) => Number(b.totalQueries - a.totalQueries))

  const thStyle: React.CSSProperties = { fontSize: 9, letterSpacing: '0.12em', color: T.muted, padding: '8px 16px', textAlign: 'left', borderBottom: `2px solid ${T.border}`, whiteSpace: 'nowrap' }
  const tdStyle: React.CSSProperties = { fontSize: 11, color: T.text, padding: '11px 16px', borderBottom: `1px solid ${T.borderLight}` }

  const isLoading = total === undefined

  return (
    <div style={{ padding: '32px 40px', fontFamily: T.codeFont }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: T.text, margin: '0 0 4px', borderBottom: `1px solid ${T.border}`, paddingBottom: 6 }}>
        Leaderboard
      </h1>
      <p style={{ fontSize: 11, color: T.muted, marginBottom: 24 }}>
        The knowledge economy is alive — real usage, real stakes, real truth.
        {total !== undefined && <span> ({total.toString()} total entries on-chain)</span>}
      </p>

      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${T.border}`, marginBottom: 28 }}>
        {([
          { id: 'entries', label: 'MOST QUERIED ENTRIES' },
          { id: 'contributors', label: 'TOP CONTRIBUTORS' },
          { id: 'brains', label: 'LARGEST KNOWLEDGE BASES' },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '8px 24px',
            fontFamily: T.codeFont, fontSize: 10, letterSpacing: '0.1em',
            color: tab === t.id ? T.accent : T.muted,
            borderBottom: tab === t.id ? `2px solid ${T.accent}` : '2px solid transparent',
            marginBottom: -1,
          }}>{t.label}</button>
        ))}
      </div>

      {isLoading && <div style={{ fontSize: 11, color: T.muted }}>Loading on-chain data...</div>}

      {!isLoading && tab === 'entries' && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['#', 'ENTRY', 'QUERIES', 'ROYALTIES', 'SUBMITTER', 'DOMAIN', 'STATUS'].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {byQueries.length === 0 ? (
              <tr><td colSpan={7} style={{ ...tdStyle, textAlign: 'center', color: T.muted }}>No entries on-chain yet.</td></tr>
            ) : byQueries.map((e, i) => (
              <tr key={e.id} style={{ background: i < 3 ? T.surface : 'transparent' }}>
                <td style={{ ...tdStyle, color: i < 3 ? T.accent : T.muted, fontWeight: i < 3 ? 700 : 400 }}>{i + 1}</td>
                <td style={{ ...tdStyle, maxWidth: 260 }}>
                  <Link href={`/entry/${e.id}`} style={{ color: T.accent, textDecoration: 'none', fontSize: 11 }}>
                    {e.id.slice(0, 20)}...
                  </Link>
                </td>
                <td style={{ ...tdStyle, fontWeight: 700 }}>{e.queryCount.toLocaleString()}</td>
                <td style={{ ...tdStyle, color: T.accent }}>{formatA0GI(e.royaltiesEarned)} A0GI</td>
                <td style={{ ...tdStyle, color: T.muted }}>{truncateAddress(e.submitter)}</td>
                <td style={tdStyle}><Tag>{DOMAIN_LABELS[e.domain]}</Tag></td>
                <td style={tdStyle}><Tag variant={e.status === 1 ? 'success' : e.status === 2 ? 'danger' : 'warning'}>{STATUS_LABELS[e.status]}</Tag></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!isLoading && tab === 'contributors' && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['#', 'ADDRESS', 'ENTRIES', 'QUERIES SERVED', 'ROYALTIES', 'TOTAL STAKED'].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {contributors.length === 0 ? (
              <tr><td colSpan={6} style={{ ...tdStyle, textAlign: 'center', color: T.muted }}>No contributors found.</td></tr>
            ) : contributors.map((c, i) => (
              <tr key={c.addr} style={{ background: i < 3 ? T.surface : 'transparent' }}>
                <td style={{ ...tdStyle, color: i < 3 ? T.accent : T.muted, fontWeight: i < 3 ? 700 : 400 }}>{i + 1}</td>
                <td style={{ ...tdStyle }}>
                  <Link href={`/agent/${c.addr}`} style={{ color: T.accent, textDecoration: 'none', fontSize: 11 }}>
                    {truncateAddress(c.addr)}
                  </Link>
                </td>
                <td style={tdStyle}>{c.entries}</td>
                <td style={{ ...tdStyle, fontWeight: 700 }}>{c.totalQueries.toLocaleString()}</td>
                <td style={{ ...tdStyle, color: T.accent }}>{formatA0GI(c.totalRoyalties)} A0GI</td>
                <td style={{ ...tdStyle, color: T.accent, fontWeight: 700 }}>{formatA0GI(c.totalStaked)} A0GI</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!isLoading && tab === 'brains' && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['#', 'ADDRESS', 'ACTIVE ENTRIES', 'VERIFIED', 'TOTAL STAKED'].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {contributors.length === 0 ? (
              <tr><td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: T.muted }}>No data.</td></tr>
            ) : [...contributors].sort((a, b) => b.entries - a.entries).map((c, i) => {
              const pct = c.entries > 0 ? Math.round(c.verifiedCount / c.entries * 100) : 0
              return (
                <tr key={c.addr} style={{ background: i < 3 ? T.surface : 'transparent' }}>
                  <td style={{ ...tdStyle, color: i < 3 ? T.accent : T.muted, fontWeight: i < 3 ? 700 : 400 }}>{i + 1}</td>
                  <td style={tdStyle}>
                    <Link href={`/agent/${c.addr}`} style={{ color: T.accent, textDecoration: 'none', fontSize: 11 }}>
                      {truncateAddress(c.addr)}
                    </Link>
                  </td>
                  <td style={tdStyle}>{c.entries}</td>
                  <td style={tdStyle}>
                    {c.verifiedCount} ({pct}%){' '}
                    <span style={{ color: pct === 100 ? T.success : T.warning }}>
                      {'▉'.repeat(Math.round(pct / 20))}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, color: T.accent, fontWeight: 700 }}>{formatA0GI(c.totalStaked)} A0GI</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
