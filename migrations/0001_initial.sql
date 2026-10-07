CREATE TABLE owner_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  tracking_start TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  goal_revision INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE entries (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  easy INTEGER NOT NULL CHECK (typeof(easy) = 'integer' AND easy BETWEEN 0 AND 10000),
  external INTEGER NOT NULL CHECK (typeof(external) = 'integer' AND external BETWEEN 0 AND 10000),
  logged_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
  backdated INTEGER NOT NULL DEFAULT 0 CHECK (backdated IN (0, 1)),
  CHECK (easy + external > 0)
);
CREATE INDEX entries_by_date ON entries(date, deleted, logged_at DESC, id);
CREATE INDEX entries_by_logged_at ON entries(logged_at, deleted);
CREATE TABLE goal_policies (date TEXT PRIMARY KEY, value INTEGER NOT NULL CHECK(typeof(value) = 'integer' AND value BETWEEN 1 AND 10000));
CREATE TABLE goal_overrides (date TEXT PRIMARY KEY, value INTEGER NOT NULL CHECK(typeof(value) = 'integer' AND value BETWEEN 1 AND 10000));
INSERT INTO goal_policies(date,value) VALUES('1970-01-01',75);
CREATE TABLE mutation_receipts (
  id TEXT PRIMARY KEY, request_hash TEXT NOT NULL, kind TEXT NOT NULL,
  entry_id TEXT, expected_version INTEGER, expected_revision INTEGER,
  response_json TEXT NOT NULL DEFAULT '{}', imported_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TRIGGER check_entry_mutation BEFORE INSERT ON mutation_receipts
WHEN NEW.kind IN ('update','delete') BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM entries WHERE id=NEW.entry_id AND version=NEW.expected_version AND deleted=0)
    THEN RAISE(ABORT,'entry_version_conflict') END;
END;
CREATE TRIGGER check_create_mutation BEFORE INSERT ON mutation_receipts
WHEN NEW.kind='create' BEGIN
  SELECT CASE WHEN EXISTS (SELECT 1 FROM entries WHERE id=NEW.entry_id)
    THEN RAISE(ABORT,'entry_id_conflict') END;
END;
CREATE TRIGGER check_goal_mutation BEFORE INSERT ON mutation_receipts
WHEN NEW.kind='goal' BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM owner_settings WHERE id=1 AND goal_revision=NEW.expected_revision)
    THEN RAISE(ABORT,'goal_version_conflict') END;
END;
CREATE TABLE owner_sessions (
  token_hash TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0 CHECK(revoked IN(0,1))
);
CREATE INDEX sessions_by_expiry ON owner_sessions(expires_at);
CREATE TABLE login_limits (key_hash TEXT PRIMARY KEY, window_start INTEGER NOT NULL, attempts INTEGER NOT NULL);
CREATE INDEX login_limits_by_window ON login_limits(window_start);
