-- 공유하기 everywhere (owner 2026-10-23): besides tarot, saju and daily, a share may now be 지금의 한 장 ('now'), the free
-- first tarot reading ('tarot-free'), the free saju teaser or a 운's 맛보기 ('saju-free'), a premium reading's image fields
-- ('premium'), an owner's constellation ('bonds') or a friend's own star ('bond') (lib/share/payload.ts). SQLite cannot
-- change a CHECK in place, so the table is rebuilt with the same columns, rows and indexes, as 0010 did. Nothing
-- references shares.
CREATE TABLE shares_next (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('tarot', 'saju', 'daily', 'now', 'tarot-free', 'saju-free', 'premium', 'bonds', 'bond')),
  chapter_key TEXT NOT NULL UNIQUE,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  user_id TEXT
);
INSERT INTO shares_next (id, kind, chapter_key, payload, created_at, user_id)
  SELECT id, kind, chapter_key, payload, created_at, user_id FROM shares;
DROP TABLE shares;
ALTER TABLE shares_next RENAME TO shares;
CREATE INDEX shares_user ON shares(user_id);
CREATE INDEX IF NOT EXISTS shares_created ON shares(created_at);
