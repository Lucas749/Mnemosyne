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
    inft_token_id TEXT DEFAULT '0'
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


interface EntryRow {
  entry_id: string
  storage_ref: string | null
  tags: string | null
  domain: string | null
  submitter: string | null
  status: number
  content: string | null
  submitted_at: number | null
  inft_token_id: string
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
  }
}

const stmtUpsert = db.prepare(`
  INSERT INTO entries (entry_id, storage_ref, tags, domain, submitter, status, content, submitted_at, inft_token_id)
  VALUES (@entry_id, @storage_ref, @tags, @domain, @submitter, @status, @content, @submitted_at, @inft_token_id)
  ON CONFLICT(entry_id) DO UPDATE SET
    storage_ref   = COALESCE(excluded.storage_ref,  storage_ref),
    tags          = COALESCE(excluded.tags,          tags),
    domain        = COALESCE(excluded.domain,        domain),
    submitter     = COALESCE(excluded.submitter,     submitter),
    status        = COALESCE(excluded.status,        status),
    content       = COALESCE(excluded.content,       content),
    submitted_at  = COALESCE(excluded.submitted_at,  submitted_at),
    inft_token_id = COALESCE(excluded.inft_token_id, inft_token_id)
`)

export function upsertEntry(entryId: string, data: {
  storageRef?:  string | null
  tags?:        string[]
  domain?:      string | null
  submitter?:   string | null
  status?:      number | null
  content?:     string | null
  submittedAt?: number | null
  inftTokenId?: string | null
}) {
  stmtUpsert.run({
    entry_id:     entryId,
    storage_ref:  data.storageRef  ?? null,
    tags:         data.tags != null ? JSON.stringify(data.tags) : null,
    domain:       data.domain      ?? null,
    submitter:    data.submitter   ?? null,
    status:       data.status      ?? null,
    content:      data.content     ?? null,
    submitted_at: data.submittedAt ?? null,
    inft_token_id: data.inftTokenId ?? null,
  })
}

export function getDbEntry(entryId: string) {
  const row = db.prepare('SELECT * FROM entries WHERE entry_id = ?').get(entryId) as EntryRow | undefined
  return row ? parseEntry(row) : null
}

export function getAllDbEntries() {
  const rows = db.prepare('SELECT * FROM entries ORDER BY submitted_at DESC').all() as EntryRow[]
  return rows.map(parseEntry)
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
