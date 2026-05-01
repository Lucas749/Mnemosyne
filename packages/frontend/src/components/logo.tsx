'use client'

import { T } from './design-system'

export function LogoIcon({ size = 32, color = '#b45309' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <circle cx="7" cy="11" r="2.5" fill={color} />
      <circle cx="7" cy="25" r="2.5" fill={color} />
      <circle cx="18" cy="7" r="2.5" fill={color} />
      <circle cx="18" cy="18" r="2.5" fill={color} />
      <circle cx="18" cy="29" r="2.5" fill={color} />
      <circle cx="29" cy="18" r="3.2" fill={color} />
      <line x1="7" y1="11" x2="18" y2="7" stroke={color} strokeWidth="1.1" opacity="0.55" />
      <line x1="7" y1="11" x2="18" y2="18" stroke={color} strokeWidth="1.1" opacity="0.55" />
      <line x1="7" y1="11" x2="18" y2="29" stroke={color} strokeWidth="1.1" opacity="0.35" />
      <line x1="7" y1="25" x2="18" y2="7" stroke={color} strokeWidth="1.1" opacity="0.35" />
      <line x1="7" y1="25" x2="18" y2="18" stroke={color} strokeWidth="1.1" opacity="0.55" />
      <line x1="7" y1="25" x2="18" y2="29" stroke={color} strokeWidth="1.1" opacity="0.55" />
      <line x1="18" y1="7" x2="29" y2="18" stroke={color} strokeWidth="1.4" opacity="0.7" />
      <line x1="18" y1="18" x2="29" y2="18" stroke={color} strokeWidth="1.4" opacity="0.7" />
      <line x1="18" y1="29" x2="29" y2="18" stroke={color} strokeWidth="1.4" opacity="0.7" />
    </svg>
  )
}

export function LogoFull({ size = 28 }: { size?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <LogoIcon size={size} color="#b45309" />
      <span style={{ fontFamily: T.codeFont, fontWeight: 700, fontSize: size * 0.55, color: '#fff', letterSpacing: '0.12em' }}>
        MNEMOSYNE
      </span>
    </div>
  )
}
