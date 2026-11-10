-- The 2027 신년운세 + 프리미엄 궁합 set (owner 2026-11-10): one order grants two lots, one per reading. 0002 made
-- credit_lots.order_id UNIQUE (one lot per order); SQLite cannot drop that, so the table is rebuilt with the same columns,
-- checks and foreign keys, every row kept, and UNIQUE(order_id, product_id) instead: a payment recorded again (a repeated
-- confirm, the webhook) can never add a second lot of one product to an order. Gifts and admin grants name no order
-- (NULL), so they stay unlimited. No table references credit_lots, so dropping the old one breaks no foreign key.

CREATE TABLE credit_lots_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  currency TEXT NOT NULL CHECK (currency IN ('paid', 'free')),
  source TEXT NOT NULL CHECK (source IN ('order', 'gift', 'admin')),
  order_id TEXT REFERENCES orders(id),
  product_id TEXT,
  units_total INTEGER NOT NULL CHECK (units_total > 0),
  units_left INTEGER NOT NULL CHECK (units_left >= 0 AND units_left <= units_total),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'refunding', 'refunded', 'expired', 'revoked')),
  expires_at INTEGER,
  created_at INTEGER NOT NULL
);

INSERT INTO credit_lots_new (id, user_id, currency, source, order_id, product_id, units_total, units_left, status, expires_at, created_at)
SELECT id, user_id, currency, source, order_id, product_id, units_total, units_left, status, expires_at, created_at FROM credit_lots;

DROP TABLE credit_lots;

ALTER TABLE credit_lots_new RENAME TO credit_lots;

CREATE INDEX credit_lots_user ON credit_lots(user_id, currency, status);
CREATE INDEX credit_lots_expiry ON credit_lots(status, expires_at);
CREATE INDEX credit_lots_order ON credit_lots(order_id);
CREATE UNIQUE INDEX credit_lots_order_product ON credit_lots(order_id, product_id);
