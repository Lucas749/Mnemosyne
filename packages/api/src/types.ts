import type { EntryDomain } from '@mnemosyne/types'

export interface StoreRequest {
  content: string
  domain?: EntryDomain
  tags?: string[]
  submittedBy?: string
}

export interface StoreResponse {
  entryId: string
  storageRef: string
  embeddingRef: string
  manifestRef?: string
  /** On-chain bytes32 entryId from MnemosyneRegistry (set when ZG_PRIVATE_KEY is configured). */
  onchainId?: string
}

export interface QueryRequest {
  text: string
  topK?: number
  domains?: EntryDomain[]
  scope?: string
}

export interface QueryMatch {
  entryId: string
  content: string
  similarity: number
  storageRef: string
  tags: string[]
  domain?: EntryDomain
  submittedBy?: string
}

export interface QueryResponse {
  matches: QueryMatch[]
}
