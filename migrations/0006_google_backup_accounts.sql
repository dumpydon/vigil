-- Additive: existing anonymous backup histories and credentials stay intact.
CREATE TABLE google_backup_accounts (
  google_subject TEXT PRIMARY KEY,
  namespace_id TEXT NOT NULL UNIQUE REFERENCES backup_devices(id),
  email TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE google_backup_access (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  namespace_id TEXT NOT NULL REFERENCES backup_devices(id),
  created_at TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0 CHECK(revoked IN (0,1))
);
CREATE INDEX google_backup_access_namespace ON google_backup_access(namespace_id);
CREATE TABLE google_backup_requests (
  state_hash TEXT PRIMARY KEY,
  poll_hash TEXT NOT NULL UNIQUE,
  nonce TEXT NOT NULL,
  verifier TEXT NOT NULL,
  source_namespace TEXT REFERENCES backup_devices(id),
  expires_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','exchanging','ready','cancelled','failed','consumed')),
  google_subject TEXT,
  email TEXT,
  error TEXT
);
CREATE INDEX google_backup_request_expiry ON google_backup_requests(expires_at);
