import type { EntryDomain } from '@mnemosyne/types'

// The OpenClaw-compatible memory interface that any agent framework can implement against.
export interface MemoryAdapter {
  store(content: string, opts?: StoreOptions): Promise<StoreResult>
  query(text: string, topK?: number): Promise<MemoryHit[]>
  loadFromManifest(manifestRef: string): Promise<void>
}

export interface StoreOptions {
  entryId?: string
  domain?:  EntryDomain
  tags?:    string[]
}

export interface StoreResult {
  entryId:      string
  storageRef:   string
  embeddingRef: string
}

export interface MemoryHit {
  entryId:    string
  content:    string
  similarity: number   // cosine similarity 0–1
  storageRef: string
  tags:       string[]
  domain?:    EntryDomain
}
