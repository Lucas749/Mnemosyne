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
  submitTxHash?: string
}

export interface QueryRequest {
  text: string
  topK?: number
  domains?: EntryDomain[]
  scope?: string
  queriedBy?: string  // ENS name or address of the querying agent — tracked on-chain via authorizeUsage
}

export interface QueryMatch {
  entryId: string
  similarity: number
  storageRef: string
  tags: string[]
  domain?: EntryDomain
  submittedBy?: string
  submitterAddress?: string
  hasContent: boolean   // content available via POST /unlock
}

export interface UnlockResponse {
  entryId: string
  content: string        // decrypted Markdown
  submittedBy?: string
  domain?: EntryDomain
  tags: string[]
  paymentConfirmed: boolean
}

export interface QueryResponse {
  matches: QueryMatch[]
}
