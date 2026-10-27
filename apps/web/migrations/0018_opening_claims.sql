-- 오픈 기념 무료 per account (owner 2026-10-27 "계정 위주로 돌아가는 게 맞지 않니?"): one free tarot full reading per Kakao or
-- Google account. user_key is users.kakao_key (an HMAC of the provider's id; "google:" for Google). Only the key and when it
-- was claimed are kept, as member data: deleting the account deletes its claim (lib/account/deletion.ts).
-- opened: 0 while the reading is written (a hold: a failed generation deletes it, a hold a run left behind is taken again
-- after OPENING_HOLD_MS, lib/account/openingClaim.ts), 1 once it was written. Every row goes once 오픈 기념 무료 ends (maintenance).
CREATE TABLE opening_claims (
  user_key TEXT PRIMARY KEY,
  claimed_at INTEGER NOT NULL,
  opened INTEGER NOT NULL DEFAULT 0
);
