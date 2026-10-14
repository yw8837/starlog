-- 결과 공유의 주인 (2026-10-14): a share made by a signed-in session names its account, so 회원 탈퇴
-- takes that account's shares down with it (lib/account/deletion.ts). NULL: made without signing in.
ALTER TABLE shares ADD COLUMN user_id TEXT;
CREATE INDEX shares_user ON shares(user_id);
