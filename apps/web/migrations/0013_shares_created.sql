-- SHARE-3: a share link lives 180 days from created_at (lib/share/store.ts SHARE_TTL_MS); the maintenance cron
-- deletes the ones past it every 10 minutes, and this index keeps that from reading the whole table each time.
-- Nothing depends on it to be correct: without it the purge is only slower.
CREATE INDEX shares_created ON shares(created_at);
