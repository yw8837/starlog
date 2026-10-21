-- G1: follow-up answers given per chapter (lib/api/chapterTurns.ts). A turn is held with one conditional
-- upsert, so follow-ups sent together can never pass the chapter's cap (KV, which counted them before, has
-- no compare-and-set). A row lives a day past its chapter token (expires_at, ms); the maintenance cron
-- deletes it after. chapter_id is the token's chapter id: no account, no question, no reading.
CREATE TABLE IF NOT EXISTS chapter_turns (
  chapter_id TEXT PRIMARY KEY,
  turns INTEGER NOT NULL CHECK (turns >= 0),
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS chapter_turns_expiry ON chapter_turns(expires_at);
