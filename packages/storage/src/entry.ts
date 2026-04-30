import { createCipheriv, createDecipheriv, randomBytes, createHmac } from 'node:crypto'
import { MemData } from '@0gfoundation/0g-ts-sdk'
import type { EntryBlob, EmbeddingBlob } from '@mnemosyne/types'
import type { StorageClient } from './client.js'

const enc = new TextEncoder()
const dec = new TextDecoder()

// ─── Encryption ───────────────────────────────────────────────────────────────
// AES-256-GCM: entry blobs are encrypted before upload so 0G stores ciphertext.
// Key is derived per-entry from the operator secret + entryId (symmetric — only
// the API server can decrypt). Full ERC-7857 key-sealing/TEE-oracle is a post-
// hackathon milestone.

function deriveKey(entryId: string): Buffer {
  const secret = process.env.ZG_PRIVATE_KEY ?? 'mnemosyne-dev-secret'
  return createHmac('sha256', secret).update(entryId).digest()
}

function encrypt(plaintext: Uint8Array, entryId: string): Buffer {
  const key = deriveKey(entryId)
  const iv  = randomBytes(12) // 96-bit nonce for GCM
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  // Layout: [iv(12)] [tag(16)] [ciphertext]
  return Buffer.concat([iv, tag, ciphertext])
}

function decrypt(cipherbuf: Buffer, entryId: string): Buffer {
  const key        = deriveKey(entryId)
  const iv         = cipherbuf.subarray(0, 12)
  const tag        = cipherbuf.subarray(12, 28)
  const ciphertext = cipherbuf.subarray(28)
  const decipher   = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

// ─── Upload ───────────────────────────────────────────────────────────────────

export async function uploadEntryBlob(client: StorageClient, blob: EntryBlob): Promise<string> {
  const plaintext = enc.encode(JSON.stringify(blob))
  const payload   = encrypt(plaintext, blob.id)
  const memData   = new MemData(new Uint8Array(payload))

  const [tx, err] = await client.indexer.upload(memData, client.rpcUrl, client.signer)
  if (err !== null) throw new Error(`0G upload failed: ${err}`)

  const rootHash = 'rootHash' in tx ? tx.rootHash : tx.rootHashes[0]
  if (!rootHash) throw new Error('0G upload returned no root hash')
  return rootHash
}

export async function uploadEmbeddingBlob(client: StorageClient, blob: EmbeddingBlob): Promise<string> {
  const data    = enc.encode(JSON.stringify(blob))
  const memData = new MemData(data)

  const [tx, err] = await client.indexer.upload(memData, client.rpcUrl, client.signer)
  if (err !== null) throw new Error(`0G embedding upload failed: ${err}`)

  const rootHash = 'rootHash' in tx ? tx.rootHash : tx.rootHashes[0]
  if (!rootHash) throw new Error('0G embedding upload returned no root hash')
  return rootHash
}

// ─── Download ─────────────────────────────────────────────────────────────────

export async function downloadEntryBlob(client: StorageClient, storageRef: string, entryId: string): Promise<EntryBlob> {
  const [blob, err] = await client.indexer.downloadToBlob(storageRef, { proof: true })
  if (err !== null) throw new Error(`0G download failed: ${err}`)

  const raw       = Buffer.from(await (blob as Blob).arrayBuffer())
  const plaintext = decrypt(raw, entryId)
  return JSON.parse(dec.decode(plaintext)) as EntryBlob
}

export async function downloadEmbeddingBlob(client: StorageClient, embeddingRef: string): Promise<EmbeddingBlob> {
  const [blob, err] = await client.indexer.downloadToBlob(embeddingRef, { proof: true })
  if (err !== null) throw new Error(`0G embedding download failed: ${err}`)

  const text = dec.decode(await (blob as Blob).arrayBuffer())
  return JSON.parse(text) as EmbeddingBlob
}
