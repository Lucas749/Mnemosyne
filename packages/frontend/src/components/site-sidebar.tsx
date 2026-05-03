'use client'

import Link from 'next/link'
import { T } from './design-system'

const sections = [
  {
    heading: 'NAVIGATION',
    items: [
      { label: 'Main Page', href: '/' },
      { label: 'Knowledge Graph', href: '/explore' },
      { label: 'Submit Entry', href: '/submit' },
    ],
  },
  {
    heading: 'PROTOCOL',
    items: [
      { label: 'Challenge Arena', href: '/challenge' },
      { label: 'iNFT Marketplace', href: '/marketplace' },
      { label: 'Agent Skill', href: '/skill' },
    ],
  },
  {
    heading: 'DOMAINS',
    items: [
      { label: 'Economics',     href: '/explore?tag=ECONOMICS' },
      { label: 'Cryptography',  href: '/explore?tag=CRYPTOGRAPHY' },
      { label: 'Architecture',  href: '/explore?tag=ARCHITECTURE' },
      { label: 'AI / ML',       href: '/explore?tag=AI' },
      { label: 'Blockchain',    href: '/explore?tag=BLOCKCHAIN' },
      { label: 'Protocol',      href: '/explore?tag=PROTOCOL' },
      { label: 'Governance',    href: '/explore?tag=GOVERNANCE' },
    ],
  },
  {
    heading: 'TOOLS',
    items: [
      { label: '0G Explorer ↗', href: 'https://chainscan-galileo.0g.ai', ext: true },
      { label: 'ENS (Sepolia) ↗', href: 'https://sepolia.app.ens.domains', ext: true },
    ],
  },
]

export function SiteSidebar() {
  return (
    <aside style={{
      width: 200, flexShrink: 0, background: T.sidebarBg,
      borderRight: `1px solid ${T.border}`,
      padding: '20px 0', overflowY: 'auto', fontFamily: T.codeFont,
    }}>
      {sections.map(sec => (
        <div key={sec.heading} style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: 9, letterSpacing: '0.15em', color: T.muted,
            padding: '0 16px 6px', borderBottom: `1px solid ${T.borderLight}`,
            marginBottom: 6,
          }}>{sec.heading}</div>
          {sec.items.map(item => {
            if (!('href' in item) || !item.href) {
              return (
                <div key={item.label} style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '5px 16px', fontFamily: T.codeFont, fontSize: 11,
                  color: T.accent, cursor: 'default',
                }}>
                  {item.label}
                </div>
              )
            }
            return (
              <Link key={item.label} href={item.href}
                target={'ext' in item && item.ext ? '_blank' : undefined}
                rel={'ext' in item && item.ext ? 'noopener noreferrer' : undefined}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '5px 16px', fontFamily: T.codeFont, fontSize: 11,
                  color: 'ext' in item && item.ext ? T.muted : T.accent,
                  textDecoration: 'none',
                }}>
                {item.label}
              </Link>
            )
          })}
        </div>
      ))}
    </aside>
  )
}
