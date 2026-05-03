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
  const skillRaw = 'https://raw.githubusercontent.com/Lucas749/Mnemosyne/main/packages/skill/SKILL.md'

  return (
    <div style={{ padding: '40px', maxWidth: 760, margin: '0 auto', fontFamily: T.codeFont }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: T.text, margin: '0 0 8px' }}>
          Mnemosyne Agent Skill
        </h1>
        <p style={{ fontSize: 13, color: T.muted, lineHeight: 1.8 }}>
          Give Claude Code access to the world's decentralized, verified knowledge base.<br />
          Query → approve payment → unlock — all from a single slash command.
        </p>
      </div>

      {/* API Status */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 3, padding: '14px 20px', marginBottom: 36, display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: health?.status === 'ok' ? T.success : T.muted }} />
          <span style={{ fontSize: 10, color: health?.status === 'ok' ? T.success : T.muted, letterSpacing: '0.08em' }}>
            {health?.status === 'ok' ? 'API ONLINE' : 'CHECKING...'}
          </span>
        </div>
        <span style={{ fontSize: 10, color: T.muted }}>
          API: <span style={{ color: T.accent }}>{apiUrl}</span>
        </span>
        {health?.entries !== undefined && (
          <span style={{ fontSize: 10, color: T.muted }}>{health.entries} entries indexed</span>
        )}
        <span style={{ fontSize: 10, color: T.muted, marginLeft: 'auto' }}>Chain: 0G-Galileo (16602)</span>
      </div>

      {/* How it works */}
      <div style={{ background: '#1c1814', borderRadius: 4, padding: '20px 24px', marginBottom: 36 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: T.muted, letterSpacing: '0.12em', marginBottom: 14 }}>HOW IT WORKS</div>
        {[
          { step: '1', text: 'You type /mnemosyne-memory <your question>', color: '#d97706' },
          { step: '2', text: 'Claude searches the knowledge graph by semantic similarity', color: '#86efac' },
          { step: '3', text: 'Claude shows you the match and asks: "Approve 0.001 A0GI payment? yes/no"', color: '#93c5fd' },
          { step: '4', text: 'You approve → Claude pays on-chain → verified content returned', color: '#86efac' },
          { step: '5', text: 'You get the tx hash + explorer link in every response', color: '#a78bfa' },
        ].map((line) => (
          <div key={line.step} style={{ display: 'flex', gap: 12, marginBottom: 10, fontSize: 11, lineHeight: 1.7 }}>
            <span style={{ color: '#6b7280', width: 16, flexShrink: 0 }}>{line.step}.</span>
            <span style={{ color: line.color }}>{line.text}</span>
          </div>
        ))}
      </div>

      <hr style={{ border: 'none', borderTop: `1px solid ${T.border}`, margin: '28px 0' }} />

      {/* Claude Code install */}
      <h2 style={{ fontSize: 14, fontWeight: 700, color: T.text, borderBottom: `2px solid ${T.border}`, paddingBottom: 7, marginBottom: 20, letterSpacing: '0.04em' }}>
        Install — Claude Code
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 28 }}>
        {/* Step 1 */}
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <span style={{ background: T.accent, color: '#fff', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>1</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: T.text, marginBottom: 8 }}>Install prerequisites</div>
            <CodeBlock copyKey="prereqs" copied={copied} onCopy={copy}>{'brew install jq\ncurl -L https://foundry.paradigm.xyz | bash && foundryup'}</CodeBlock>
          </div>
        </div>

        {/* Step 2 */}
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <span style={{ background: T.accent, color: '#fff', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>2</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: T.text, marginBottom: 4 }}>Copy the skill into your project</div>
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 8 }}>
              The folder name becomes the slash command — must be named <code style={{ background: T.faint, padding: '1px 5px', borderRadius: 2, fontSize: 10 }}>mnemosyne-memory</code> and contain <code style={{ background: T.faint, padding: '1px 5px', borderRadius: 2, fontSize: 10 }}>SKILL.md</code>
            </div>
            <CodeBlock copyKey="install" copied={copied} onCopy={copy}>{'mkdir -p .claude/skills/mnemosyne-memory\ncurl -o .claude/skills/mnemosyne-memory/SKILL.md \\\n  ' + skillRaw}</CodeBlock>
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 4 }}>Or for a global install (all projects):</div>
            <CodeBlock copyKey="global" copied={copied} onCopy={copy}>{'mkdir -p ~/.claude/skills/mnemosyne-memory\ncurl -o ~/.claude/skills/mnemosyne-memory/SKILL.md \\\n  ' + skillRaw}</CodeBlock>
          </div>
        </div>

        {/* Step 3 */}
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <span style={{ background: T.accent, color: '#fff', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>3</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: T.text, marginBottom: 8 }}>Set your environment variables</div>
            <CodeBlock copyKey="env" copied={copied} onCopy={copy}>{`export AGENT_PRIVATE_KEY="0x..."   # wallet with A0GI on 0G Galileo testnet
export AGENT_NAME="yourname.eth"   # your identifier
# MNEMOSYNE_API_URL is pre-configured — no need to set it`}</CodeBlock>
            <div style={{ fontSize: 11, color: T.muted }}>
              Add to <code style={{ background: T.faint, padding: '1px 5px', borderRadius: 2, fontSize: 10 }}>~/.zshrc</code> or <code style={{ background: T.faint, padding: '1px 5px', borderRadius: 2, fontSize: 10 }}>~/.bashrc</code> to persist across sessions.
            </div>
          </div>
        </div>

        {/* Step 4 */}
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <span style={{ background: T.accent, color: '#fff', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>4</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: T.text, marginBottom: 8 }}>
              Restart Claude Code, then use the slash command
            </div>
            <CodeBlock copyKey="usage" copied={copied} onCopy={copy}>{'/mnemosyne-memory how do merkle trees prove data integrity'}</CodeBlock>
            <div style={{ fontSize: 11, color: T.muted }}>
              Claude will search, show the best match, and ask for your approval before sending any payment.
            </div>
          </div>
        </div>
      </div>

      {/* Payment approval callout */}
      <div style={{ background: T.surface, border: `1px solid ${T.accent}`, borderRadius: 3, padding: '16px 20px', marginBottom: 36 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.accent, marginBottom: 8, letterSpacing: '0.06em' }}>
          PAYMENT APPROVAL REQUIRED
        </div>
        <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.9 }}>
          The skill always pauses before sending any on-chain transaction and shows you exactly what will be paid, to whom, and for which entry.
          You must type <code style={{ background: T.faint, padding: '1px 6px', borderRadius: 2, fontSize: 10, color: T.text }}>yes</code> to proceed.
          Anything else cancels the payment.
        </div>
        <div style={{ marginTop: 12, background: '#1c1814', borderRadius: 3, padding: '12px 16px', fontSize: 11, fontFamily: T.codeFont, lineHeight: 1.9 }}>
          <div style={{ color: '#6b7280' }}>Claude:</div>
          <div style={{ color: '#93c5fd', marginTop: 4 }}>
            Approve this on-chain payment?<br />
            <span style={{ color: T.muted }}>Match      77% similarity</span><br />
            <span style={{ color: T.muted }}>Cost       0.001 A0GI</span><br />
            <span style={{ color: T.muted }}>Recipient  0xf2a38D...</span><br />
            <span style={{ color: '#d97706', marginTop: 4, display: 'block' }}>yes / no</span>
          </div>
        </div>
      </div>


      <hr style={{ border: 'none', borderTop: `1px solid ${T.border}`, margin: '28px 0' }} />

      {/* Stats */}
      <h2 style={{ fontSize: 14, fontWeight: 700, color: T.text, borderBottom: `2px solid ${T.border}`, paddingBottom: 7, marginBottom: 16, letterSpacing: '0.04em' }}>
        Live Network Stats
      </h2>
      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', marginBottom: 36 }}>
        {[
          [health?.entries?.toString() ?? '—', 'ENTRIES'],
          ['0.001 A0GI', 'QUERY PRICE'],
          ['0.005 A0GI', 'SUBMIT STAKE'],
          [health?.status === 'ok' ? 'ONLINE' : '—', 'API STATUS'],
        ].map(([val, label]) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.accent, marginBottom: 4 }}>{val}</div>
            <div style={{ fontSize: 9, color: T.muted, letterSpacing: '0.1em' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Contracts */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 3, overflow: 'hidden' }}>
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
          <a
            key={name}
            href={`https://chainscan-galileo.0g.ai/address/${addr}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'flex', gap: 20, padding: '9px 16px', borderBottom: `1px solid ${T.borderLight}`, textDecoration: 'none' }}
          >
            <span style={{ fontSize: 10, color: T.accent, width: 200, flexShrink: 0 }}>{name}</span>
            <span style={{ fontSize: 10, color: T.muted, fontFamily: T.codeFont }}>{addr}</span>
          </a>
        ))}
      </div>
    </div>
  )
}
