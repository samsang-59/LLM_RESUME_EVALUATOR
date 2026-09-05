-- Users = HR accounts (design doc 09).
-- Only HR logs in; candidates and the ATS never have accounts.

CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL CHECK (length(trim(username)) > 0),
  -- The login identifier. UNIQUE is what makes "email already registered" a 409.
  email         TEXT NOT NULL UNIQUE CHECK (length(trim(email)) > 0),
  -- bcrypt hash only. The plain password is never stored (doc 09).
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Login looks users up by email on every request; the UNIQUE constraint above
-- already creates an index, this name just makes the intent explicit.
CREATE INDEX idx_users_email ON users (email);
