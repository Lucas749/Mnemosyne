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

  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const [dbData, setDbData] = useState<{
    content: string; tags: string[]; domain: string | null; submittedBy: string | null;
  } | null>(null)
  const [dbLoading, setDbLoading] = useState(false)

  const [activeTab, setActiveTab] = useState<'read' | 'history' | 'discuss' | 'onchain'>('read')
  const [showChallenge, setShowChallenge] = useState(false)
  const [content, setContent] = useState<string | null>(null)
  const [unlocking, setUnlocking] = useState(false)
  const [unlockError, setUnlockError] = useState<string | null>(null)
  const [submitterEns, setSubmitterEns] = useState<string | null>(null)
  const [challengeReason, setChallengeReason] = useState('')
  const [evidenceRef, setEvidenceRef] = useState('')
  const [countdown, setCountdown] = useState('')

  // Discussion state
  const [discussions, setDiscussions] = useState<{id: number; author: string; content: string; created_at: number}[]>([])
  const [discussLoading, setDiscussLoading] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [postingComment, setPostingComment] = useState(false)

  const API = process.env.NEXT_PUBLIC_API_URL ?? 'https://mnemosyne-api-production-7cd6.up.railway.app'

  useEffect(() => {
    if (activeTab !== 'discuss') return
    setDiscussLoading(true)
    fetch(`${API}/discussions/${entryId}`)
      .then(r => r.json())
      .then(setDiscussions)
      .catch(() => {})
      .finally(() => setDiscussLoading(false))
  }, [activeTab, entryId])

  async function handlePostComment() {
    if (!newComment.trim()) return
    const author = submitterEns ?? address ?? 'anonymous'
    setPostingComment(true)
    try {
      const res = await fetch(`${API}/discussions/${entryId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author, content: newComment.trim() }),
      })
      if (res.ok) {
        const d = await res.json()
        setDiscussions(prev => [...prev, d])
        setNewComment('')
      }
    } finally {
      setPostingComment(false)
    }
  }

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

  // When chain returns nothing, try the API DB as fallback
  useEffect(() => {
    if (!mounted || isLoading || entry) return
    setDbLoading(true)
    fetch(`${API}/content/${entryId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.content) {
          setDbData(data)
          setContent(data.content)
        }
      })
      .catch(() => {})
      .finally(() => setDbLoading(false))
  }, [mounted, isLoading, entry])

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
  const submitterEnsUrl = submitterEns ? `https://sepolia.app.ens.domains/${submitterEns}` : null

  // Prefer on-chain data; fall back to DB data when chain entry is missing
  const displayStatus  = entry?.status ?? 0
  const displayDomain  = entry ? (DOMAIN_LABELS[entry.domain] ?? 'unknown') : (dbData?.domain ?? 'unknown')
  const statusLabel    = STATUS_LABELS[displayStatus] ?? 'PENDING'
  const statusColor    = STATUS_COLORS[displayStatus] ?? T.muted
  const stakeFormatted = entry ? formatA0GI(entry.stakeAmount) : '—'
  const royaltiesFormatted = entry ? formatA0GI(entry.royaltiesEarned) : '—'
  const submitterRaw   = entry?.submitter ?? null
  const submitterDisplay = submitterEns ?? (submitterRaw ? truncateAddress(submitterRaw) : (dbData?.submittedBy ?? '—'))
  const ownerDisplay   = ownerData?.[0]?.result ? truncateAddress(ownerData[0].result as string) : '—'
  const challengeCount = challengeCountData?.[0]?.result?.toString() ?? '0'
  const hasChainData   = !!entry

  const infoRows: [string, React.ReactNode][] = [
    ['Name', <span key="ens" style={{ color: T.accent, fontWeight: 700 }}>{ensName}</span>],
    ['Submitted', submitterEnsUrl
      ? <a key="sub" href={submitterEnsUrl} target="_blank" rel="noopener noreferrer" style={{ color: T.accent, textDecoration: 'none' }}>{submitterDisplay} ↗</a>
      : submitterDisplay],
    ...(submitterRaw ? [['Address', truncateAddress(submitterRaw)] as [string, React.ReactNode]] : []),
    ...(hasChainData ? [
      ['Stake', `${stakeFormatted} A0GI`] as [string, React.ReactNode],
    ] : []),
    ['Status', <span key="s" style={{ color: statusColor }}>{'✓ '}{statusLabel}</span>],
    ['Domain', displayDomain.toUpperCase()],
    ...(hasChainData ? [
      ['Queries', entry!.queryCount.toLocaleString()] as [string, React.ReactNode],
      ['Royalties', `${royaltiesFormatted} A0GI`] as [string, React.ReactNode],
      ['Challenges', challengeCount] as [string, React.ReactNode],
    ] : []),
    ...(entry && entry.inftTokenId > 0n ? [
      ['Token ID', `#${entry.inftTokenId.toString()}`] as [string, React.ReactNode],
      ['Owner', ownerDisplay] as [string, React.ReactNode],
    ] : []),
  ]

  const footer = countdown
    ? `Challenge window: ${countdown}`
    : displayStatus === 0
    ? 'Challenge window OPEN'
    : 'Challenge window CLOSED'

  if (!mounted || isLoading || (dbLoading && !dbData)) {
    return (
      <div style={{ padding: '32px 40px', fontFamily: T.codeFont }}>
        <div style={{ fontSize: 12, color: T.muted }}>Loading entry...</div>
      </div>
    )
  }

  if (!entry && !dbData) {
    return (
      <div style={{ padding: '32px 40px', fontFamily: T.codeFont }}>
        <div style={{ fontSize: 12, color: T.danger }}>Entry not found. ID: {entryId}</div>
      </div>
    )
  }

  // Build a synthetic entry from DB when chain lookup fails
  const effectiveTags   = entry?.tags ?? dbData?.tags ?? []
  const effectiveDomain = dbData?.domain ?? null
  const effectiveStatus = entry?.status ?? 0

  const titleText = content
    ? content.split('\n')[0].replace(/^#+ /, '')
    : ensName

  return (
    <div style={{ padding: '0 40px 40px', maxWidth: 1060, margin: '0 auto', fontFamily: T.codeFont }}>
      <div style={{ fontSize: 10, color: T.muted, padding: '14px 0', borderBottom: `1px solid ${T.borderLight}` }}>
        <Link href="/explore" style={{ color: T.accent, textDecoration: 'none' }}>EXPLORE</Link>
        {' → '}
        <span style={{ color: T.accent }}>{displayDomain.toUpperCase()}</span>
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
          by {submitterEnsUrl
            ? <a href={submitterEnsUrl} target="_blank" rel="noopener noreferrer" style={{ color: T.accent, textDecoration: 'none' }}>{submitterDisplay} ↗</a>
            : <span style={{ color: T.accent }}>{submitterDisplay}</span>}
          {' · '}<Tag variant={displayStatus === 1 ? 'success' : displayStatus === 2 ? 'danger' : 'warning'}>{statusLabel}</Tag>
        </span>
      </div>

      {activeTab === 'read' && (
        <div style={{ display: 'flex', gap: 28 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <WikiInfoBox
              title={entry && entry.inftTokenId > 0n ? `ENTRY — iNFT #${entry.inftTokenId}` : 'ENTRY'}
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
              {(entry?.tags ?? dbData?.tags ?? []).map(t => (
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
                ...(entry && entry.inftTokenId > 0n ? [
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
                DOMAIN MAP — {displayDomain.toUpperCase()}
              </div>
              <div style={{ height: 150 }}>
                <MnemosyneForceGraph
                  nodes={graphNodes.filter(n => n.type === 'agent' || (entry && n.domainIdx === entry.domain))}
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
            ['Submitter', entry ? `${truncateAddress(entry.submitter)}${submitterEns ? ` (${submitterEns})` : ''}` : (dbData?.submittedBy ?? '—')],
            ['Stake', `${stakeFormatted} A0GI`],
            ['Status', statusLabel],
            ['Domain', displayDomain],
            ['Challenge window', footer],
            ['Queries', entry?.queryCount.toLocaleString() ?? '—'],
            ['Royalties earned', `${royaltiesFormatted} A0GI`],
            ...(entry && entry.inftTokenId > 0n ? [['iNFT Token ID', `#${entry.inftTokenId}`]] : []),
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
            <span style={{ fontSize: 10, color: T.muted, width: 90 }}>{entry ? new Date(Number(entry.submittedAt) * 1000).toLocaleDateString() : '—'}</span>
            <span style={{ fontSize: 10, color: T.accent, width: 100 }}>{submitterDisplay}</span>
            <span style={{ fontSize: 10, color: T.text, flex: 1 }}>Initial submission</span>
          </div>
        </div>
      )}

      {activeTab === 'discuss' && (
        <div style={{ maxWidth: 680 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: T.text, borderBottom: `1px solid ${T.border}`, paddingBottom: 7, marginBottom: 20 }}>Discussion</h2>

          {discussLoading ? (
            <p style={{ fontSize: 12, color: T.muted }}>Loading...</p>
          ) : discussions.length === 0 ? (
            <p style={{ fontSize: 12, color: T.muted }}>No discussion yet. Be the first to raise a point about this entry.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
              {discussions.map(d => (
                <div key={d.id} style={{ borderLeft: `3px solid ${T.border}`, paddingLeft: 16 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: T.accent }}>{d.author}</span>
                    <span style={{ fontSize: 9, color: T.muted }}>{new Date(d.created_at).toLocaleString()}</span>
                  </div>
                  <p style={{ fontSize: 12, color: T.text, margin: 0, lineHeight: 1.6 }}>{d.content}</p>
                </div>
              ))}
            </div>
          )}

          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 20, marginTop: 8 }}>
            <div style={{ fontSize: 10, color: T.muted, marginBottom: 8, letterSpacing: '0.08em' }}>
              POSTING AS: <span style={{ color: T.accent }}>{submitterEns ?? (address ? truncateAddress(address) : 'anonymous')}</span>
            </div>
            <textarea
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              placeholder="Share a thought, correction, or reference..."
              rows={4}
              style={{ width: '100%', background: T.bg, border: `1px solid ${T.border}`, borderRadius: 3, padding: '10px 12px', fontFamily: T.codeFont, fontSize: 12, color: T.text, boxSizing: 'border-box', resize: 'vertical' }}
            />
            <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
              <BtnPrimary onClick={handlePostComment} disabled={postingComment || !newComment.trim()}>
                {postingComment ? 'POSTING...' : 'POST →'}
              </BtnPrimary>
            </div>
          </div>
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
