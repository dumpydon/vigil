ALTER TABLE owner_sessions ADD COLUMN key_hash TEXT NOT NULL DEFAULT '';
-- Existing sessions have no generation fingerprint and must authenticate again.
UPDATE owner_sessions SET revoked=1;
