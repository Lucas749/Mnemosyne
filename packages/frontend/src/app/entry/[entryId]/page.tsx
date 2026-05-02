'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useReadContracts } from 'wagmi'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { MnemosyneForceGraph } from '@/components/force-graph'
import { Tag, WikiInfoBox, Modal, BtnPrimary, BtnGhost } from '@/components/design-system'
import { T } from '@/components/design-system'
import {
  REGISTRY_ADDRESS, REGISTRY_ABI, INFT_ADDRESS, INFT_ABI, CHALLENGE_ADDRESS, CHALLENGE_ABI,
  ROYALTY_VAULT_ADDRESS, ROYALTY_VAULT_ABI, STATUS_LABELS, STATUS_COLORS, DOMAIN_LABELS,
} from '@/lib/contracts'
import { zgTestnet } from '@/lib/chains'
import { unlockEntry } from '@/lib/api'
import { resolveAddressToEns, formatA0GI, truncateAddress } from '@/lib/ens'
import { entryEns } from '@/lib/entry-name'
import { useAccount } from 'wagmi'
import { parseEther, formatEther } from 'viem'
import { useGraphData } from '@/hooks/use-graph-data'
import { useRouter } from 'next/navigation'

export default function EntryPage() {
  const { entryId } = useParams<{ entryId: string }>()
  const { address } = useAccount()
  const router = useRouter()
  const { nodes: graphNodes, links: graphLinks } = useGraphData(20)

  const [activeTab, setActiveTab] = useState<'read' | 'history' | 'discuss' | 'onchain'>('read')
  const [showChallenge, setShowChallenge] = useState(false)
  const [content, setContent] = useState<string | null>(null)
  const [unlocking, setUnlocking] = useState(false)
  const [unlockError, setUnlockError] = useState<string | null>(null)
  const [submitterEns, setSubmitterEns] = useState<string | null>(null)
  const [challengeReason, setChallengeReason] = useState('')
  const [evidenceRef, setEvidenceRef] = useState('')
  const [countdown, setCountdown] = useState('')

  const entryIdBytes = entryId as `0x${string}`

  const { data, isLoading } = useReadContracts({
    contracts: [
      { address: REGISTRY_ADDRESS, abi: REGISTRY_ABI, functionName: 'getEntry', args: [entryIdBytes], chainId: zgTestnet.id },
    ],
  })

  const entry = data?.[0]?.result as {
    id: `0x${string}`; storageRef: string; embeddingRef: string; tags: string[]
    domain: number; submitter: `0x${string}`; stakeAmount: bigint; status: number
    submittedAt: bigint; challengeWindowEnd: bigint; queryCount: bigint
    royaltiesEarned: bigint; lastQueriedAt: bigint; inftTokenId: bigint
  } | undefined

  const { data: challengeCountData } = useReadContracts({
    contracts: entry ? [
      { address: CHALLENGE_ADDRESS, abi: CHALLENGE_ABI, functionName: 'openChallengeCount', args: [entryIdBytes], chainId: zgTestnet.id },
    ] : [],
  })

  const { data: ownerData } = useReadContracts({
    contracts: entry && entry.inftTokenId > 0n ? [
      { address: INFT_ADDRESS, abi: INFT_ABI, functionName: 'ownerOf', args: [entry.inftTokenId], chainId: zgTestnet.id },
    ] : [],
  })

  useEffect(() => {
    if (entry?.submitter) {
      resolveAddressToEns(entry.submitter).then(setSubmitterEns)
    }
  }, [entry?.submitter])

  useEffect(() => {
    if (entry && content === null && !unlocking) {
      handleUnlock()
    }
  }, [entry?.id])

  useEffect(() => {
    if (!entry) return
    const windowEnd = Number(entry.challengeWindowEnd) * 1000
    if (windowEnd < Date.now()) return

    const tick = () => {
      const remaining = windowEnd - Date.now()
      if (remaining <= 0) { setCountdown(''); return }
      const m = Math.floor(remaining / 60000)
      const s = Math.floor((remaining % 60000) / 1000)
      setCountdown(`${m}m ${s}s remaining`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [entry?.challengeWindowEnd])

  async function handleUnlock() {
    setUnlocking(true)
    setUnlockError(null)
    try {
      const result = await unlockEntry(entryId, address ?? 'anonymous')
      setContent(result.content)
      setUnlocking(false)
      return
    } catch {
      // /unlock not available, fall through to direct storage fetch
    }

    // Try GET /content/:entryId — reads storageRef from chain and fetches from 0G
    try {
      const API = process.env.NEXT_PUBLIC_API_URL ?? 'https://mnemosyne-api-production-7cd6.up.railway.app'
      const res = await fetch(`${API}/content/${entryId}`)
      if (res.ok) {
        const data = await res.json()
        setContent(data.content)
        setUnlocking(false)
        return
      }
    } catch {
      // content endpoint failed too
    }

    setUnlockError('Content stored on 0G Storage — loading failed. Storage node may be unavailable.')
    setUnlocking(false)
  }

  const tabs = [
    { id: 'read' as const, label: 'READ' },
    { id: 'history' as const, label: 'HISTORY' },
    { id: 'discuss' as const, label: 'DISCUSS' },
    { id: 'onchain' as const, label: 'ON-CHAIN' },
  ]

  const ensName = entryEns(entryId)
  const statusLabel = entry ? STATUS_LABELS[entry.status] ?? 'UNKNOWN' : '—'
  const statusColor = entry ? STATUS_COLORS[entry.status] ?? T.muted : T.muted
  const domainLabel = entry ? DOMAIN_LABELS[entry.domain] ?? 'unknown' : '—'
  const stakeFormatted = entry ? formatA0GI(entry.stakeAmount) : '—'
  const royaltiesFormatted = entry ? formatA0GI(entry.royaltiesEarned) : '—'
  const submitterDisplay = submitterEns ?? (entry ? truncateAddress(entry.submitter) : '—')
  const ownerDisplay = ownerData?.[0]?.result ? truncateAddress(ownerData[0].result as string) : '—'
  const challengeCount = challengeCountData?.[0]?.result?.toString() ?? '0'

  const infoRows: [string, React.ReactNode][] = entry ? [
    ['Name', <span key="ens" style={{ color: T.accent, fontWeight: 700 }}>{ensName}</span>],
    ['Submitted', submitterDisplay],
    ['Address', truncateAddress(entry.submitter)],
    ['Stake', `${stakeFormatted} A0GI`],
    ['Status', <span key="s" style={{ color: statusColor }}>{'✓ '}{statusLabel}</span>],
    ['Domain', domainLabel.toUpperCase()],
    ['Queries', entry.queryCount.toLocaleString()],
    ['Royalties', `${royaltiesFormatted} A0GI`],
    ['Challenges', challengeCount],
    ...(entry.inftTokenId > 0n ? [
      ['Token ID', `#${entry.inftTokenId.toString()}`] as [string, React.ReactNode],
      ['Owner', ownerDisplay] as [string, React.ReactNode],
    ] : []),
  ] : []

  const footer = countdown
    ? `Challenge window: ${countdown}`
    : entry?.status === 0
    ? 'Challenge window OPEN'
    : 'Challenge window CLOSED'

  if (isLoading) {
    return (
      <div style={{ padding: '32px 40px', fontFamily: T.codeFont }}>
        <div style={{ fontSize: 12, color: T.muted }}>Loading entry from 0G chain...</div>
      </div>
    )
  }

  if (!entry) {
    return (
      <div style={{ padding: '32px 40px', fontFamily: T.codeFont }}>
        <div style={{ fontSize: 12, color: T.danger }}>Entry not found on-chain. ID: {entryId}</div>
      </div>
    )
  }

  const titleText = content
    ? content.split('\n')[0].replace(/^#+ /, '')
    : ensName

  return (
    <div style={{ padding: '0 40px 40px', maxWidth: 1060, margin: '0 auto', fontFamily: T.codeFont }}>
      <div style={{ fontSize: 10, color: T.muted, padding: '14px 0', borderBottom: `1px solid ${T.borderLight}` }}>
        <Link href="/explore" style={{ color: T.accent, textDecoration: 'none' }}>EXPLORE</Link>
        {' → '}
        <span style={{ color: T.accent }}>{domainLabel.toUpperCase()}</span>
        {' → '}
        <span>{titleText.toUpperCase()}</span>
      </div>

      <h1 style={{ fontSize: 26, fontWeight: 700, color: T.text, margin: '20px 0 4px', lineHeight: 1.2 }}>
        {titleText}
      </h1>

      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${T.border}`, marginBottom: 28 }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '8px 18px', fontFamily: T.codeFont, fontSize: 10, letterSpacing: '0.1em',
            color: activeTab === tab.id ? T.accent : T.muted,
            borderBottom: activeTab === tab.id ? `2px solid ${T.accent}` : '2px solid transparent',
            marginBottom: -1,
          }}>{tab.label}</button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: T.muted, alignSelf: 'center', paddingBottom: 8 }}>
          by <span style={{ color: T.accent }}>{submitterDisplay}</span>
          {' · '}<Tag variant={entry.status === 1 ? 'success' : entry.status === 2 ? 'danger' : 'warning'}>{statusLabel}</Tag>
        </span>
      </div>

      {activeTab === 'read' && (
        <div style={{ display: 'flex', gap: 28 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <WikiInfoBox
              title={entry.inftTokenId > 0n ? `ENTRY — iNFT #${entry.inftTokenId}` : 'ENTRY'}
              rows={infoRows}
              footer={footer}
            />

            {content ? (
              <div className="prose-mnemosyne">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              </div>
            ) : (
              <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 3, padding: '24px', textAlign: 'center', marginBottom: 24 }}>
                {unlockError ? (
                  <>
                    <div style={{ fontSize: 11, color: T.danger, marginBottom: 12 }}>{unlockError}</div>
                    <BtnPrimary onClick={handleUnlock} disabled={unlocking}>RETRY →</BtnPrimary>
                  </>
                ) : (
                  <div style={{ fontSize: 12, color: T.muted }}>
                    {unlocking ? 'Loading content from 0G Storage...' : 'Loading...'}
                  </div>
                )}
              </div>
            )}

            <div style={{ marginTop: 28, paddingTop: 14, borderTop: `1px solid ${T.border}` }}>
              <span style={{ fontSize: 9, color: T.muted, letterSpacing: '0.1em', marginRight: 10 }}>CATEGORIES:</span>
              {entry.tags.map(t => (
                <span key={t} style={{ fontSize: 10, color: T.accent, marginRight: 12, cursor: 'pointer' }}>{t}</span>
              ))}
            </div>

            <div style={{ marginTop: 20, fontSize: 9, color: T.muted }}>
              Retrieved from Mnemosyne Knowledge Protocol · 0G-Galileo (16602)
            </div>
          </div>

          <div style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ background: T.faint, padding: '8px 14px', borderBottom: `1px solid ${T.border}`, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: T.text }}>
                ACTIONS
              </div>
              {[
                { label: 'CHALLENGE ENTRY', primary: false, action: () => setShowChallenge(true) },
                ...(entry.inftTokenId > 0n ? [
                  { label: `BUY iNFT #${entry.inftTokenId}`, primary: true, action: () => router.push('/marketplace') },
                ] : []),
                { label: 'VIEW ON 0G EXPLORER ↗', primary: false, action: () => window.open(`https://chainscan-galileo.0g.ai/address/${REGISTRY_ADDRESS}`, '_blank') },
              ].map(btn => (
                <button key={btn.label} onClick={btn.action} style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px',
                  background: btn.primary ? T.accentLight : 'none',
                  border: 'none', borderBottom: `1px solid ${T.borderLight}`,
                  fontFamily: T.codeFont, fontSize: 10, letterSpacing: '0.06em',
                  color: btn.primary ? T.accent : T.muted, cursor: 'pointer',
                }}>{btn.label}</button>
              ))}
            </div>

            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ background: T.faint, padding: '8px 14px', borderBottom: `1px solid ${T.border}`, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: T.text }}>
                DOMAIN MAP — {domainLabel.toUpperCase()}
              </div>
              <div style={{ height: 150 }}>
                <MnemosyneForceGraph
                  nodes={graphNodes.filter(n => n.type === 'agent' || n.domainIdx === entry.domain)}
                  links={graphLinks}
                  height={150}
                  mini
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'onchain' && (
        <div style={{ maxWidth: 600 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: T.text, borderBottom: `1px solid ${T.border}`, paddingBottom: 7, marginBottom: 20 }}>On-Chain Provenance</h2>
          {[
            ['Contract', 'MnemosyneRegistry'],
            ['Address', REGISTRY_ADDRESS],
            ['Chain', '0G-Galileo (16602)'],
            ['Entry ID', entryId],
            ['Submitter', `${truncateAddress(entry.submitter)}${submitterEns ? ` (${submitterEns})` : ''}`],
            ['Stake', `${stakeFormatted} A0GI`],
            ['Status', statusLabel],
            ['Domain', domainLabel],
            ['Challenge window', footer],
            ['Queries', entry.queryCount.toLocaleString()],
            ['Royalties earned', `${royaltiesFormatted} A0GI`],
            ...(entry.inftTokenId > 0n ? [['iNFT Token ID', `#${entry.inftTokenId}`]] : []),
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 24, padding: '10px 0', borderBottom: `1px solid ${T.borderLight}` }}>
              <span style={{ fontSize: 10, color: T.muted, width: 160, flexShrink: 0 }}>{k}</span>
              <span style={{ fontSize: 10, color: T.text, fontFamily: T.codeFont, wordBreak: 'break-all' }}>{v}</span>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'history' && (
        <div style={{ maxWidth: 680 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: T.text, borderBottom: `1px solid ${T.border}`, paddingBottom: 7, marginBottom: 20 }}>Edit History</h2>
          <div style={{ display: 'flex', gap: 20, padding: '12px 0', borderBottom: `1px solid ${T.borderLight}` }}>
            <span style={{ fontSize: 10, color: T.accent, width: 40 }}>v1.0</span>
            <span style={{ fontSize: 10, color: T.muted, width: 90 }}>{new Date(Number(entry.submittedAt) * 1000).toLocaleDateString()}</span>
            <span style={{ fontSize: 10, color: T.accent, width: 100 }}>{submitterDisplay}</span>
            <span style={{ fontSize: 10, color: T.text, flex: 1 }}>Initial submission</span>
          </div>
        </div>
      )}

      {activeTab === 'discuss' && (
        <div style={{ maxWidth: 680 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: T.text, borderBottom: `1px solid ${T.border}`, paddingBottom: 7, marginBottom: 20 }}>Discussion</h2>
          <p style={{ fontSize: 12, color: T.muted }}>No discussion yet. Be the first to raise a point about this entry.</p>
          <BtnGhost style={{ marginTop: 16 }}>START DISCUSSION</BtnGhost>
        </div>
      )}

      {showChallenge && (
        <Modal title="CHALLENGE THIS ENTRY" onClose={() => setShowChallenge(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, fontFamily: T.codeFont }}>
            <div style={{ background: T.faint, border: `1px solid ${T.border}`, borderRadius: 3, padding: '12px 16px', fontSize: 11, color: T.text }}>
              Entry: {entryId.slice(0, 20)}...<br />
              <span style={{ color: T.muted }}>Entry stake at risk: {stakeFormatted} A0GI</span>
            </div>
            <div>
              <div style={{ fontSize: 10, color: T.muted, marginBottom: 6, letterSpacing: '0.08em' }}>REASON</div>
              <textarea
                value={challengeReason}
                onChange={e => setChallengeReason(e.target.value)}
                placeholder="Describe why this entry is incorrect..."
                rows={3}
                style={{ width: '100%', background: T.bg, border: `1px solid ${T.border}`, borderRadius: 3, padding: '8px 12px', fontFamily: T.codeFont, fontSize: 11, color: T.text, resize: 'vertical' }}
              />
            </div>
            <div>
              <div style={{ fontSize: 10, color: T.muted, marginBottom: 6, letterSpacing: '0.08em' }}>EVIDENCE (optional 0G storage ref)</div>
              <input
                value={evidenceRef}
                onChange={e => setEvidenceRef(e.target.value)}
                placeholder="0x..."
                style={{ width: '100%', background: T.bg, border: `1px solid ${T.border}`, borderRadius: 3, padding: '8px 12px', fontFamily: T.codeFont, fontSize: 11, color: T.text }}
              />
            </div>
            <div style={{ fontSize: 10, color: T.muted, lineHeight: 1.8 }}>
              Challenge stake: 0.005 A0GI required (paid from connected wallet)<br />
              If your challenge is upheld: entry is burned, you keep the stake.<br />
              If overturned: your stake goes to the submitter.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <BtnGhost onClick={() => setShowChallenge(false)}>CANCEL</BtnGhost>
              <BtnPrimary disabled={!address || !challengeReason}>
                {address ? 'OPEN CHALLENGE →' : 'CONNECT WALLET FIRST'}
              </BtnPrimary>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
