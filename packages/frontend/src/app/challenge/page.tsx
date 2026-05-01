'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useReadContracts, useWriteContract, useAccount } from 'wagmi'
import { parseAbi, parseEther } from 'viem'
import { createPublicClient, http } from 'viem'
import { useQuery } from '@tanstack/react-query'
import { Tag, Modal, BtnPrimary, BtnGhost } from '@/components/design-system'
import { T } from '@/components/design-system'
import { CHALLENGE_ADDRESS, CHALLENGE_ABI, CHALLENGE_STATUS_LABELS } from '@/lib/contracts'
import { zgTestnet } from '@/lib/chains'

type ChallengeData = {
  id: `0x${string}`; entryId: `0x${string}`; challenger: `0x${string}`
  challengerStake: bigint; reason: string; evidenceRef: string; status: number
  validatorPanel: `0x${string}`[]; openedAt: bigint; quorumDeadline: bigint
  resolvedAt: bigint; slashedAddress: `0x${string}`; slashAmount: bigint
  upholdVotes: bigint; overturnVotes: bigint
}

const STATUS_COLOR: Record<number, string> = {
  0: T.success, 1: T.accent, 2: T.warning, 3: T.success, 4: T.danger,
}

const zgClient = createPublicClient({
  chain: zgTestnet,
  transport: http('https://evmrpc-testnet.0g.ai'),
})

async function fetchChallengeIds(): Promise<`0x${string}`[]> {
  const logs = await zgClient.getLogs({
    address: CHALLENGE_ADDRESS,
    event: parseAbi(['event ChallengeOpened(bytes32 indexed challengeId, bytes32 indexed entryId, address challenger)'])[0],
    fromBlock: 0n,
  })
  return logs.map(l => l.args.challengeId as `0x${string}`)
}

export default function ChallengePage() {
  const { address } = useAccount()
  const [activeTab, setActiveTab] = useState<'open' | 'resolved' | 'mine'>('open')
  const [selected, setSelected] = useState(0)
  const [showModal, setShowModal] = useState(false)
  const [entryInput, setEntryInput] = useState('')
  const [reason, setReason] = useState('')
  const [evidence, setEvidence] = useState('')

  const { writeContract } = useWriteContract()

  const { data: challengeIds = [] } = useQuery({
    queryKey: ['challenge-ids'],
    queryFn: fetchChallengeIds,
    retry: false,
  })

  const { data: challengeResults } = useReadContracts({
    contracts: challengeIds.slice(0, 20).map(id => ({
      address: CHALLENGE_ADDRESS,
      abi: CHALLENGE_ABI,
      functionName: 'getChallenge',
      args: [id],
      chainId: zgTestnet.id,
    })),
  })

  const challenges: ChallengeData[] = (challengeResults ?? [])
    .map(r => r.result as unknown as ChallengeData)
    .filter(Boolean)

  const openChallenges = challenges.filter(c => c.status < 3)
  const resolvedChallenges = challenges.filter(c => c.status >= 3)

  const ch = openChallenges[selected]

  function handleOpenChallenge() {
    if (!entryInput || !reason) return
    writeContract({
      address: CHALLENGE_ADDRESS,
      abi: CHALLENGE_ABI,
      functionName: 'openChallenge',
      args: [entryInput as `0x${string}`, reason, evidence],
      value: parseEther('0.005'),
      chainId: zgTestnet.id,
    })
    setShowModal(false)
  }

  return (
    <div style={{ padding: '32px 40px', fontFamily: T.codeFont }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 4 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: T.text, margin: 0, borderBottom: `1px solid ${T.border}`, paddingBottom: 6, flex: 1 }}>
          Challenge Arena
        </h1>
      </div>
      <p style={{ fontSize: 11, color: T.muted, marginBottom: 24 }}>Where bad knowledge gets destroyed. File challenges, vote, slash stakes.</p>

      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${T.border}`, marginBottom: 24 }}>
        {([
          { id: 'open', label: 'OPEN CHALLENGES' },
          { id: 'resolved', label: 'RECENTLY RESOLVED' },
          { id: 'mine', label: 'MY CHALLENGES' },
        ] as const).map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '8px 22px',
            fontFamily: T.codeFont, fontSize: 10, letterSpacing: '0.1em',
            color: activeTab === tab.id ? T.accent : T.muted,
            borderBottom: activeTab === tab.id ? `2px solid ${T.accent}` : '2px solid transparent',
            marginBottom: -1,
          }}>{tab.label}</button>
        ))}
      </div>

      {activeTab === 'open' && (
        <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start' }}>
          <div style={{ width: 360, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {openChallenges.length === 0 ? (
              <div style={{ fontSize: 11, color: T.muted, padding: '16px 0' }}>
                No open challenges found on-chain.
                {challengeIds.length === 0 && ' (No ChallengeOpened events indexed — chain may be empty)'}
              </div>
            ) : openChallenges.map((c, i) => {
              const total = Number(c.upholdVotes + c.overturnVotes)
              const upholdPct = total > 0 ? Number(c.upholdVotes) / total : 0
              return (
                <div key={c.id} onClick={() => setSelected(i)} style={{
                  background: selected === i ? T.surface : T.card,
                  border: `1px solid ${selected === i ? T.accent : T.border}`,
                  borderRadius: 4, padding: '16px 18px', cursor: 'pointer',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: STATUS_COLOR[c.status] ?? T.muted, letterSpacing: '0.1em' }}>
                      {CHALLENGE_STATUS_LABELS[c.status]}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: T.text, marginBottom: 10, lineHeight: 1.5 }}>
                    Entry: {c.entryId.slice(0, 16)}...
                  </div>
                  <div style={{ fontSize: 10, color: T.muted, marginBottom: 10 }}>
                    by {c.challenger.slice(0, 10)}...
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, height: 4, background: T.faint, borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${upholdPct * 100}%`, height: '100%', background: T.success }} />
                    </div>
                    <span style={{ fontSize: 9, color: T.success }}>↑{c.upholdVotes.toString()}</span>
                    <span style={{ fontSize: 9, color: T.danger }}>↓{c.overturnVotes.toString()}</span>
                  </div>
                </div>
              )
            })}
            <BtnGhost onClick={() => setShowModal(true)} style={{ marginTop: 8 }}>+ FILE NEW CHALLENGE</BtnGhost>
          </div>

          {ch && (
            <div style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ background: T.faint, padding: '14px 20px', borderBottom: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 9, color: T.muted, marginBottom: 2 }}>CHALLENGE {ch.id.slice(0, 20)}...</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: STATUS_COLOR[ch.status] ?? T.muted, letterSpacing: '0.08em' }}>
                  {CHALLENGE_STATUS_LABELS[ch.status]}
                </div>
              </div>
              <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div>
                  <div style={{ fontSize: 9, color: T.muted, letterSpacing: '0.1em', marginBottom: 8 }}>ENTRY BEING CHALLENGED</div>
                  <Link href={`/entry/${ch.entryId}`} style={{ textDecoration: 'none' }}>
                    <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 3, padding: '14px 16px', fontSize: 11, color: T.accent, lineHeight: 1.7, cursor: 'pointer' }}>
                      {ch.entryId}
                    </div>
                  </Link>
                </div>

                <div>
                  <div style={{ fontSize: 9, color: T.muted, letterSpacing: '0.1em', marginBottom: 6 }}>CHALLENGE REASON</div>
                  <p style={{ fontSize: 12, color: T.text, lineHeight: 1.8, margin: 0 }}>"{ch.reason}"</p>
                  {ch.evidenceRef && (
                    <div style={{ marginTop: 6, fontSize: 10, color: T.muted }}>
                      Evidence ref: <span style={{ color: T.accent }}>{ch.evidenceRef}</span>
                    </div>
                  )}
                </div>

                <div>
                  <div style={{ fontSize: 9, color: T.muted, letterSpacing: '0.1em', marginBottom: 10 }}>VALIDATOR PANEL</div>
                  {ch.validatorPanel.map(v => (
                    <div key={v} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${T.borderLight}` }}>
                      <span style={{ fontSize: 11, color: T.text }}>● {v.slice(0, 14)}...</span>
                      <span style={{ fontSize: 10, color: T.muted, letterSpacing: '0.06em' }}>awaiting</span>
                    </div>
                  ))}
                </div>

                <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 3, padding: '12px 16px' }}>
                  <div style={{ fontSize: 9, color: T.muted, letterSpacing: '0.1em', marginBottom: 8 }}>RESOLUTION</div>
                  <div style={{ fontSize: 10, color: T.text, lineHeight: 1.9 }}>
                    If <span style={{ color: T.success }}>UPHELD</span>: challenger loses stake → submitter<br />
                    If <span style={{ color: T.danger }}>OVERTURNED</span>: submitter loses stake → challenger, entry burned, iNFT destroyed
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                  <button style={{ flex: 1, background: T.successBg, border: `1px solid ${T.success}`, borderRadius: 3, padding: '11px', fontFamily: T.codeFont, fontSize: 10, color: T.success, cursor: 'pointer', letterSpacing: '0.08em' }}>
                    CAST VOTE: UPHOLD ↑
                  </button>
                  <button style={{ flex: 1, background: T.dangerBg, border: `1px solid ${T.danger}`, borderRadius: 3, padding: '11px', fontFamily: T.codeFont, fontSize: 10, color: T.danger, cursor: 'pointer', letterSpacing: '0.08em' }}>
                    CAST VOTE: OVERTURN ↓
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'resolved' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 680 }}>
          {resolvedChallenges.length === 0 ? (
            <div style={{ fontSize: 11, color: T.muted }}>No resolved challenges yet.</div>
          ) : resolvedChallenges.map(c => (
            <div key={c.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, padding: '16px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: c.status === 3 ? T.success : T.danger, letterSpacing: '0.08em' }}>
                  {c.status === 3 ? '✓ UPHELD' : '✗ OVERTURNED — ENTRY BURNED'}
                </span>
              </div>
              <div style={{ fontSize: 12, color: T.text, marginBottom: 10 }}>Entry: {c.entryId.slice(0, 20)}...</div>
              <div style={{ fontSize: 10, color: T.muted }}>Reason: {c.reason}</div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'mine' && (
        <div style={{ maxWidth: 680 }}>
          {address ? (
            <div style={{ fontSize: 11, color: T.muted }}>
              Challenges filed by {address.slice(0, 10)}... will appear here.
            </div>
          ) : (
            <>
              <div style={{ background: T.warningBg, border: `1px solid ${T.tagBorder}`, borderRadius: 3, padding: '12px 18px', marginBottom: 20, fontSize: 11, color: T.warning }}>
                ⚠ Connect your wallet to view your challenges.
              </div>
              <BtnPrimary>CONNECT WALLET</BtnPrimary>
            </>
          )}
        </div>
      )}

      {showModal && (
        <Modal title="CHALLENGE AN ENTRY" onClose={() => setShowModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontFamily: T.codeFont }}>
            <div>
              <div style={{ fontSize: 10, color: T.muted, marginBottom: 6 }}>ENTRY ID</div>
              <input
                value={entryInput}
                onChange={e => setEntryInput(e.target.value)}
                placeholder="0x..."
                style={{ width: '100%', background: T.bg, border: `1px solid ${T.border}`, borderRadius: 3, padding: '8px 12px', fontFamily: T.codeFont, fontSize: 11, color: T.text }}
              />
            </div>
            <div>
              <div style={{ fontSize: 10, color: T.muted, marginBottom: 6 }}>REASON</div>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={3}
                style={{ width: '100%', background: T.bg, border: `1px solid ${T.border}`, borderRadius: 3, padding: '8px 12px', fontFamily: T.codeFont, fontSize: 11, color: T.text, resize: 'vertical' }}
              />
            </div>
            <div>
              <div style={{ fontSize: 10, color: T.muted, marginBottom: 6 }}>EVIDENCE (0G storage ref, optional)</div>
              <input
                value={evidence}
                onChange={e => setEvidence(e.target.value)}
                placeholder="0x..."
                style={{ width: '100%', background: T.bg, border: `1px solid ${T.border}`, borderRadius: 3, padding: '8px 12px', fontFamily: T.codeFont, fontSize: 11, color: T.text }}
              />
            </div>
            <div style={{ fontSize: 10, color: T.muted }}>
              Stake required: 0.005 A0GI (from your wallet on 0G-Galileo)
            </div>
            {!address && (
              <div style={{ fontSize: 11, color: T.danger }}>Connect your wallet to file a challenge.</div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <BtnGhost onClick={() => setShowModal(false)}>CANCEL</BtnGhost>
              <BtnPrimary onClick={handleOpenChallenge} disabled={!address || !entryInput || !reason}>
                OPEN CHALLENGE →
              </BtnPrimary>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
