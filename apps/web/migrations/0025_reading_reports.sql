-- 신고 (plan 2026-11-11 W2.5; Google Play's AI-generated content policy: "in-app user reporting or flagging features that
-- allow users to report or flag offensive content to developers without needing to exit the app"). A report on an AI
-- reading from the Starlog app: which kind of reading, its id when it has one, one fixed reason and an optional note. The
-- reading's text is never stored. user_id is the reporter when logged in; no foreign key, so a report outlives the account
-- without its personal data: erasing an account (lib/account/deletion.ts) sets it NULL. Times are epoch milliseconds.
CREATE TABLE reading_reports (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  reading_id TEXT,
  kind TEXT NOT NULL,
  reason TEXT NOT NULL,
  note TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX reading_reports_created ON reading_reports(created_at);
