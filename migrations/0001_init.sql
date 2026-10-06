-- Mapped v2: accounts, games and leaderboards. Times are epoch ms on the server's clock.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  name TEXT,
  name_key TEXT UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);
CREATE INDEX sessions_expiry ON sessions (expires_at);

CREATE TABLE games (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users (id) ON DELETE CASCADE,
  claim_hash TEXT,
  ip_hash TEXT NOT NULL,
  config TEXT NOT NULL,
  mode TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  board TEXT,
  seed INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  found INTEGER,
  total INTEGER,
  hints INTEGER,
  ms INTEGER,
  end_reason TEXT,
  ranked INTEGER NOT NULL DEFAULT 0,
  unranked_reason TEXT,
  log TEXT
);
CREATE INDEX games_user ON games (user_id, finished_at DESC);
CREATE INDEX games_ip ON games (ip_hash, started_at);
CREATE INDEX games_stale ON games (started_at) WHERE user_id IS NULL OR finished_at IS NULL;

CREATE TABLE bests (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  board TEXT NOT NULL,
  game_id TEXT NOT NULL REFERENCES games (id) ON DELETE CASCADE,
  hints INTEGER NOT NULL,
  ms INTEGER NOT NULL,
  finished_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, board)
);
CREATE INDEX bests_rank ON bests (board, hints, ms, finished_at);
