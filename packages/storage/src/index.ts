export { createStorageClient, ZG_RPC_URL, ZG_INDEXER_RPC } from './client.js'
export type { StorageClient, StorageClientConfig } from './client.js'

export { uploadEntryBlob, downloadEntryBlob, uploadEmbeddingBlob, downloadEmbeddingBlob } from './entry.js'
export { uploadManifest, downloadManifest, addEntryToManifest, updateEntryStatus, activeEntries } from './manifest.js'
