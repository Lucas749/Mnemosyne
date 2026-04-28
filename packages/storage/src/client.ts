import { Indexer } from '@0gfoundation/0g-ts-sdk'
import { ethers } from 'ethers'

export const ZG_RPC_URL     = 'https://evmrpc-testnet.0g.ai'
export const ZG_INDEXER_RPC = 'https://indexer-storage-testnet-turbo.0g.ai'

export interface StorageClientConfig {
  privateKey: string
  rpcUrl?:     string
  indexerRpc?: string
}

export interface StorageClient {
  indexer: Indexer
  signer:  ethers.Wallet
  rpcUrl:  string
}

export function createStorageClient(config: StorageClientConfig): StorageClient {
  const rpcUrl  = config.rpcUrl     ?? ZG_RPC_URL
  const idxRpc  = config.indexerRpc ?? ZG_INDEXER_RPC

  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const signer   = new ethers.Wallet(config.privateKey, provider)
  const indexer  = new Indexer(idxRpc)

  return { indexer, signer, rpcUrl }
}
