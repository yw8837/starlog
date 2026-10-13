-- 결과 공유 (owner 2026-10-13): a shared reading is a public, read-only copy of what the result screen
-- shows, without the question, the user's own words, the follow-ups and the birth data
-- (lib/share/payload.ts). It is made only from a chapter token the server signed, so its text is
-- always the reading the server wrote. Stopping a share takes the same signed chapter.
CREATE TABLE shares (
  id TEXT PRIMARY KEY,                 -- 12 characters [a-z0-9], the /s/<id> address
  kind TEXT NOT NULL CHECK (kind IN ('tarot', 'saju')),
  chapter_key TEXT NOT NULL UNIQUE,    -- sha256 of the chapter's id: one link per reading
  payload TEXT NOT NULL,               -- the public JSON (SharePayload)
  created_at INTEGER NOT NULL
);
