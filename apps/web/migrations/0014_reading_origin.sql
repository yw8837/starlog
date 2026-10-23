-- Account sync (owner 2026-10-23 "웹이랑 모바일에서 각각 로그인하면 내결과가 공유안됨"): where a saved reading came from,
-- beside `source` (what opened it). NULL: saved as it was opened with a purchase, the gift or the owner pass, as before.
-- 'opening': a 오픈 기념 무료 reading opened while logged in (source 'free', 'owner' on an owner-pass device), saved from the
-- privacy revision of SYNC_REVISION_DATE (lib/legal.ts). 'moved': a reading a device kept that its user chose to move into
-- the account (source 'free': who opened it is not known, so it takes no review).
-- A column, not a rebuild of readings with a wider source CHECK as 0003 did: reviews.reading_id references readings
-- ON DELETE SET NULL, and the rebuild's DROP TABLE deletes every row first, which would clear every review's link.
ALTER TABLE readings ADD COLUMN origin TEXT CHECK (origin IN ('opening', 'moved'));
