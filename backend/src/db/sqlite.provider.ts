import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

const MIGRATIONS_SQL = `
CREATE TABLE IF NOT EXISTS curation_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_uri TEXT NOT NULL,
  field_name TEXT NOT NULL,
  raw_value TEXT,
  script_value TEXT,
  manual_value TEXT,
  status TEXT NOT NULL CHECK(status IN ('validated','corrected','pending')),
  author TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(node_uri, field_name)
);

CREATE INDEX IF NOT EXISTS idx_curation_node ON curation_records(node_uri);

CREATE TABLE IF NOT EXISTS duplicate_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_uri_a TEXT NOT NULL,
  node_uri_b TEXT NOT NULL,
  score REAL NOT NULL CHECK(score >= 0 AND score <= 1),
  decision TEXT NOT NULL DEFAULT 'pending' CHECK(decision IN ('pending','confirmed','rejected')),
  decided_by TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(node_uri_a, node_uri_b)
);
`;

export function createSqliteConnection(dbPath?: string): Database.Database {
  const resolvedPath =
    dbPath ?? process.env['SQLITE_PATH'] ?? './data/curation.db';

  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

const DASHBOARDS_MIGRATIONS_SQL = `
CREATE TABLE IF NOT EXISTS dashboards (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('gis','explorer')),
  name TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dashboards_updated ON dashboards(updated_at DESC);
`;

export function runMigrations(db: Database.Database): void {
  db.exec(MIGRATIONS_SQL);
}

export function createDashboardsConnection(): Database.Database {
  const dbPath = process.env['DASHBOARDS_SQLITE_PATH'] ?? './data/dashboards.sqlite';
  const db = createSqliteConnection(dbPath);
  db.exec(DASHBOARDS_MIGRATIONS_SQL);
  return db;
}
