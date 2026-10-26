-- Refresh tokens = the revocable half of an HR login (Phase 7, doc 09).
--
-- The access JWT is stateless and short (15 minutes): we store nothing for it, and
-- nothing can withdraw it. This table is what makes the LONG half of a login
-- revocable - logout marks a row revoked, and the token stops working at once.
--
-- Only a SHA-256 hash of the token is stored, never the token itself. Whoever
-- reads this table (a backup, a leaked dump) holds nothing they can log in with.
-- A plain hash is enough here, unlike passwords: the token is 32 random bytes, so
-- there is no dictionary to guess from, and bcrypt's slowness would buy nothing.

CREATE TABLE refresh_tokens (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Deleting an account takes its logins with it.
  user_id     INTEGER NOT NULL
                REFERENCES users (id) ON DELETE CASCADE,
  -- The lookup key. UNIQUE also creates the index the refresh door searches by.
  token_hash  TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  expires_at  TEXT NOT NULL,
  -- NULL while usable. Set on logout, and on rotation: every refresh spends the
  -- token it was given and hands back a new one.
  revoked_at  TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Reuse of a spent token revokes every login that user has (see authService).
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens (user_id);
