'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useReadContracts } from 'wagmi'
import { Tag, WikiInfoBox, BtnPrimary, BtnGhost } from '@/components/design-system'
import { T } from '@/components/design-system'
import { KnowledgeGraphCanvas } from '@/components/knowledge-graph'
import {
  REGISTRY_ADDRESS, REGISTRY_ABI, ROYALTY_VAULT_ADDRESS, ROYALTY_VAULT_ABI,
  STATUS_LABELS, DOMAIN_LABELS,
} from '@/lib/contracts'
import { zgTestnet } from '@/lib/chains'
import { resolveEnsAddress, resolveAddressToEns, getEnsText, formatA0GI, truncateAddress } from '@/lib/ens'
import { loadFromEns } from '@/lib/api'

type EntryData = {
  id: `0x${string}`; storageRef: string; embeddingRef: string; tags: string[]
  domain: number; submitter: `0x${string}`; stakeAmount: bigint; status: number
  submittedAt: bigint; challengeWindowEnd: bigint; queryCount: bigint
  royaltiesEarned: bigint; lastQueriedAt: bigint; inftTokenId: bigint
}

export default function AgentPage() {
  const { ensName } = useParams<{ ensName: string }>()
  const decodedEns = decodeURIComponent(ensName)

  const [tab, setTab] = useState<'entries' | 'activity' | 'nfts'>('entries')
  const [address, setAddress] = useState<`0x${string}` | null>(null)
  const [memoryIndex, setMemoryIndex] = useState<string | null>(null)
  const [paymentToken, setPaymentToken] = useState<string | null>(null)
  const [loadStatus, setLoadStatus] = useState<string | null>(null)
  const [resolving, setResolving] = useState(true)

  useEffect(() => {
    async function resolve() {
      setResolving(true)
      const [addr, mi, pt] = await Promise.all([
        resolveEnsAddress(decodedEns),
        getEnsText(decodedEns, 'memory.index'),
        getEnsText(decodedEns, 'payment.token'),
      ])
      setAddress(addr)
      setMemoryIndex(mi)
      setPaymentToken(pt)
      setResolving(false)
    }
    resolve()
  }, [decodedEns])

  const { data: profileData } = useReadContracts({
    contracts: address ? [
      { address: REGISTRY_ADDRESS, abi: REGISTRY_ABI, functionName: 'getProfile', args: [address], chainId: zgTestnet.id },
      { address: REGISTRY_ADDRESS, abi: REGISTRY_ABI, functionName: 'getSubmitterEntries', args: [address], chainId: zgTestnet.id },
      { address: ROYALTY_VAULT_ADDRESS, abi: ROYALTY_VAULT_ABI, functionName: 'claimable', args: [address], chainId: zgTestnet.id },
    ] : [],
  })

  const profile = profileData?.[0]?.result as { paymentToken: string; ensName: string; totalEntries: bigint; totalQueries: bigint; totalRoyalties: bigint } | undefined
  const entryIds = profileData?.[1]?.result as `0x${string}`[] | undefined
  const claimable = profileData?.[2]?.result as bigint | undefined

  const { data: entriesData } = useReadContracts({
    contracts: (entryIds ?? []).slice(0, 20).map(id => ({
      address: REGISTRY_ADDRESS, abi: REGISTRY_ABI,
      functionName: 'getEntry', args: [id], chainId: zgTestnet.id,
    })),
  })

  const entries: EntryData[] = (entriesData ?? [])
    .map(d => d.result as unknown as EntryData)
    .filter(Boolean)

  const totalStaked = entries.reduce((sum, e) => sum + e.stakeAmount, 0n)
  const verifiedCount = entries.filter(e => e.status === 1).length

  async function handleLoadMemory() {
    setLoadStatus('loading...')
    try {
      const result = await loadFromEns(decodedEns)
      setLoadStatus(`Loaded ${result.loaded}/${result.total} entries`)
    } catch (e: unknown) {
      const err = e as { message?: string }
      setLoadStatus(`Error: ${err.message}`)
    }
  }

  if (resolving) {
    return (
      <div style={{ padding: '32px 40px', fontFamily: T.codeFont }}>
        <div style={{ fontSize: 12, color: T.muted }}>Resolving {decodedEns} on Sepolia...</div>
      </div>
    )
  }

  if (!address) {
    return (
      <div style={{ padding: '32px 40px', fontFamily: T.codeFont }}>
        <div style={{ fontSize: 12, color: T.danger }}>
          ENS name "{decodedEns}" could not be resolved on Sepolia testnet.
        </div>
      </div>
    )
  }

  const infoRows: [string, React.ReactNode][] = [
    ['Entries', profile?.totalEntries.toString() ?? entries.length.toString()],
    ['Verified', `${verifiedCount}/${entries.length} (${entries.length > 0 ? Math.round(verifiedCount / entries.length * 100) : 0}%)`],
    ['Total staked', `${formatA0GI(totalStaked)} A0GI`],
    ['Queries served', profile?.totalQueries.toLocaleString() ?? '—'],
    ['Royalties', `${formatA0GI(profile?.totalRoyalties ?? 0n)} A0GI`],
    ['Claimable', `${formatA0GI(claimable ?? 0n)} A0GI`],
    ['Chain', '0G-Galileo'],
    ...(memoryIndex ? [['memory.index', memoryIndex.slice(0, 16) + '...']] as [string, React.ReactNode][] : []),
    ...(paymentToken ? [['payment.token', paymentToken]] as [string, React.ReactNode][] : []),
  ]

  return (
    <div style={{ padding: '32px 40px', fontFamily: T.codeFont }}>
      <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start', marginBottom: 28 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: T.muted, marginBottom: 8, letterSpacing: '0.08em' }}>AGENT PROFILE</div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: T.text, margin: '0 0 6px', borderBottom: `1px solid ${T.border}`, paddingBottom: 8 }}>
            {decodedEns}
          </h1>
          <div style={{ fontSize: 11, color: T.muted }}>
            {truncateAddress(address)} · 0G-Galileo · {entries.length} entries
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 12, color: T.text, lineHeight: 2, marginBottom: 24 }}>
            <strong>{decodedEns}</strong> is a knowledge contributor on the Mnemosyne Protocol with {entries.length} entries.
            Their knowledge base has served {profile?.totalQueries.toLocaleString() ?? '—'} queries and earned {formatA0GI(profile?.totalRoyalties ?? 0n)} A0GI in royalties.
          </p>

          <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${T.border}`, marginBottom: 24 }}>
            {([
              { id: 'entries', label: 'AUTHORED ENTRIES' },
              { id: 'activity', label: 'ACTIVITY' },
              { id: 'nfts', label: 'iNFTs OWNED' },
            ] as const).map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '8px 20px',
                fontFamily: T.codeFont, fontSize: 10, letterSpacing: '0.1em',
                color: tab === t.id ? T.accent : T.muted,
                borderBottom: tab === t.id ? `2px solid ${T.accent}` : '2px solid transparent',
                marginBottom: -1,
              }}>{t.label}</button>
            ))}
          </div>

          {tab === 'entries' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {entries.length === 0 ? (
                <div style={{ fontSize: 11, color: T.muted, padding: '16px 0' }}>No on-chain entries found for this agent.</div>
              ) : entries.map(e => (
                <Link key={e.id} href={`/entry/${e.id}`} style={{ textDecoration: 'none' }}>
                  <div style={{ display: 'flex', gap: 16, padding: '14px 0', borderBottom: `1px solid ${T.borderLight}`, cursor: 'pointer', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: T.accent, marginBottom: 6 }}>
                        {e.id.slice(0, 20)}...
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {e.tags.slice(0, 3).map(tag => <Tag key={tag}>{tag}</Tag>)}
                        <Tag variant="ghost">{DOMAIN_LABELS[e.domain]}</Tag>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 11, color: T.text, fontWeight: 700, marginBottom: 4 }}>{formatA0GI(e.stakeAmount)} A0GI</div>
                      <div style={{ fontSize: 9, color: T.muted }}>{e.queryCount.toLocaleString()} queries</div>
                    </div>
                    <div style={{ width: 90, textAlign: 'right' }}>
                      <Tag variant={e.status === 1 ? 'success' : e.status === 2 ? 'danger' : 'warning'}>
                        {STATUS_LABELS[e.status]}
                      </Tag>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {tab === 'activity' && (
            <div style={{ fontSize: 11, color: T.muted, padding: '16px 0' }}>
              Activity feed requires event indexing. Submit entries and queries to see activity.
            </div>
          )}

          {tab === 'nfts' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              {entries.filter(e => e.inftTokenId > 0n).map(e => (
                <div key={e.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, padding: '14px 16px' }}>
                  <div style={{ fontSize: 9, color: T.muted, marginBottom: 6 }}>iNFT #{e.inftTokenId.toString()}</div>
                  <div style={{ fontSize: 11, color: T.text, marginBottom: 10, lineHeight: 1.5 }}>
                    {e.id.slice(0, 20)}...
                  </div>
                  <div style={{ fontSize: 10, color: T.accent, fontWeight: 700 }}>{formatA0GI(e.stakeAmount)} A0GI staked</div>
                </div>
              ))}
              {entries.filter(e => e.inftTokenId > 0n).length === 0 && (
                <div style={{ fontSize: 11, color: T.muted }}>No minted iNFTs yet.</div>
              )}
            </div>
          )}
        </div>

        <div style={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <WikiInfoBox title="AGENT STATS" rows={infoRows} />

          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ background: T.faint, padding: '8px 14px', borderBottom: `1px solid ${T.border}`, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: T.text }}>
              CONTRIBUTION GRAPH
            </div>
            <div style={{ height: 140 }}>
              <KnowledgeGraphCanvas mini={true} />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <BtnPrimary onClick={handleLoadMemory} style={{ width: '100%', textAlign: 'center' }}>
              {loadStatus ?? 'LOAD MEMORY →'}
            </BtnPrimary>
            <Link href="/marketplace" style={{ textDecoration: 'none' }}>
              <BtnGhost style={{ width: '100%', textAlign: 'center' }}>VIEW iNFTs</BtnGhost>
            </Link>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 32, paddingTop: 14, borderTop: `1px solid ${T.border}`, fontSize: 9, color: T.muted }}>
        Retrieved from Mnemosyne Knowledge Protocol · Agent: {truncateAddress(address)} · ENS: {decodedEns}
      </div>
    </div>
  )
}
