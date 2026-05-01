'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAccount } from 'wagmi'
import { Tag, BtnPrimary, BtnGhost } from '@/components/design-system'
import { T } from '@/components/design-system'
import { submitEntry, queryKnowledge, pollJob, type QueryMatch } from '@/lib/api'
import { DOMAIN_LABELS } from '@/lib/contracts'
import { truncateAddress } from '@/lib/ens'

const PROGRESS_STEPS = [
  { key: 'uploading', label: 'uploading to 0G storage...' },
  { key: 'embedding', label: 'computing embeddings...' },
  { key: 'staking', label: 'staking on-chain...' },
]
const PROGRESS_IDX: Record<string, number> = { uploading: 0, embedding: 1, staking: 2, done: 3 }

const DOMAINS = ['factual', 'labeled_example', 'structured_data', 'observation', 'correction']

export default function SubmitPage() {
  const router = useRouter()
  const { address } = useAccount()

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [domain, setDomain] = useState('factual')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [progress, setProgress] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [similar, setSimilar] = useState<QueryMatch[]>([])
  const [queryJobId, setQueryJobId] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fullContent = title ? `# ${title}\n\n${content}` : content

  useEffect(() => {
    if (!fullContent.trim() || fullContent.length < 20) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const jid = await queryKnowledge({ text: fullContent.slice(0, 200), topK: 3 })
        setQueryJobId(jid)
        const result = await pollJob<{ matches: QueryMatch[] }>(jid)
        setSimilar(result.matches ?? [])
      } catch {
        // similarity preview is best-effort
      }
    }, 800)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [fullContent])

  async function handleSubmit() {
    setError(null)
    setProgress('uploading')
    try {
      const submittedBy = address ? truncateAddress(address) : 'anonymous'
      const jid = await submitEntry({
        content: fullContent,
        domain,
        tags,
        submittedBy,
      })
      setJobId(jid)

      const result = await pollJob<{ entryId: string }>(jid, setProgress)
      setProgress('done')
      setTimeout(() => router.push(`/entry/${result.entryId}`), 1500)
    } catch (e: unknown) {
      const err = e as { message?: string }
      setError(err.message ?? 'Submission failed')
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
          <select value={domain} onChange={e => setDomain(e.target.value)} style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 3, padding: '5px 10px', fontFamily: T.codeFont, fontSize: 10, color: T.text, cursor: 'pointer' }}>
            {DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
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
        {/* Markdown source */}
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

        {/* Preview */}
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

        {/* Similarity panel */}
        <div style={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '10px 20px', borderBottom: `1px solid ${T.border}`, background: T.faint, fontSize: 9, letterSpacing: '0.12em', color: T.muted }}>
            SIMILAR EXISTING ENTRIES
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            {similar.length > 0 ? similar.map(s => (
              <div key={s.entryId} style={{ marginBottom: 14, padding: '10px 12px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 3 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: s.similarity > 0.8 ? T.danger : T.warning, marginBottom: 4 }}>
                  {Math.round(s.similarity * 100)}%
                </div>
                <div style={{ fontSize: 10, color: T.accent, lineHeight: 1.5, cursor: 'pointer' }}>
                  {s.entryId.slice(0, 20)}...
                </div>
                <div style={{ fontSize: 9, color: T.muted, marginTop: 4 }}>
                  {s.domain} · by {s.submittedBy}
                </div>
              </div>
            )) : (
              <div style={{ fontSize: 10, color: T.muted, lineHeight: 1.7 }}>
                Similarity search runs as you type. Duplicate entries waste stake.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '14px 40px', borderTop: `1px solid ${T.border}`, background: T.surface, display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
        {error && (
          <div style={{ flex: 1, fontSize: 11, color: T.danger }}>{error}</div>
        )}
        {progress && progress !== 'done' ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {PROGRESS_STEPS.map((step, i) => {
              const current = PROGRESS_IDX[progress] ?? 0
              const done = i < current
              const active = i === current
              const pct = done ? 100 : active ? 65 : 0
              return (
                <div key={step.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, height: 4, background: T.faint, borderRadius: 2 }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: T.accent, borderRadius: 2, transition: 'width 0.8s ease' }} />
                  </div>
                  <span style={{ fontSize: 9, color: done ? T.success : active ? T.accent : T.muted, width: 200 }}>
                    {done ? '✓ ' : ''}{step.label}
                  </span>
                </div>
              )
            })}
          </div>
        ) : progress === 'done' ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ color: T.success, fontSize: 12 }}>✓ Entry submitted — iNFT mints in ~5 minutes</span>
            {jobId && <span style={{ fontSize: 10, color: T.muted }}>Job: {jobId.slice(0, 14)}...</span>}
          </div>
        ) : (
          <>
            <span style={{ fontSize: 11, color: T.muted, flex: 1 }}>
              Stake: 0.005 A0GI (relayer pays) · {address ? `From: ${truncateAddress(address)}` : 'No wallet required'}
            </span>
            <BtnGhost onClick={() => router.back()}>CANCEL</BtnGhost>
            <BtnPrimary onClick={handleSubmit} disabled={!fullContent.trim()}>
              MINT ENTRY NFT →
            </BtnPrimary>
          </>
        )}
      </div>
    </div>
  )
}
