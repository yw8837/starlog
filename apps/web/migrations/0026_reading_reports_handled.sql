-- 신고 목록 on /owner (owner 2026-11-13: "운영자 화면에 신고 목록 추가"). When the operator marked a report handled, in epoch
-- milliseconds; NULL: not handled yet (every report already stored). Unmarking sets it back to NULL. Additive only: account
-- deletion (lib/account/deletion.ts) and the 1-year purge (lib/pay/maintenance.ts) are unchanged.
ALTER TABLE reading_reports ADD COLUMN handled_at INTEGER;
