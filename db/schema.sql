-- ─────────────────────────────────────────────────────────────
-- Chaupal database schema
-- Runs automatically when the server starts (safe to run many
-- times because of IF NOT EXISTS). You can also paste it into
-- Neon's SQL Editor to see the tables being created.
-- ─────────────────────────────────────────────────────────────

-- People: Google users AND guests live in the same table.
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,              -- 'g_<google id>' or 'guest_<random>'
  name        TEXT NOT NULL,
  email       TEXT,                          -- only Google users have one
  avatar_url  TEXT,
  is_guest    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A poll = one question, created by one user.
CREATE TABLE IF NOT EXISTS polls (
  id          TEXT PRIMARY KEY,              -- short code used in the link: /p/Xy7kQ2m
  question    TEXT NOT NULL CHECK (char_length(question) BETWEEN 5 AND 140),
  emoji       TEXT NOT NULL,
  creator_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Each poll has 2 to 6 options. "poll_id" links an option to its poll (a foreign key).
CREATE TABLE IF NOT EXISTS options (
  id        SERIAL PRIMARY KEY,
  poll_id   TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  label     TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 60),
  position  INT NOT NULL
);

-- One row per vote. The PRIMARY KEY (poll_id, user_id) is the magic line:
-- the DATABASE itself refuses a second vote from the same person on the same poll.
CREATE TABLE IF NOT EXISTS votes (
  poll_id    TEXT NOT NULL REFERENCES polls(id)   ON DELETE CASCADE,
  option_id  INT  NOT NULL REFERENCES options(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (poll_id, user_id)
);

-- Indexes make common lookups fast.
CREATE INDEX IF NOT EXISTS idx_options_poll   ON options(poll_id);
CREATE INDEX IF NOT EXISTS idx_votes_option   ON votes(option_id);
CREATE INDEX IF NOT EXISTS idx_polls_created  ON polls(created_at DESC);
