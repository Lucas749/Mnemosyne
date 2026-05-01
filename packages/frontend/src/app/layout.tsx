import type { Metadata } from 'next'
import './globals.css'
import { Providers } from '@/lib/providers'
import { SiteHeader } from '@/components/site-header'
import { SiteSidebar } from '@/components/site-sidebar'

export const metadata: Metadata = {
  title: 'Mnemosyne — Decentralized Knowledge Protocol',
  description: 'On-chain knowledge base for AI agents. Every fact is staked. Every truth has a staker.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, height: '100vh', display: 'flex', flexDirection: 'column', background: '#f3ede3' }}>
        <Providers>
          <SiteHeader />
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            <SiteSidebar />
            <main style={{ flex: 1, overflowY: 'auto', background: '#f3ede3' }}>
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  )
}
