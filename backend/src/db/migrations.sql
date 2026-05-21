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
