import { MemData } from '@0gfoundation/0g-ts-sdk'
import type { EntryBlob, EmbeddingBlob } from '@mnemosyne/types'
import type { StorageClient } from './client.js'

const enc = new TextEncoder()
const dec = new TextDecoder()

// ─── Upload ───────────────────────────────────────────────────────────────────

// TODO: callers should populate blob.checksum = keccak256(content) before calling this
export async function uploadEntryBlob(
  client: StorageClient,
  blob: EntryBlob,
): Promise<string> {
  const data    = enc.encode(JSON.stringify(blob))
  const memData = new MemData(data)

  const [tx, err] = await client.indexer.upload(memData, client.rpcUrl, client.signer)
  if (err !== null) throw new Error(`0G upload failed: ${err}`)

  const rootHash = 'rootHash' in tx ? tx.rootHash : tx.rootHashes[0]
  if (!rootHash) throw new Error('0G upload returned no root hash')

  return rootHash
}

export async function uploadEmbeddingBlob(
  client: StorageClient,
  blob: EmbeddingBlob,
): Promise<string> {
  const data    = enc.encode(JSON.stringify(blob))
  const memData = new MemData(data)

  const [tx, err] = await client.indexer.upload(memData, client.rpcUrl, client.signer)
  if (err !== null) throw new Error(`0G embedding upload failed: ${err}`)

  const rootHash = 'rootHash' in tx ? tx.rootHash : tx.rootHashes[0]
  if (!rootHash) throw new Error('0G embedding upload returned no root hash')

  return rootHash
}

// ─── Download ─────────────────────────────────────────────────────────────────

export async function downloadEntryBlob(
  client: StorageClient,
  storageRef: string,
): Promise<EntryBlob> {
  const [blob, err] = await client.indexer.downloadToBlob(storageRef, { proof: true })
  if (err !== null) throw new Error(`0G download failed: ${err}`)

  const text = dec.decode(await (blob as Blob).arrayBuffer())
  return JSON.parse(text) as EntryBlob
}

export async function downloadEmbeddingBlob(
  client: StorageClient,
  embeddingRef: string,
): Promise<EmbeddingBlob> {
  const [blob, err] = await client.indexer.downloadToBlob(embeddingRef, { proof: true })
  if (err !== null) throw new Error(`0G embedding download failed: ${err}`)

  const text = dec.decode(await (blob as Blob).arrayBuffer())
  return JSON.parse(text) as EmbeddingBlob
}
