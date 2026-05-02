'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { T, BtnGhost } from './design-system'
import { queryKnowledge, pollJob, type QueryMatch } from '@/lib/api'

interface SearchModalProps {
  onClose: () => void
}

export function SearchModal({ onClose }: SearchModalProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<QueryMatch[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    inputRef.current?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (!query.trim() || query.length < 3) { setResults([]); return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const jobId = await queryKnowledge({ text: query, topK: 8 })
        const result = await pollJob<{ matches: QueryMatch[] }>(jobId)
        setResults(result.matches ?? [])
      } catch (e: unknown) {
        const err = e as { message?: string }
        setError(err.message ?? 'Search failed')
      } finally {
        setLoading(false)
      }
    }, 500)
  }, [query])

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 80 }}
      onClick={onClose}
    >
      <div
        style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, width: 640, maxWidth: '90vw', maxHeight: '70vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 20px', borderBottom: `1px solid ${T.border}`, gap: 10 }}>
          <span style={{ fontSize: 16, color: T.muted }}>⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search the knowledge graph..."
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontFamily: T.codeFont, fontSize: 14, color: T.text }}
          />
          {loading && <span style={{ fontSize: 9, color: T.muted, fontFamily: T.codeFont }}>searching...</span>}
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: T.muted, lineHeight: 1 }}>×</button>
        </div>

        {/* Results */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {error && (
            <div style={{ padding: '16px 20px', fontSize: 11, color: T.danger, fontFamily: T.codeFont }}>{error}</div>
          )}

          {!loading && !error && results.length === 0 && query.length >= 3 && (
            <div style={{ padding: '24px 20px', fontSize: 12, color: T.muted, textAlign: 'center' }}>No results found</div>
          )}

          {!loading && query.length < 3 && (
            <div style={{ padding: '24px 20px', fontSize: 11, color: T.muted, textAlign: 'center', fontFamily: T.codeFont }}>
              Semantic search — type at least 3 characters
            </div>
          )}

          {results.map((r, i) => (
            <Link key={r.entryId} href={`/entry/${r.entryId}`} onClick={onClose} style={{ textDecoration: 'none', display: 'block' }}>
              <div style={{
                display: 'flex', gap: 16, padding: '14px 20px',
                borderBottom: `1px solid ${T.borderLight}`, cursor: 'pointer',
                background: i === 0 ? T.faint : 'transparent',
              }}>
                <div style={{ width: 48, textAlign: 'right', flexShrink: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: r.similarity > 0.8 ? T.accent : T.muted }}>
                    {Math.round(r.similarity * 100)}%
                  </span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: T.accent, marginBottom: 4, fontFamily: T.codeFont }}>
                    {r.entryId.slice(0, 24)}...
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 9, color: T.muted, fontFamily: T.codeFont, letterSpacing: '0.08em' }}>
                      {r.domain.toUpperCase()}
                    </span>
                    {r.tags.slice(0, 3).map(t => (
                      <span key={t} style={{ fontSize: 9, color: T.muted, fontFamily: T.codeFont }}>{t}</span>
                    ))}
                    <span style={{ fontSize: 9, color: T.muted, marginLeft: 'auto' }}>by {r.submittedBy}</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {results.length > 0 && (
          <div style={{ padding: '8px 20px', borderTop: `1px solid ${T.border}`, fontSize: 9, color: T.muted, fontFamily: T.codeFont }}>
            {results.length} semantic matches · POST /query · powered by 0G embeddings
          </div>
        )}
      </div>
    </div>
  )
}
