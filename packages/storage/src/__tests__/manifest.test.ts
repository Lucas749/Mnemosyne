import { describe, it, expect, beforeAll } from 'vitest'
import type { StorageClient } from '../client.js'
import { createStorageClient } from '../client.js'
import { uploadManifest, downloadManifest, addEntryToManifest, updateEntryStatus, activeEntries } from '../manifest.js'
import type { MemoryManifest, ManifestEntry } from '@mnemosyne/types'

const PRIVATE_KEY = process.env['ZG_PRIVATE_KEY']
const RUN = !!PRIVATE_KEY

let client: StorageClient

const TEST_MANIFEST: MemoryManifest = {
  owner:     'test.mnemosyne.eth',
  updatedAt: 1714000000,
  entries:   [],
}

const TEST_MANIFEST_ENTRY: ManifestEntry = {
  entryId:      '0xtest-entry-001',
  storageRef:   '0xstorage-ref-placeholder',
  embeddingRef: '0xembedding-ref-placeholder',
  domain:       'factual',
  status:       'active',
  tags:         ['ethereum', 'history'],
  submittedAt:  1714000000,
}

describe('manifest', () => {
  beforeAll(() => {
    if (!RUN) return
    client = createStorageClient({ privateKey: PRIVATE_KEY! })
  })

  describe('round-trip: upload then download', () => {
    it('downloaded manifest matches uploaded manifest', { skip: !RUN }, async () => {
      const ref      = await uploadManifest(client, TEST_MANIFEST)
      const received = await downloadManifest(client, ref)

      expect(received.owner).toBe(TEST_MANIFEST.owner)
      expect(received.entries).toHaveLength(0)
    })
  })

  describe('addEntryToManifest', () => {
    it('creates a new manifest when currentManifestRef is null', { skip: !RUN }, async () => {
      const ref      = await addEntryToManifest(client, null, 'test.mnemosyne.eth', TEST_MANIFEST_ENTRY)
      const received = await downloadManifest(client, ref)

      expect(received.entries).toHaveLength(1)
      expect(received.entries[0]!.entryId).toBe(TEST_MANIFEST_ENTRY.entryId)
      expect(received.updatedAt).toBeGreaterThan(0)
    })

    it('appends to an existing manifest', { skip: !RUN }, async () => {
      const ref1 = await addEntryToManifest(client, null, 'test.mnemosyne.eth', TEST_MANIFEST_ENTRY)

      const secondEntry: ManifestEntry = { ...TEST_MANIFEST_ENTRY, entryId: '0xtest-entry-002' }
      const ref2     = await addEntryToManifest(client, ref1, 'test.mnemosyne.eth', secondEntry)
      const received = await downloadManifest(client, ref2)

      expect(received.entries).toHaveLength(2)
    })
  })

  describe('updateEntryStatus', () => {
    it('burns an entry and returns a new manifest ref', { skip: !RUN }, async () => {
      const ref1     = await addEntryToManifest(client, null, 'test.mnemosyne.eth', TEST_MANIFEST_ENTRY)
      const ref2     = await updateEntryStatus(client, ref1, TEST_MANIFEST_ENTRY.entryId, 'burned')
      const received = await downloadManifest(client, ref2)

      expect(received.entries[0]!.status).toBe('burned')
    })

    it('throws if entryId is not found in manifest', { skip: !RUN }, async () => {
      const ref = await uploadManifest(client, TEST_MANIFEST)
      await expect(updateEntryStatus(client, ref, '0xdoes-not-exist', 'burned')).rejects.toThrow()
    })
  })

  describe('activeEntries', () => {
    it('filters out burned and pending entries', () => {
      const manifest: MemoryManifest = {
        owner:     'test.mnemosyne.eth',
        updatedAt: 0,
        entries: [
          { ...TEST_MANIFEST_ENTRY, entryId: '0x1', status: 'active' },
          { ...TEST_MANIFEST_ENTRY, entryId: '0x2', status: 'burned' },
          { ...TEST_MANIFEST_ENTRY, entryId: '0x3', status: 'pending' },
          { ...TEST_MANIFEST_ENTRY, entryId: '0x4', status: 'active' },
        ],
      }

      const result = activeEntries(manifest)
      expect(result).toHaveLength(2)
      expect(result.map(e => e.entryId)).toEqual(['0x1', '0x4'])
    })
  })
})
