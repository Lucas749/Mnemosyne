import { createPublicClient, http } from 'viem'
import { normalize } from 'viem/ens'
import { sepolia } from './chains'

export const sepoliaClient = createPublicClient({
  chain: sepolia,
  transport: http('https://1rpc.io/sepolia'),
})

export async function resolveEnsAddress(name: string): Promise<`0x${string}` | null> {
  try {
    return await sepoliaClient.getEnsAddress({ name: normalize(name) })
  } catch {
    return null
  }
}

export async function resolveAddressToEns(address: `0x${string}`): Promise<string | null> {
  try {
    return await sepoliaClient.getEnsName({ address })
  } catch {
    return null
  }
}

export async function getEnsText(name: string, key: string): Promise<string | null> {
  try {
    return await sepoliaClient.getEnsText({ name: normalize(name), key })
  } catch {
    return null
  }
}

export function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function formatA0GI(wei: bigint): string {
  const eth = Number(wei) / 1e18
  return eth.toFixed(4)
}
