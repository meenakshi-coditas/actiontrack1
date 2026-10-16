import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { StoreError } from './errors.js';

// Ordered, append-only migrations. The applied version is kept in PRAGMA user_version.
const MIGRATIONS = [
  `
  CREATE TABLE people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    name_key TEXT NOT NULL UNIQUE,
    email TEXT,                                 -- from note attendee lists (trusted contact source)
    email_conflict INTEGER NOT NULL DEFAULT 0   -- 1 when notes list different addresses for this name
  );
  CREATE TABLE tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,       -- stable task ID
    owner_name TEXT,                            -- full name when resolved, else the raw mention
    owner_status TEXT NOT NULL CHECK (owner_status IN ('resolved','ambiguous','unknown','none')),
    owner_mention TEXT,                         -- owner text exactly as written in the note
    owner_candidates TEXT NOT NULL DEFAULT '[]',
    description TEXT NOT NULL,
    description_key TEXT NOT NULL,
    due_date TEXT,                              -- YYYY-MM-DD or NULL (unknown)
    due_raw TEXT,                               -- unparsed/ambiguous due text kept for reporting
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
    completed_at TEXT,
    completed_by TEXT CHECK (completed_by IN ('cli','note')),
    first_meeting TEXT NOT NULL,
    last_meeting TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_tasks_status ON tasks(status);
  CREATE INDEX idx_tasks_due ON tasks(due_date);
  CREATE INDEX idx_tasks_owner ON tasks(owner_name);
  CREATE TABLE task_sources (                   -- every note line that mentions the task (duplicate history)
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    file TEXT NOT NULL,
    line INTEGER NOT NULL,
    slot INTEGER NOT NULL DEFAULT 0,
    meeting_date TEXT NOT NULL,
    checked INTEGER NOT NULL DEFAULT 0,
    original_text TEXT,
    ingested_at TEXT NOT NULL,
    UNIQUE (file, line, slot)
  );
  CREATE INDEX idx_sources_task ON task_sources(task_id);
  CREATE TABLE possible_duplicates (            -- similar but not safely identical; both tasks retained
    task_a INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    task_b INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    similarity REAL NOT NULL,
    detected_at TEXT NOT NULL,
    PRIMARY KEY (task_a, task_b)
  );
  CREATE TABLE ingest_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    report TEXT NOT NULL
  );
  CREATE TABLE followup_drafts (                -- idempotency ledger for Gmail drafts
    fingerprint TEXT PRIMARY KEY,
    owner_name TEXT NOT NULL,
    to_email TEXT NOT NULL,
    task_ids TEXT NOT NULL,
    gmail_draft_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  `,
];

export function openDatabase(file) {
  try {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    const db = new Database(file);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    migrate(db);
    return db;
  } catch (e) {
    if (e instanceof StoreError) throw e;
    throw new StoreError(`Cannot open database ${file}: ${e.message}`);
  }
}

function migrate(db) {
  const current = db.pragma('user_version', { simple: true });
  if (current > MIGRATIONS.length) {
    throw new StoreError(`Database schema v${current} is newer than this program (v${MIGRATIONS.length})`);
  }
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}
