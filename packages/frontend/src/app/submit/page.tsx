'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useChainId, useSwitchChain } from 'wagmi'
import { Tag, BtnPrimary, BtnGhost } from '@/components/design-system'
import { T } from '@/components/design-system'
import { prepareEntry, confirmEntry, pollJob, type PrepareResult } from '@/lib/api'
import { resolveAddressToEns, truncateAddress } from '@/lib/ens'
import { zgTestnet } from '@/lib/chains'

const REGISTRY_ABI = [
  {
    name: 'submit', type: 'function', stateMutability: 'payable',
    inputs: [
      { name: 'storageRef', type: 'string' },
      { name: 'embeddingRef', type: 'string' },
      { name: 'tags', type: 'string[]' },
      { name: 'domain', type: 'uint8' },
    ],
    outputs: [{ type: 'bytes32' }],
  },
] as const

const STEPS = [
  { key: 'uploading', label: 'uploading to 0G storage...' },
  { key: 'signing',   label: 'sign on-chain stake in wallet...' },
  { key: 'confirming', label: 'waiting for tx confirmation...' },
  { key: 'indexing',  label: 'indexing entry...' },
]
const STEP_IDX: Record<string, number> = { uploading: 0, signing: 1, confirming: 2, indexing: 3, done: 4 }

const DOMAIN_SUGGESTIONS = ['ECONOMICS', 'CRYPTOGRAPHY', 'ARCHITECTURE', 'AI', 'BLOCKCHAIN', 'PROTOCOL', 'GOVERNANCE', 'HISTORY', 'SCIENCE']

export default function SubmitPage() {
  const router = useRouter()
  const { address } = useAccount()
  const { writeContractAsync } = useWriteContract()
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [domain, setDomain] = useState('factual')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash, chainId: zgTestnet.id })

  const fullContent = title ? `# ${title}\n\n${content}` : content

  async function handleSubmit() {
    if (!address) { setError('Connect your wallet first'); return }
    setError(null)
    setProgress('uploading')

    try {
      const submittedBy = (await resolveAddressToEns(address)) ?? address

      // Phase 1: upload to 0G storage
      const jobId = await prepareEntry({ content: fullContent, domain, tags, submittedBy })
      const prepared = await pollJob<PrepareResult>(jobId)

      // Phase 2: ensure correct network, then user signs the on-chain stake tx
      setProgress('signing')
      if (chainId !== zgTestnet.id) await switchChainAsync({ chainId: zgTestnet.id })
      const hash = await writeContractAsync({
        address: prepared.registryAddress,
        abi: REGISTRY_ABI,
        functionName: 'submit',
        args: [prepared.storageRef, prepared.embeddingRef, tags, prepared.domainIndex],
        value: BigInt(prepared.stakeWei),
        gas: 800_000n,
        chainId: zgTestnet.id,
      })
      setTxHash(hash)

      // Phase 3: wait for tx confirmation (tracked by useWaitForTransactionReceipt above)
      setProgress('confirming')

      // Phase 4: index the confirmed tx
      setProgress('indexing')
      const { entryId } = await confirmEntry({
        txHash: hash,
        storageRef: prepared.storageRef,
        embeddingRef: prepared.embeddingRef,
        encryptionKeyId: prepared.encryptionKeyId,
        content: fullContent,
        domain,
        tags,
        submittedBy,
        attributionWallet: address,
      })

      setProgress('done')
      setTimeout(() => router.push(`/entry/${entryId}`), 1200)
    } catch (e: unknown) {
      const err = e as { message?: string; shortMessage?: string }
      setError(err.shortMessage ?? err.message ?? 'Submission failed')
      setProgress(null)
    }
  }

  function addTag() {
    const t = tagInput.trim().toUpperCase()
    if (t && !tags.includes(t)) setTags(prev => [...prev, t])
    setTagInput('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 52px)', fontFamily: T.codeFont }}>
      {/* Sub-header */}
      <div style={{ padding: '16px 40px', borderBottom: `1px solid ${T.border}`, background: T.surface, display: 'flex', alignItems: 'center', gap: 20, flexShrink: 0 }}>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 18, fontWeight: 700, fontFamily: T.codeFont, color: T.text }}
          placeholder="Entry title..."
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 9, color: T.muted, letterSpacing: '0.1em' }}>DOMAIN</span>
          <input
            list="domain-suggestions"
            value={domain}
            onChange={e => setDomain(e.target.value.toUpperCase())}
            placeholder="e.g. ECONOMICS"
            style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 3, padding: '5px 10px', fontFamily: T.codeFont, fontSize: 10, color: T.text, width: 140 }}
          />
          <datalist id="domain-suggestions">
            {DOMAIN_SUGGESTIONS.map(d => <option key={d} value={d} />)}
          </datalist>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {tags.map(tag => (
            <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Tag>{tag}</Tag>
              <button onClick={() => setTags(prev => prev.filter(t => t !== tag))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.muted, fontSize: 12, padding: 0, lineHeight: 1 }}>×</button>
            </span>
          ))}
          <input
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
            placeholder="+ tag"
            style={{ background: 'none', border: 'none', outline: 'none', fontSize: 12, color: T.muted, fontFamily: T.codeFont, width: 60 }}
          />
        </div>
      </div>

      {/* Editor */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: `1px solid ${T.border}` }}>
          <div style={{ padding: '10px 20px', borderBottom: `1px solid ${T.border}`, background: T.faint, fontSize: 9, letterSpacing: '0.12em', color: T.muted }}>
            MARKDOWN SOURCE
          </div>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Write your knowledge entry in Markdown..."
            style={{ flex: 1, background: T.surface, border: 'none', outline: 'none', padding: '20px 24px', fontFamily: T.codeFont, fontSize: 11, color: T.text, lineHeight: 1.9, resize: 'none' }}
          />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: `1px solid ${T.border}` }}>
          <div style={{ padding: '10px 20px', borderBottom: `1px solid ${T.border}`, background: T.faint, fontSize: 9, letterSpacing: '0.12em', color: T.muted }}>
            RENDERED PREVIEW
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }} className="prose-mnemosyne">
            {fullContent.trim() ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{fullContent}</ReactMarkdown>
            ) : (
              <span style={{ fontSize: 11, color: T.muted }}>Preview will appear here...</span>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '14px 40px', borderTop: `1px solid ${T.border}`, background: T.surface, display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
        {error && <div style={{ flex: 1, fontSize: 11, color: T.danger }}>{error}</div>}

        {progress && progress !== 'done' ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {STEPS.map((step, i) => {
              const current = STEP_IDX[progress] ?? 0
              const done = i < current
              const active = i === current
              const pct = done ? 100 : active ? 60 : 0
              return (
                <div key={step.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, height: 4, background: T.faint, borderRadius: 2 }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: active && step.key === 'signing' ? T.warning ?? T.accent : T.accent, borderRadius: 2, transition: 'width 0.8s ease' }} />
                  </div>
                  <span style={{ fontSize: 9, color: done ? T.success : active ? T.accent : T.muted, width: 230 }}>
                    {done ? '✓ ' : ''}{step.label}
                    {active && step.key === 'confirming' && isConfirming ? ' (in mempool...)' : ''}
                  </span>
                </div>
              )
            })}
          </div>
        ) : progress === 'done' ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ color: T.success, fontSize: 12 }}>✓ Entry staked on-chain — iNFT mints after challenge window (~5 min)</span>
            {txHash && (
              <a href={`https://chainscan-galileo.0g.ai/tx/${txHash}`} target="_blank" rel="noreferrer"
                style={{ fontSize: 10, color: T.muted }}>
                tx ↗
              </a>
            )}
          </div>
        ) : (
          <>
            <span style={{ fontSize: 11, color: T.muted, flex: 1 }}>
              {address
                ? `Staking 0.005 A0GI from ${truncateAddress(address)} — your wallet, your stake.`
                : 'Connect wallet (top-right) to stake your entry on-chain.'}
            </span>
            <BtnGhost onClick={() => router.back()}>CANCEL</BtnGhost>
            <BtnPrimary onClick={handleSubmit} disabled={!fullContent.trim() || !address}>
              STAKE + MINT →
            </BtnPrimary>
          </>
        )}
      </div>
    </div>
  )
}
