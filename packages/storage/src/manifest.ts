import { MemData } from '@0gfoundation/0g-ts-sdk'
import type { MemoryManifest, ManifestEntry, EntryStatus } from '@mnemosyne/types'
import type { StorageClient } from './client.js'

const enc = new TextEncoder()
const dec = new TextDecoder()

// ─── Upload ───────────────────────────────────────────────────────────────────

export async function uploadManifest(
  client: StorageClient,
  manifest: MemoryManifest,
): Promise<string> {
  const data    = enc.encode(JSON.stringify(manifest))
  const memData = new MemData(data)

  const [tx, err] = await client.indexer.upload(memData, client.rpcUrl, client.signer)
  if (err !== null) throw new Error(`0G manifest upload failed: ${err}`)

  const rootHash = 'rootHash' in tx ? tx.rootHash : tx.rootHashes[0]
  if (!rootHash) throw new Error('0G manifest upload returned no root hash')

  return rootHash
}

// ─── Download ─────────────────────────────────────────────────────────────────

export async function downloadManifest(
  client: StorageClient,
  manifestRef: string,
): Promise<MemoryManifest> {
  const [blob, err] = await client.indexer.downloadToBlob(manifestRef, { proof: true })
  if (err !== null) throw new Error(`0G manifest download failed: ${err}`)

  const text = dec.decode(await (blob as Blob).arrayBuffer())
  return JSON.parse(text) as MemoryManifest
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Add a new entry to a manifest and upload the updated version.
// Returns the new manifest rootHash — caller must update the ENS text record.
export async function addEntryToManifest(
  client: StorageClient,
  currentManifestRef: string | null,
  owner: string,
  newEntry: ManifestEntry,
): Promise<string> {
  const manifest: MemoryManifest = currentManifestRef
    ? await downloadManifest(client, currentManifestRef)
    : { owner, updatedAt: 0, entries: [] }

  manifest.entries.push(newEntry)
  manifest.updatedAt = Math.floor(Date.now() / 1000)

  return uploadManifest(client, manifest)
}

// Update the status of an entry inside a manifest (e.g. active → burned).
// Returns the new manifest rootHash — caller must update the ENS text record.
export async function updateEntryStatus(
  client: StorageClient,
  currentManifestRef: string,
  entryId: string,
  status: EntryStatus,
): Promise<string> {
  const manifest = await downloadManifest(client, currentManifestRef)

  const entry = manifest.entries.find(e => e.entryId === entryId)
  if (!entry) throw new Error(`Entry ${entryId} not found in manifest`)

  entry.status       = status
  manifest.updatedAt = Math.floor(Date.now() / 1000)

  return uploadManifest(client, manifest)
}

// Return only active entries from a manifest.
export function activeEntries(manifest: MemoryManifest): ManifestEntry[] {
  return manifest.entries.filter(e => e.status === 'active')
}
