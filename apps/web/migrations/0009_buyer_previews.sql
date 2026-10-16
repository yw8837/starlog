-- Review 2026-10-17 #6: a premium buyer's free previews per product and KST day (lib/premium/routes.ts, five a day).
-- One row per buyer, product and day, counted by one UPSERT ... RETURNING, so previews that come at once each get
-- their own number and never pass the cap (the KV counter read and wrote back, and lost updates under a burst).
CREATE TABLE buyer_previews (
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  kst_day TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (user_id, product_id, kst_day)
);
