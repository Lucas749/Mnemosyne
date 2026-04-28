import type { EntryDomain } from '@mnemosyne/types'

export interface StoreRequest {
  content: string
  domain?: EntryDomain
  tags?: string[]
  submittedBy?: string   // ENS name or identifier
}

export interface StoreResponse {
  entryId: string
  storageRef: string
  embeddingRef: string
  /** Set when submittedBy is an ENS name and ENS_PRIVATE_KEY is configured. */
  manifestRef?: string
}

export interface QueryRequest {
  text: string
  topK?: number
  domains?: EntryDomain[]
  scope?: string          // ENS name to scope to one agent's memory
}

export interface QueryMatch {
  entryId: string
  content: string
  similarity: number
  storageRef: string
  tags: string[]
  domain?: EntryDomain
}

export interface QueryResponse {
  matches: QueryMatch[]
}
