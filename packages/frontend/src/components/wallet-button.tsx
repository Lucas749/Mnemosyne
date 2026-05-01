'use client'

import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { T } from './design-system'
import { truncateAddress } from '@/lib/ens'

export function WalletButton() {
  const { address, isConnected } = useAccount()
  const { connect } = useConnect()
  const { disconnect } = useDisconnect()

  if (isConnected && address) {
    return (
      <button
        onClick={() => disconnect()}
        style={{
          background: T.accentLight, border: `1px solid ${T.accent}`, borderRadius: 3,
          padding: '7px 16px', fontFamily: T.codeFont, fontSize: 10,
          letterSpacing: '0.08em', color: T.accent, cursor: 'pointer',
        }}
      >
        {truncateAddress(address)}
      </button>
    )
  }

  return (
    <button
      onClick={() => connect({ connector: injected() })}
      style={{
        background: T.accentLight, border: `1px solid ${T.accent}`, borderRadius: 3,
        padding: '7px 16px', fontFamily: T.codeFont, fontSize: 10,
        letterSpacing: '0.08em', color: T.accent, cursor: 'pointer',
      }}
    >
      CONNECT WALLET
    </button>
  )
}
