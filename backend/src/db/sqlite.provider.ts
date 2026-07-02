import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

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

const SETTINGS_MIGRATIONS_SQL = `
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export function createSqliteConnection(dbPath: string): Database.Database {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

export function createDashboardsConnection(): Database.Database {
  const dbPath =
    process.env['DASHBOARDS_SQLITE_PATH'] ?? './data/dashboards.sqlite';
  const db = createSqliteConnection(dbPath);
  db.exec(DASHBOARDS_MIGRATIONS_SQL);
  return db;
}

export function createSettingsConnection(): Database.Database {
  const dbPath =
    process.env['SETTINGS_SQLITE_PATH'] ?? './data/dashboards.sqlite';
  const db = createSqliteConnection(dbPath);
  db.exec(SETTINGS_MIGRATIONS_SQL);
  return db;
}
