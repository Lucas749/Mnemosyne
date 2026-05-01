'use client'

import React from 'react'

export const T = {
  bg: '#f3ede3',
  surface: '#faf8f2',
  card: '#ffffff',
  border: '#c8bfb0',
  borderLight: '#ddd6c8',
  accent: '#b45309',
  accentHover: '#92400e',
  accentLight: 'rgba(180,83,9,0.09)',
  accentMid: 'rgba(180,83,9,0.18)',
  text: '#1c1814',
  muted: '#7a6e60',
  faint: '#e8e2d6',
  tag: '#fef9ee',
  tagBorder: '#e9c46a',
  tagText: '#92400e',
  success: '#166534',
  successBg: '#f0fdf4',
  danger: '#991b1b',
  dangerBg: '#fef2f2',
  warning: '#92400e',
  warningBg: '#fffbeb',
  sidebarBg: '#ede8dc',
  headerBg: '#1c1814',
  codeFont: "'Space Mono', 'Courier New', Courier, monospace",
} as const

type TagVariant = 'default' | 'success' | 'danger' | 'warning' | 'ghost'

export function Tag({ children, variant = 'default' }: { children: React.ReactNode; variant?: TagVariant }) {
  const styles: Record<TagVariant, { bg: string; color: string; border: string }> = {
    default: { bg: T.tag, color: T.tagText, border: T.tagBorder },
    success: { bg: T.successBg, color: T.success, border: '#86efac' },
    danger: { bg: T.dangerBg, color: T.danger, border: '#fca5a5' },
    warning: { bg: T.warningBg, color: T.warning, border: '#fcd34d' },
    ghost: { bg: 'transparent', color: T.muted, border: T.border },
  }
  const s = styles[variant]
  return (
    <span style={{
      display: 'inline-block', fontSize: 9, fontFamily: T.codeFont,
      letterSpacing: '0.1em', padding: '3px 7px', borderRadius: 2,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      whiteSpace: 'nowrap',
    }}>{children}</span>
  )
}

export function WikiInfoBox({ title, rows, footer }: {
  title?: string
  rows?: [string, React.ReactNode][]
  footer?: string
}) {
  return (
    <div style={{
      float: 'right', clear: 'right', margin: '0 0 20px 28px',
      width: 260, background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 3, fontSize: 11, fontFamily: T.codeFont, overflow: 'hidden',
    }}>
      {title && (
        <div style={{ background: T.faint, borderBottom: `1px solid ${T.border}`, padding: '8px 12px', fontWeight: 700, fontSize: 11, color: T.text, textAlign: 'center', letterSpacing: '0.06em' }}>
          {title}
        </div>
      )}
      {rows && rows.map((row, i) => (
        <div key={i} style={{
          display: 'flex', gap: 8, padding: '7px 12px',
          borderBottom: i < rows.length - 1 ? `1px solid ${T.borderLight}` : 'none',
          alignItems: 'flex-start',
        }}>
          <span style={{ color: T.muted, minWidth: 90, flexShrink: 0, fontSize: 10 }}>{row[0]}</span>
          <span style={{ color: T.text, fontSize: 10, lineHeight: 1.5 }}>{row[1]}</span>
        </div>
      ))}
      {footer && (
        <div style={{ padding: '8px 12px', borderTop: `1px solid ${T.border}`, fontSize: 9, color: T.muted, textAlign: 'center' }}>
          {footer}
        </div>
      )}
    </div>
  )
}

export function Modal({ title, onClose, children, width = 540 }: {
  title: string
  onClose: () => void
  children: React.ReactNode
  width?: number
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div style={{
        background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4,
        width, maxWidth: '90vw', maxHeight: '90vh', overflow: 'auto',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: `1px solid ${T.border}`, background: T.faint }}>
          <span style={{ fontFamily: T.codeFont, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: T.text }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: T.muted }}>×</button>
        </div>
        <div style={{ padding: 24 }}>{children}</div>
      </div>
    </div>
  )
}

export function BtnPrimary({ children, onClick, style = {}, disabled = false }: {
  children: React.ReactNode
  onClick?: () => void
  style?: React.CSSProperties
  disabled?: boolean
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: disabled ? T.muted : T.accent, color: '#fff', border: 'none', borderRadius: 3,
      padding: '9px 20px', fontFamily: T.codeFont, fontSize: 10, fontWeight: 700,
      letterSpacing: '0.1em', cursor: disabled ? 'not-allowed' : 'pointer', ...style,
    }}>{children}</button>
  )
}

export function BtnGhost({ children, onClick, style = {}, disabled = false }: {
  children: React.ReactNode
  onClick?: () => void
  style?: React.CSSProperties
  disabled?: boolean
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: 'transparent', color: disabled ? T.muted : T.accent,
      border: `1px solid ${disabled ? T.muted : T.accent}`,
      borderRadius: 3, padding: '9px 20px', fontFamily: T.codeFont, fontSize: 10,
      letterSpacing: '0.1em', cursor: disabled ? 'not-allowed' : 'pointer', ...style,
    }}>{children}</button>
  )
}

export function ApiUnavailableBanner({ endpoint }: { endpoint: string }) {
  return (
    <div style={{
      background: T.warningBg, border: `1px solid ${T.tagBorder}`, borderRadius: 3,
      padding: '10px 16px', marginBottom: 16, fontSize: 11, color: T.warning,
      fontFamily: T.codeFont,
    }}>
      ⚠ API endpoint not yet available: <code style={{ background: T.faint, padding: '1px 6px', borderRadius: 2 }}>{endpoint}</code>
      {' '}— build this endpoint to enable full functionality.
    </div>
  )
}

export function LoadingDots() {
  return (
    <span style={{ fontFamily: T.codeFont, fontSize: 11, color: T.muted }}>
      loading<span className="animate-pulse">...</span>
    </span>
  )
}
