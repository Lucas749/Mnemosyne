import Database from 'better-sqlite3'

const DB_PATH = process.env.DB_PATH ?? './mnemosyne.db'
const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS entries (
    entry_id      TEXT PRIMARY KEY,
    storage_ref   TEXT,
    tags          TEXT,
    domain        TEXT,
    submitter     TEXT,
    status        INTEGER DEFAULT 0,
    content       TEXT,
    submitted_at  INTEGER,
    inft_token_id TEXT DEFAULT '0',
    submit_tx_hash TEXT
  );

  CREATE TABLE IF NOT EXISTS discussions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id   TEXT    NOT NULL,
    author     TEXT    NOT NULL,
    content    TEXT    NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS discussions_entry ON discussions(entry_id);
`)

// Migrate: rename content_preview → content if old schema
try {
  db.exec(`ALTER TABLE entries ADD COLUMN content TEXT`)
} catch { /* column already exists */ }
try {
  db.exec(`UPDATE entries SET content = content_preview WHERE content IS NULL AND content_preview IS NOT NULL`)
} catch { /* column may not exist */ }
try {
  db.exec(`ALTER TABLE entries ADD COLUMN submit_tx_hash TEXT`)
} catch { /* column already exists */ }
try {
  db.exec(`ALTER TABLE entries ADD COLUMN encryption_entry_id TEXT`)
} catch { /* column already exists */ }


try {
  db.exec(`ALTER TABLE entries ADD COLUMN submitter_wallet TEXT`)
} catch { /* column exists */ }


interface EntryRow {
  entry_id: string
  storage_ref: string | null
  tags: string | null
  domain: string | null
  submitter: string | null
  submitter_wallet: string | null
  status: number
  content: string | null
  submitted_at: number | null
  inft_token_id: string
  submit_tx_hash: string | null
  encryption_entry_id: string | null
}

interface DiscussionRow {
  id: number
  entry_id: string
  author: string
  content: string
  created_at: number
}

function parseEntry(row: EntryRow) {
  return {
    entryId:        row.entry_id,
    storageRef:     row.storage_ref,
    tags:           row.tags ? (JSON.parse(row.tags) as string[]) : [],
    domain:         row.domain,
    submitter:      row.submitter,
    status:         row.status,
    content:        row.content,
    contentPreview: row.content ? row.content.slice(0, 500) : null,
    submittedAt:    row.submitted_at,
    inftTokenId:    row.inft_token_id,
    submitTxHash:   row.submit_tx_hash,
    submitterWallet: row.submitter_wallet,
    encryptionEntryId: row.encryption_entry_id ?? row.entry_id,
  }
}

/** Entry IDs whose API attribution wallet matches (fixes operator-submitted txs where on-chain submitter ≠ user). */
export function getEntryIdsByAttributionWallet(wallet: string): string[] {
  const w = wallet.trim().toLowerCase()
  if (!/^0x[a-f0-9]{40}$/.test(w)) return []
  const rows = db.prepare(
    `SELECT entry_id FROM entries 
     WHERE lower(trim(submitter_wallet)) = ? 
        OR (submitter_wallet IS NULL AND trim(submitter) LIKE '0x%' AND lower(trim(submitter)) = ?)
     ORDER BY submitted_at DESC`,
  ).all(w, w) as { entry_id: string }[]
  return rows.map(r => r.entry_id)
}

export function getDbEntry(entryIdOrDecryptKey: string) {
  const row = db.prepare(
    `SELECT * FROM entries WHERE entry_id = ? OR encryption_entry_id = ?`,
  ).get(entryIdOrDecryptKey, entryIdOrDecryptKey) as EntryRow | undefined
  return row ? parseEntry(row) : null
}

const stmtUpsert = db.prepare(`
  INSERT INTO entries (entry_id, storage_ref, tags, domain, submitter, submitter_wallet, status, content, submitted_at, inft_token_id, submit_tx_hash, encryption_entry_id)
  VALUES (@entry_id, @storage_ref, @tags, @domain, @submitter, @submitter_wallet, @status, @content, @submitted_at, @inft_token_id, @submit_tx_hash, @encryption_entry_id)
  ON CONFLICT(entry_id) DO UPDATE SET
    storage_ref   = COALESCE(excluded.storage_ref,  storage_ref),
    tags          = COALESCE(excluded.tags,          tags),
    domain        = COALESCE(excluded.domain,        domain),
    submitter     = COALESCE(excluded.submitter,     submitter),
    submitter_wallet = COALESCE(excluded.submitter_wallet, submitter_wallet),
    status        = COALESCE(excluded.status,        status),
    content       = COALESCE(excluded.content,       content),
    submitted_at  = COALESCE(excluded.submitted_at,  submitted_at),
    inft_token_id = COALESCE(excluded.inft_token_id, inft_token_id),
    submit_tx_hash = COALESCE(excluded.submit_tx_hash, submit_tx_hash),
    encryption_entry_id = COALESCE(excluded.encryption_entry_id, encryption_entry_id)
`)

export function upsertEntry(entryId: string, data: {
  storageRef?:  string | null
  tags?:        string[]
  domain?:      string | null
  submitter?:   string | null
  submitterWallet?: string | null
  status?:      number | null
  content?:     string | null
  submittedAt?: number | null
  inftTokenId?: string | null
  submitTxHash?: string | null
  encryptionEntryId?: string | null
}) {
  stmtUpsert.run({
    entry_id:     entryId,
    storage_ref:  data.storageRef  ?? null,
    tags:         data.tags != null ? JSON.stringify(data.tags) : null,
    domain:       data.domain      ?? null,
    submitter:    data.submitter   ?? null,
    submitter_wallet: data.submitterWallet ?? null,
    status:       data.status      ?? null,
    content:      data.content     ?? null,
    submitted_at: data.submittedAt ?? null,
    inft_token_id: data.inftTokenId ?? null,
    submit_tx_hash: data.submitTxHash ?? null,
    encryption_entry_id: data.encryptionEntryId ?? null,
  })
}

export function getAllDbEntries() {
  const rows = db.prepare('SELECT * FROM entries ORDER BY submitted_at DESC').all() as EntryRow[]
  return rows.map(parseEntry)
}

/** Move SQLite PK from upload-time id → on-chain bytes32; keeps discussions FK aligned. */
export function migrateEntryPrimaryKey(
  fromId: string,
  toId: string,
  submitTxHash: string,
): { ok: true } | { ok: false; reason: string } {
  if (fromId === toId) {
    if (submitTxHash) {
      db.prepare('UPDATE entries SET submit_tx_hash = ? WHERE entry_id = ?').run(submitTxHash, toId)
    }
    return { ok: true }
  }
  const rowFrom = db.prepare('SELECT entry_id FROM entries WHERE entry_id = ?').get(fromId) as { entry_id: string } | undefined
  if (!rowFrom) return { ok: false, reason: `no row entry_id=${fromId}` }

  const rowTo = db.prepare('SELECT entry_id FROM entries WHERE entry_id = ?').get(toId) as { entry_id: string } | undefined
  if (rowTo) return { ok: false, reason: `collision entry_id=${toId} exists` }

  try {
    const txn = db.transaction(() => {
      db.prepare(`UPDATE discussions SET entry_id = @toId WHERE entry_id = @fromId`).run({ toId, fromId })
      db.prepare(
        `UPDATE entries SET entry_id = @toId, submit_tx_hash = @submitTxHash WHERE entry_id = @fromId`,
      ).run({ toId, fromId, submitTxHash })
    })
    txn()
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
  return { ok: true }
}

export function deleteEntry(entryId: string) {
  return db.prepare('DELETE FROM entries WHERE entry_id = ?').run(entryId)
}

export function addDiscussion(entryId: string, author: string, content: string) {
  return db.prepare(
    'INSERT INTO discussions (entry_id, author, content, created_at) VALUES (?, ?, ?, ?)'
  ).run(entryId, author, content, Date.now())
}

export function getDiscussions(entryId: string) {
  return db.prepare(
    'SELECT * FROM discussions WHERE entry_id = ? ORDER BY created_at ASC'
  ).all(entryId) as DiscussionRow[]
}
