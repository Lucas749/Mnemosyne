import 'dotenv/config'
import { describe, it, expect, beforeAll } from 'vitest'
import type { StorageClient } from '../client.js'
import { createStorageClient } from '../client.js'
import { uploadEntryBlob, downloadEntryBlob, uploadEmbeddingBlob, downloadEmbeddingBlob } from '../entry.js'
import type { EntryBlob, EmbeddingBlob } from '@mnemosyne/types'

const PRIVATE_KEY = process.env['ZG_PRIVATE_KEY']
const RUN = !!PRIVATE_KEY

let client: StorageClient

const TEST_ENTRY: EntryBlob = {
  id:          '0xtest-entry-001',
  content:     'The Ethereum merge happened on September 15, 2022.',
  domain:      'factual',
  tags:        ['ethereum', 'history', 'consensus'],
  sources:     ['https://ethereum.org/en/roadmap/merge/'],
  submittedBy: 'test.mnemosyne.eth',
  submittedAt: 1714000000,
  checksum:    '0xchecksum-placeholder',
}

const TEST_EMBEDDING: EmbeddingBlob = {
  entryId:    '0xtest-entry-001',
  model:      'text-embedding-3-small',
  vector:     Array.from({ length: 8 }, (_, i) => i * 0.1),  // tiny test vector
  dimensions: 8,
}

describe('entry blobs', () => {
  beforeAll(() => {
    if (!RUN) return
    client = createStorageClient({ privateKey: PRIVATE_KEY! })
  })

  describe('uploadEntryBlob', () => {
    it('uploads and returns a non-empty rootHash', { skip: !RUN }, async () => {
      const ref = await uploadEntryBlob(client, TEST_ENTRY)
      expect(ref).toBeTruthy()
      expect(typeof ref).toBe('string')
    })
  })

  describe('round-trip: upload then download', () => {
    it('downloaded entry content matches uploaded content', { skip: !RUN }, async () => {
      const ref      = await uploadEntryBlob(client, TEST_ENTRY)
      const received = await downloadEntryBlob(client, ref)

      expect(received.id).toBe(TEST_ENTRY.id)
      expect(received.content).toBe(TEST_ENTRY.content)
      expect(received.domain).toBe(TEST_ENTRY.domain)
      expect(received.tags).toEqual(TEST_ENTRY.tags)
      expect(received.submittedBy).toBe(TEST_ENTRY.submittedBy)
    })
  })

  describe('uploadEmbeddingBlob', () => {
    it('uploads embedding and returns a non-empty rootHash', { skip: !RUN }, async () => {
      const ref = await uploadEmbeddingBlob(client, TEST_EMBEDDING)
      expect(ref).toBeTruthy()
      expect(typeof ref).toBe('string')
    })
  })

  describe('round-trip: embedding upload then download', () => {
    it('downloaded embedding matches uploaded vector', { skip: !RUN }, async () => {
      const ref      = await uploadEmbeddingBlob(client, TEST_EMBEDDING)
      const received = await downloadEmbeddingBlob(client, ref)

      expect(received.entryId).toBe(TEST_EMBEDDING.entryId)
      expect(received.model).toBe(TEST_EMBEDDING.model)
      expect(received.dimensions).toBe(TEST_EMBEDDING.dimensions)
      expect(received.vector).toEqual(TEST_EMBEDDING.vector)
    })
  })
})
