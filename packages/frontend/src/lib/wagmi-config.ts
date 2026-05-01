'use client'

import { createConfig, http } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { zgTestnet, sepolia } from './chains'

export const wagmiConfig = createConfig({
  chains: [zgTestnet, sepolia],
  connectors: [injected()],
  transports: {
    [zgTestnet.id]: http('https://evmrpc-testnet.0g.ai'),
    [sepolia.id]: http('https://1rpc.io/sepolia'),
  },
})
