-- The Android app (plan 2026-11-11, W1): purchases made with Google Play billing. A Play payment is recorded in `payments`
-- like a Toss one, with mode 'play' (lib/pay/playOrders.ts), which 0002's CHECK refuses; SQLite cannot change a CHECK, so
-- the table is rebuilt with the same columns in the same order, the same foreign key and UNIQUE order_id, every row kept.
-- No table, index or trigger references payments, so dropping the old one breaks nothing.

CREATE TABLE payments_new (
  payment_key TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
  method TEXT,
  total_amount INTEGER NOT NULL,
  status TEXT NOT NULL,
  approved_at TEXT,
  receipt_url TEXT,
  canceled_amount INTEGER NOT NULL DEFAULT 0,
  canceled_at TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('test', 'live', 'mock', 'play')),
  updated_at INTEGER NOT NULL
);

INSERT INTO payments_new (payment_key, order_id, method, total_amount, status, approved_at, receipt_url, canceled_amount, canceled_at, mode, updated_at)
SELECT payment_key, order_id, method, total_amount, status, approved_at, receipt_url, canceled_amount, canceled_at, mode, updated_at FROM payments;

DROP TABLE payments;

ALTER TABLE payments_new RENAME TO payments;

-- One row per Google Play purchase token ("globally unique, so you can safely use this value as a primary key"), written in
-- the batch that marks its order paid: a token seen again changes nothing. order_id is the order the app sent to Google as
-- obfuscatedProfileId. purchase_type: Google's purchaseType, NULL for a real purchase, else 0 a license tester's test,
-- 1 a promo code, 2 rewarded (none is a real sale). consumed_at: Google was told the purchase was delivered
-- (Purchases.products:consume); a purchase never consumed is refunded by Google after three days. consume_tried_at: the
-- cron's last try at it (a purchase that cannot be consumed moves behind the others). refund_sent_at: our last refund
-- request for it (orders.refund); a refund still unknown an hour later is reported stuck. voided_at: Google refunded or
-- revoked it (its voided-purchases list, or our own refund), and it was applied. Times are epoch milliseconds.
CREATE TABLE play_purchases (
  purchase_token TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
  play_product_id TEXT NOT NULL,
  google_order_id TEXT,
  purchase_type INTEGER,
  purchased_at INTEGER,
  consumed_at INTEGER,
  consume_tried_at INTEGER,
  refund_sent_at INTEGER,
  voided_at INTEGER,
  created_at INTEGER NOT NULL
);

-- The cron's scan for purchases still to consume (lib/pay/playOrders.ts consumePendingPlay): never tried first, then the
-- least recently tried.
CREATE INDEX play_purchases_unconsumed ON play_purchases(consume_tried_at, created_at) WHERE consumed_at IS NULL AND voided_at IS NULL;
