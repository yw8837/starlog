-- Free AI readings need a login and are counted per account and KST day (owner 2026-11-04): the 맛보기 (5 a day) and 오늘의 한
-- 장's regenerations (2 a day). One row per account key (lib/api/member.ts: an HMAC of users.id under its own subkey, never
-- the id), day and kind. A generation reserves its place with one UPSERT ... RETURNING before it starts, so requests that
-- come at once each get their own number and never pass the cap (the KV count read and wrote back, and let a burst through),
-- and a generation that fails gives its place back. lib/pay/maintenance.ts deletes a day's rows by noon KST the next day.
CREATE TABLE account_day_counts (
  account_key TEXT NOT NULL,
  kst_day TEXT NOT NULL,
  kind TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (account_key, kst_day, kind)
);
