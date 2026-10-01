-- 별자리 인연 (P3). Birth dates are never stored: owners keep only the derived 궁합 basis, and a
-- friend's birth date lives only inside the join request.
CREATE TABLE owners (
  id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  ranking_public INTEGER NOT NULL DEFAULT 1,
  basis_json TEXT NOT NULL,
  last_refill_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE invites (
  code TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX invites_owner ON invites(owner_id, revoked_at);
CREATE TABLE constellations (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  sign TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('filling', 'complete')),
  total INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE INDEX constellations_owner ON constellations(owner_id, status);
-- One constellation per sign per owner, and only one being filled at a time (spec §2).
CREATE UNIQUE INDEX constellations_owner_sign ON constellations(owner_id, sign);
CREATE UNIQUE INDEX constellations_one_filling ON constellations(owner_id) WHERE status = 'filling';
CREATE INDEX constellations_rank ON constellations(sign, status, total DESC, completed_at ASC);
CREATE TABLE stars (
  id TEXT PRIMARY KEY,
  constellation_id TEXT NOT NULL REFERENCES constellations(id) ON DELETE CASCADE,
  slot INTEGER NOT NULL,
  nickname TEXT NOT NULL,
  message TEXT,
  card_id TEXT NOT NULL,
  orientation TEXT NOT NULL,
  score INTEGER NOT NULL,
  parts_json TEXT NOT NULL,
  friend_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (constellation_id, slot),
  UNIQUE (constellation_id, friend_key)
);
CREATE INDEX stars_created ON stars(created_at);
