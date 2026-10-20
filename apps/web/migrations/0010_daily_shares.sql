-- 오늘의 한 장 공유 (owner 2026-10-20): a shared 오늘의 한 장 is a share of kind 'daily' (lib/share/payload.ts
-- SharedDaily), made by the server from its own record of the device's card (app/api/share/daily). Its
-- chapter_key is a keyed hash of the device and the KST day: one link per device and day, and the row
-- names no device. SQLite cannot change a CHECK in place, so the table is rebuilt with the same columns,
-- rows and index, and the CHECK takes 'daily' too. Nothing references shares.
CREATE TABLE shares_next (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('tarot', 'saju', 'daily')),
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
