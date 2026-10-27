-- 별자리 인연 (owner 2026-10-27: "계정 위주로 돌아가는 게 맞다"): the account a constellation owner belongs to, so the
-- same constellation, invite link and scores show on every device the account logs in on. NULL for an owner made on a
-- device before this, until that device's owner taps 연결하기 while logged in; one owner per account.
ALTER TABLE owners ADD COLUMN user_id TEXT;
CREATE UNIQUE INDEX owners_user ON owners(user_id) WHERE user_id IS NOT NULL;
