CREATE TABLE auth_receipts (
  id TEXT PRIMARY KEY,
  session_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
