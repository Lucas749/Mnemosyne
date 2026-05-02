'use client'

import { useState, useEffect, useRef } from 'react'
import { useAccount, useConnect, useDisconnect, useConnectors } from 'wagmi'
import { T } from './design-system'
import { truncateAddress } from '@/lib/ens'

const DISPLAY_NAMES: Record<string, string> = {
  metaMask: 'MetaMask',
  phantom:  'Phantom',
}

function getStaticIcon(id: string, name: string): string | null {
  const idLower = id.toLowerCase()
  const nameLower = name.toLowerCase()
  if (idLower.includes('metamask') || nameLower.includes('metamask')) return '/wallets/metamask.png'
  if (idLower.includes('phantom') || nameLower.includes('phantom')) return '/wallets/phantom.svg'
  return null
}

function WalletModal({ onClose }: { onClose: () => void }) {
  const allConnectors = useConnectors()
  const { connect, isPending, error } = useConnect()

  // Deduplicate by display name to avoid showing the same wallet twice
  const seen = new Set<string>()
  const connectors = allConnectors.filter(c => {
    const name = DISPLAY_NAMES[c.id] ?? c.name
    if (seen.has(name)) return false
    seen.add(name)
    return true
  })

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#f3ede3', border: `1px solid ${T.border}`,
          borderRadius: 8, width: 320, maxWidth: '90vw',
          boxShadow: '0 16px 48px rgba(0,0,0,0.2)', overflow: 'hidden',
          fontFamily: T.codeFont,
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', borderBottom: `1px solid ${T.border}`,
          background: T.surface,
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: T.text, letterSpacing: '0.08em' }}>
            CONNECT WALLET
          </span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 18, color: T.muted, lineHeight: 1, padding: '0 4px',
          }}>×</button>
        </div>

        <div style={{ padding: '10px 12px' }}>
          {connectors.map(connector => {
            const displayName = DISPLAY_NAMES[connector.id] ?? connector.name
            const icon = getStaticIcon(connector.id, connector.name) ?? connector.icon
            return (
              <button
                key={connector.uid}
                disabled={isPending}
                onClick={() => { connect({ connector }); onClose() }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  width: '100%', padding: '12px 14px', marginBottom: 6,
                  background: T.surface, border: `1px solid ${T.border}`,
                  borderRadius: 6, cursor: isPending ? 'wait' : 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = T.accent)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = T.border)}
              >
                {icon ? (
                  <img src={icon} alt={displayName} style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: T.faint, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                    ◈
                  </div>
                )}
                <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>
                  {displayName}
                </span>
                <span style={{ marginLeft: 'auto', color: T.muted, fontSize: 14 }}>›</span>
              </button>
            )
          })}
        </div>

        {error && (
          <div style={{ padding: '0 18px 10px', fontSize: 11, color: T.danger }}>
            {error.message.slice(0, 120)}
          </div>
        )}

        <div style={{
          padding: '10px 18px', borderTop: `1px solid ${T.border}`,
          background: T.faint, fontSize: 10, color: T.muted, textAlign: 'center',
        }}>
          New to wallets?&nbsp;
          <a href="https://ethereum.org/en/wallets/" target="_blank" rel="noopener noreferrer"
            style={{ color: T.accent, textDecoration: 'none' }}>Learn more ↗</a>
        </div>
      </div>
    </div>
  )
}

export function WalletButton() {
  const { address, isConnected, connector } = useAccount()
  const { disconnect } = useDisconnect()
  const [modalOpen, setModalOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [menuOpen])

  if (isConnected && address) {
    const icon = (connector ? getStaticIcon(connector.id, connector.name) : undefined) ?? connector?.icon ?? undefined
    return (
      <div ref={menuRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setMenuOpen(o => !o)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 3, padding: '5px 12px', fontFamily: T.codeFont,
            fontSize: 10, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.9)',
            cursor: 'pointer',
          }}
        >
          {icon && <img src={icon} alt="" style={{ width: 16, height: 16, borderRadius: 4 }} />}
          {truncateAddress(address)}
        </button>
        {menuOpen && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 300,
            background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6,
            width: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', fontFamily: T.codeFont,
          }}>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${T.borderLight}` }}>
              <div style={{ fontSize: 9, color: T.muted, marginBottom: 4 }}>CONNECTED</div>
              <div style={{ fontSize: 11, color: T.text, wordBreak: 'break-all' }}>{address}</div>
            </div>
            <button
              onClick={() => { disconnect(); setMenuOpen(false) }}
              style={{
                display: 'block', width: '100%', padding: '11px 16px',
                background: 'none', border: 'none', textAlign: 'left',
                fontFamily: T.codeFont, fontSize: 10, color: T.danger,
                cursor: 'pointer', letterSpacing: '0.06em',
              }}
            >
              DISCONNECT
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        style={{
          background: T.accent, border: 'none', borderRadius: 3,
          padding: '7px 16px', fontFamily: T.codeFont, fontSize: 10,
          letterSpacing: '0.1em', color: '#fff', cursor: 'pointer', fontWeight: 700,
        }}
      >
        CONNECT WALLET
      </button>
      {modalOpen && <WalletModal onClose={() => setModalOpen(false)} />}
    </>
  )
}
