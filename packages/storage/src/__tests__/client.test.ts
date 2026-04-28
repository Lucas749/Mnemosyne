import 'dotenv/config'
import { describe, it, expect } from 'vitest'
import { createStorageClient } from '../client.js'

const PRIVATE_KEY = process.env['ZG_PRIVATE_KEY']

describe('createStorageClient', () => {
  it('throws if private key is missing', () => {
    expect(() => createStorageClient({ privateKey: '' })).toThrow()
  })

  it('returns a client with indexer and signer', { skip: !PRIVATE_KEY }, () => {
    const client = createStorageClient({ privateKey: PRIVATE_KEY! })
    expect(client.indexer).toBeDefined()
    expect(client.signer).toBeDefined()
    expect(client.rpcUrl).toBe('https://evmrpc-testnet.0g.ai')
  })

  it('respects custom rpcUrl and indexerRpc', { skip: !PRIVATE_KEY }, () => {
    const client = createStorageClient({
      privateKey: PRIVATE_KEY!,
      rpcUrl:     'https://custom-rpc.example.com',
      indexerRpc: 'https://custom-indexer.example.com',
    })
    expect(client.rpcUrl).toBe('https://custom-rpc.example.com')
  })
})
