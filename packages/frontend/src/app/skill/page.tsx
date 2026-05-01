'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BtnPrimary } from '@/components/design-system'
import { T } from '@/components/design-system'
import { apiHealth } from '@/lib/api'

function CodeBlock({ children, copyKey, copied, onCopy }: {
  children: string
  copyKey: string
  copied: string
  onCopy: (text: string, key: string) => void
}) {
  return (
    <div style={{ position: 'relative', background: T.faint, border: `1px solid ${T.border}`, borderRadius: 3, padding: '14px 18px', marginBottom: 16 }}>
      <pre style={{ margin: 0, fontSize: 11, color: T.text, fontFamily: T.codeFont, lineHeight: 1.8, overflowX: 'auto' }}>{children}</pre>
      <button
        onClick={() => onCopy(children, copyKey)}
        style={{
          position: 'absolute', top: 8, right: 8,
          background: copied === copyKey ? T.success : T.accentLight,
          border: `1px solid ${copied === copyKey ? T.success : T.accent}`,
          borderRadius: 2, padding: '3px 10px', fontFamily: T.codeFont, fontSize: 9,
          color: copied === copyKey ? '#fff' : T.accent, cursor: 'pointer', letterSpacing: '0.08em',
        }}
      >
        {copied === copyKey ? 'COPIED ✓' : 'COPY'}
      </button>
    </div>
  )
}

export default function SkillPage() {
  const [copied, setCopied] = useState('')

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: apiHealth,
    refetchInterval: 60_000,
  })

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).catch(() => {})
    setCopied(key)
    setTimeout(() => setCopied(''), 2000)
  }

  const apiUrl = 'https://mnemosyne-api-production-7cd6.up.railway.app'

  return (
    <div style={{ padding: '40px', maxWidth: 760, margin: '0 auto', fontFamily: T.codeFont }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: T.text, margin: '0 0 8px' }}>
          Mnemosyne Agent Skill
        </h1>
        <p style={{ fontSize: 13, color: T.muted, lineHeight: 1.8 }}>
          Give your AI agent access to the world's decentralized, verified knowledge base.
        </p>
      </div>

      {/* API Status */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 3, padding: '14px 20px', marginBottom: 36, display: 'flex', gap: 24, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: health?.status === 'ok' ? T.success : T.muted }} />
          <span style={{ fontSize: 10, color: health?.status === 'ok' ? T.success : T.muted, letterSpacing: '0.08em' }}>
            {health?.status === 'ok' ? 'API ONLINE' : 'CHECKING...'}
          </span>
        </div>
        <span style={{ fontSize: 10, color: T.muted }}>
          Base URL: <span style={{ color: T.accent }}>{apiUrl}</span>
        </span>
        {health?.entries !== undefined && (
          <span style={{ fontSize: 10, color: T.muted }}>{health.entries} entries indexed</span>
        )}
        <span style={{ fontSize: 10, color: T.muted, marginLeft: 'auto' }}>Chain: 0G-Galileo (16602)</span>
      </div>

      <hr style={{ border: 'none', borderTop: `1px solid ${T.border}`, margin: '28px 0' }} />

      <h2 style={{ fontSize: 14, fontWeight: 700, color: T.text, borderBottom: `2px solid ${T.border}`, paddingBottom: 7, marginBottom: 20, letterSpacing: '0.04em' }}>
        For Cursor / OpenClaw
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 28 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <span style={{ background: T.accent, color: '#fff', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>1</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: T.text, marginBottom: 8 }}>Download the skill file</div>
            <a
              href="https://raw.githubusercontent.com/Lucas749/Mnemosyne/main/packages/openclaw/SKILL.md"
              download="mnemosyne-memory.md"
              style={{ textDecoration: 'none' }}
            >
              <BtnPrimary>DOWNLOAD SKILL.MD →</BtnPrimary>
            </a>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <span style={{ background: T.accent, color: '#fff', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>2</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: T.text, marginBottom: 8 }}>Drop it into your Cursor skills folder</div>
            <CodeBlock copyKey="path" copied={copied} onCopy={copy}>{'~/.cursor/skills/mnemosyne-memory.md'}</CodeBlock>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <span style={{ background: T.accent, color: '#fff', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>3</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: T.text, marginBottom: 8 }}>Ask your agent</div>
            <CodeBlock copyKey="prompt" copied={copied} onCopy={copy}>{'Load my Mnemosyne memory and answer questions about DeFi'}</CodeBlock>
          </div>
        </div>
      </div>

      <hr style={{ border: 'none', borderTop: `1px solid ${T.border}`, margin: '28px 0' }} />

      <h2 style={{ fontSize: 14, fontWeight: 700, color: T.text, borderBottom: `2px solid ${T.border}`, paddingBottom: 7, marginBottom: 20, letterSpacing: '0.04em' }}>
        For Python (LangChain / LlamaIndex)
      </h2>
      <CodeBlock copyKey="pip" copied={copied} onCopy={copy}>{'pip install mnemosyne-py'}</CodeBlock>
      <CodeBlock copyKey="python" copied={copied} onCopy={copy}>{`from mnemosyne.langchain import MnemosyneMemory, KEEPER_TOOLS

memory = MnemosyneMemory(
    api_url="${apiUrl}",
    private_key="0x..."  # for paying royalties
)

# Add to your LangChain agent
tools = KEEPER_TOOLS + memory.as_tools()
agent = initialize_agent(tools, llm, ...)`}</CodeBlock>

      <hr style={{ border: 'none', borderTop: `1px solid ${T.border}`, margin: '28px 0' }} />

      <h2 style={{ fontSize: 14, fontWeight: 700, color: T.text, borderBottom: `2px solid ${T.border}`, paddingBottom: 7, marginBottom: 20, letterSpacing: '0.04em' }}>
        Example Agent Session
      </h2>
      <div style={{ background: '#1c1814', borderRadius: 4, padding: '20px 24px', marginBottom: 28 }}>
        {[
          { prefix: 'Agent:', text: 'POST /query "What is ERC-7857?"', color: '#d97706' },
          { prefix: 'Brain:', text: '[0.94] ERC-7857 iNFT standard — the tokenization standard for...', color: '#86efac' },
          { prefix: 'Agent:', text: 'POST /unlock → pays 0.001 A0GI', color: '#d97706' },
          { prefix: 'Brain:', text: '# ERC-7857 iNFT Standard\n         Full entry text decrypted...', color: '#86efac' },
          { prefix: 'Agent:', text: 'Answers user with verified knowledge ✓', color: '#93c5fd' },
        ].map((line, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 10, fontFamily: T.codeFont, fontSize: 11, lineHeight: 1.7 }}>
            <span style={{ color: '#6b7280', width: 48, flexShrink: 0 }}>{line.prefix}</span>
            <span style={{ color: line.color, whiteSpace: 'pre' }}>{line.text}</span>
          </div>
        ))}
      </div>

      <hr style={{ border: 'none', borderTop: `1px solid ${T.border}`, margin: '28px 0' }} />

      <h2 style={{ fontSize: 14, fontWeight: 700, color: T.text, borderBottom: `2px solid ${T.border}`, paddingBottom: 7, marginBottom: 16, letterSpacing: '0.04em' }}>
        Live Network Stats
      </h2>
      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
        {[
          [health?.entries.toString() ?? '—', 'ENTRIES'],
          ['0G-Galileo', 'CHAIN'],
          ['16602', 'CHAIN ID'],
          [health?.status === 'ok' ? 'ONLINE' : '—', 'API STATUS'],
        ].map(([val, label]) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.accent, marginBottom: 4 }}>{val}</div>
            <div style={{ fontSize: 9, color: T.muted, letterSpacing: '0.1em' }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 40, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ background: T.faint, padding: '8px 16px', borderBottom: `1px solid ${T.border}`, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: T.text }}>
          CONTRACT ADDRESSES — 0G-GALILEO (16602)
        </div>
        {[
          ['MnemosyneRegistry', '0xaA40404DC25248c886c8fb6C27e34536aB2b8001'],
          ['MnemosyneINFT', '0x8fbDb7666F8D301d9C974982764ab1B39917cc82'],
          ['MnemosyneMarket', '0x8fADa38137C0407800c0320BBf6985D08016E8A3'],
          ['ChallengeManager', '0xAe66d96339f43F72BCB0164F70E0cB90FA959166'],
          ['RoyaltyVault', '0x4ad5B6a01CDCAcaC31Ce89e9B6e92EB5c8207507'],
          ['StakeVault', '0x333E1BD1bA8970b11b0bFe13a6A98765788e5D71'],
        ].map(([name, addr]) => (
          <div key={name} style={{ display: 'flex', gap: 20, padding: '9px 16px', borderBottom: `1px solid ${T.borderLight}` }}>
            <span style={{ fontSize: 10, color: T.accent, width: 200, flexShrink: 0 }}>{name}</span>
            <span style={{ fontSize: 10, color: T.muted, fontFamily: T.codeFont }}>{addr}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
