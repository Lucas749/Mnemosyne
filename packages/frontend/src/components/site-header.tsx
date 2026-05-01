'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogoFull } from './logo'
import { WalletButton } from './wallet-button'
import { T } from './design-system'

const NAV_LINKS = [
  { href: '/', label: 'HOME' },
  { href: '/explore', label: 'EXPLORE' },
  { href: '/challenge', label: 'CHALLENGE' },
  { href: '/marketplace', label: 'MARKET' },
  { href: '/leaderboard', label: 'LEADERBOARD' },
  { href: '/skill', label: 'AGENT SKILL' },
]

export function SiteHeader() {
  const pathname = usePathname()

  return (
    <header style={{
      background: T.headerBg, borderBottom: `3px solid ${T.accent}`,
      padding: '0 32px', height: 52, display: 'flex', alignItems: 'center', gap: 24,
      position: 'sticky', top: 0, zIndex: 100, flexShrink: 0,
    }}>
      <Link href="/" style={{ textDecoration: 'none' }}>
        <LogoFull size={26} />
      </Link>

      <div style={{
        flex: 1, maxWidth: 360, background: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.15)', borderRadius: 3,
        display: 'flex', alignItems: 'center', padding: '6px 12px', gap: 8,
      }}>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>⌕</span>
        <span style={{ fontFamily: T.codeFont, fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
          Search knowledge graph...
        </span>
      </div>

      <nav style={{ display: 'flex', gap: 20 }}>
        {NAV_LINKS.map(l => {
          const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href)
          return (
            <Link key={l.href} href={l.href} style={{
              textDecoration: 'none',
              fontFamily: T.codeFont, fontSize: 10, letterSpacing: '0.1em',
              color: active ? T.accent : 'rgba(255,255,255,0.55)',
              borderBottom: active ? `1px solid ${T.accent}` : '1px solid transparent',
              padding: '4px 0',
            }}>
              {l.label}
            </Link>
          )
        })}
      </nav>

      <WalletButton />
    </header>
  )
}
