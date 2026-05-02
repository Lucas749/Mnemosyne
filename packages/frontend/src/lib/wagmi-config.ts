'use client'

import { createConfig, http } from 'wagmi'
import { injected, metaMask, walletConnect } from 'wagmi/connectors'
import { zgTestnet, sepolia } from './chains'

const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? '3a8170812b534d0ff9d794f19a901d64'

export const wagmiConfig = createConfig({
  chains: [zgTestnet, sepolia],
  // injected() with no target uses EIP-6963 multi-wallet discovery in wagmi v3,
  // which auto-detects MetaMask, Phantom, and any other installed wallets.
  connectors: [
    metaMask(),
    injected({ target: 'phantom' }),
  ],
  transports: {
    [zgTestnet.id]: http('https://evmrpc-testnet.0g.ai'),
    [sepolia.id]: http('https://1rpc.io/sepolia'),
  },
})
