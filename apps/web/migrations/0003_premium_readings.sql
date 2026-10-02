-- P5: premium readings are saved like the standard ones; readings.kind gains the premium kinds.
-- SQLite cannot alter a CHECK, so the table is rebuilt with 0002's definition, only the kind CHECK
-- widened. Nothing references readings by foreign key (unlocks.reading_id is plain TEXT).
-- Back up first: npx wrangler d1 export starlog --remote --output=readings-before-p5.sql
PRAGMA defer_foreign_keys = true;

CREATE TABLE readings_p5 (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('tarot', 'saju', 'tarot-deep', 'match', 'newyear-2027')),
  product_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('paid', 'free', 'owner')),
  unlock_id TEXT UNIQUE,
  payload TEXT NOT NULL,              -- AES-GCM sealed chapter JSON (lib/account/secrets.ts)
  key_version INTEGER NOT NULL,       -- which derived key sealed it, for a future key change
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO readings_p5 (id, user_id, kind, product_id, source, unlock_id, payload, key_version, created_at, updated_at)
  SELECT id, user_id, kind, product_id, source, unlock_id, payload, key_version, created_at, updated_at FROM readings;

DROP TABLE readings;
ALTER TABLE readings_p5 RENAME TO readings;
CREATE INDEX readings_user ON readings(user_id, created_at, id);
