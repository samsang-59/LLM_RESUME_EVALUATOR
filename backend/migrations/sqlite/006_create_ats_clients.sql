-- ATS clients = one row per external system allowed to submit resumes (Phase 7,
-- doc 09). v1 had a single shared key in .env; now company A gets key A and company
-- B gets key B, so one leaked key can be switched off without touching the others.
--
-- As with refresh tokens, only a SHA-256 hash of the key is stored. The key itself
-- is shown to HR once, at creation, and never again.

CREATE TABLE ats_clients (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Who this key belongs to, e.g. "Company A". Not UNIQUE on purpose: rotating a
  -- key is "issue a new one under the same name, then revoke the old one".
  name        TEXT NOT NULL CHECK (length(trim(name)) > 0),
  key_hash    TEXT NOT NULL UNIQUE CHECK (length(key_hash) = 64),
  -- NULL while active. Revoking is a soft delete: the row stays as the record of
  -- who once had access.
  revoked_at  TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
