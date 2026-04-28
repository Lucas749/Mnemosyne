import { createPublicClient, createWalletClient, http } from 'viem'
import { sepolia } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { addEnsContracts } from '@ensdomains/ensjs'
import { getTextRecord } from '@ensdomains/ensjs/public'
import { setTextRecord } from '@ensdomains/ensjs/wallet'

const MEMORY_INDEX_KEY = 'memory.index'
const PAYMENT_TOKEN_KEY = 'payment.token'

export interface IdentityOptions {
  /** Ethereum JSON-RPC URL (defaults to ENS_RPC_URL env or public Sepolia) */
  rpcUrl?: string
}

const DEFAULT_RPC = 'https://rpc.sepolia.org'

function rpc(options: IdentityOptions) {
  return options.rpcUrl ?? process.env.ENS_RPC_URL ?? DEFAULT_RPC
}

function makePublicClient(rpcUrl: string) {
  return createPublicClient({
    chain: addEnsContracts(sepolia),
    transport: http(rpcUrl),
  })
}

function makeWalletClient(privateKey: `0x${string}`, rpcUrl: string) {
  const account = privateKeyToAccount(privateKey)
  return createWalletClient({
    chain: addEnsContracts(sepolia),
    transport: http(rpcUrl),
    account,
  })
}

/** Read memory.index text record from an ENS name (→ 0G manifest rootHash). */
export async function getMemoryIndex(
  name: string,
  options: IdentityOptions = {},
): Promise<string | null> {
  const client = makePublicClient(rpc(options))
  return getTextRecord(client, { name, key: MEMORY_INDEX_KEY })
}

/**
 * Write memory.index text record for an ENS name.
 * @returns transaction hash
 */
export async function setMemoryIndex(
  privateKey: `0x${string}`,
  name: string,
  manifestRef: string,
  options: IdentityOptions = {},
): Promise<`0x${string}`> {
  const client = makeWalletClient(privateKey, rpc(options))
  return setTextRecord(client, {
    name,
    key: MEMORY_INDEX_KEY,
    value: manifestRef,
    account: client.account,
  })
}

/** Read payment.token text record from an ENS name (→ ERC-20 contract address). */
export async function getPaymentToken(
  name: string,
  options: IdentityOptions = {},
): Promise<string | null> {
  const client = makePublicClient(rpc(options))
  return getTextRecord(client, { name, key: PAYMENT_TOKEN_KEY })
}

/**
 * Write payment.token text record for an ENS name.
 * @returns transaction hash
 */
export async function setPaymentToken(
  privateKey: `0x${string}`,
  name: string,
  token: string,
  options: IdentityOptions = {},
): Promise<`0x${string}`> {
  const client = makeWalletClient(privateKey, rpc(options))
  return setTextRecord(client, {
    name,
    key: PAYMENT_TOKEN_KEY,
    value: token,
    account: client.account,
  })
}
