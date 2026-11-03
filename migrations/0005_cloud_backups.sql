CREATE TABLE backup_devices (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0 CHECK(revoked IN (0,1))
);
CREATE TABLE cloud_backups (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES backup_devices(id),
  revision INTEGER NOT NULL CHECK(revision >= 0),
  fingerprint TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  applications INTEGER NOT NULL,
  entries INTEGER NOT NULL,
  bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(device_id, revision)
);
CREATE INDEX cloud_backups_by_device ON cloud_backups(device_id, revision DESC);
CREATE TABLE cloud_backup_chunks (
  backup_id TEXT NOT NULL REFERENCES cloud_backups(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  content TEXT NOT NULL,
  PRIMARY KEY(backup_id, position)
);
CREATE TRIGGER cloud_backup_revision_guard BEFORE INSERT ON cloud_backups
WHEN EXISTS (SELECT 1 FROM cloud_backups WHERE device_id=NEW.device_id AND revision>NEW.revision)
BEGIN
  SELECT RAISE(ABORT,'cloud_backup_stale_revision');
END;
