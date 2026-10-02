-- P4: accounts, payments, the credit ledger and saved readings.
-- Spec: docs/superpowers/specs/2026-10-01-starlog-p4-accounts-payments-design.md (sections 5.4 and 7).
-- Times are epoch milliseconds. Money is whole KRW. Units are 달빛 (paid) or 별조각 (free) counts.

-- Values that pin this database to its deploy, such as the account secret check (lib/account/secretCheck.ts).
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  kakao_key TEXT UNIQUE,              -- HMAC of the Kakao user id, NULL once erased
  nickname TEXT,                      -- NULL once erased
  customer_key TEXT NOT NULL UNIQUE,  -- Toss customerKey
  age_confirmed_at INTEGER,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER NOT NULL,
  deleted_at INTEGER,                 -- 회원 탈퇴: nothing is granted, reserved or saved after this
  erased_at INTEGER                   -- personal data erased (the cron finishes an interrupted erase)
);
CREATE INDEX users_deleted ON users(deleted_at, erased_at);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);

-- One signup gift per Kakao account. Kept while an account with this key exists, and for a year after it is deleted.
CREATE TABLE gift_claims (
  kakao_key TEXT PRIMARY KEY,
  claimed_at INTEGER NOT NULL,
  account_deleted_at INTEGER          -- set when the account is deleted, cleared if the same Kakao account joins again
);
CREATE INDEX gift_claims_deleted ON gift_claims(account_deleted_at);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,                -- the Toss orderId
  user_id TEXT NOT NULL REFERENCES users(id),
  product_id TEXT NOT NULL,
  amount_krw INTEGER NOT NULL CHECK (amount_krw > 0),
  order_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('created', 'confirming', 'paid', 'failed', 'refunding', 'refunded')),
  return_to TEXT NOT NULL,
  withdrawal_ack_at INTEGER NOT NULL, -- when the buyer confirmed the 청약철회 notice
  payment_key TEXT,
  fail_code TEXT,
  cancel_attempt INTEGER NOT NULL DEFAULT 1, -- Toss Idempotency-Key cancel-<id>-<attempt>
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX orders_user ON orders(user_id, created_at);
CREATE INDEX orders_status ON orders(status, updated_at);

CREATE TABLE payments (
  payment_key TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
  method TEXT,
  total_amount INTEGER NOT NULL,
  status TEXT NOT NULL,
  approved_at TEXT,
  receipt_url TEXT,
  canceled_amount INTEGER NOT NULL DEFAULT 0,
  canceled_at TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('test', 'live', 'mock')),
  updated_at INTEGER NOT NULL
);

CREATE TABLE credit_lots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  currency TEXT NOT NULL CHECK (currency IN ('paid', 'free')),
  source TEXT NOT NULL CHECK (source IN ('order', 'gift', 'admin')),
  order_id TEXT UNIQUE REFERENCES orders(id),
  product_id TEXT,                    -- earmark: only this product may spend it (NULL = any standard reading)
  units_total INTEGER NOT NULL CHECK (units_total > 0),
  units_left INTEGER NOT NULL CHECK (units_left >= 0 AND units_left <= units_total),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'refunding', 'refunded', 'expired', 'revoked')),
  expires_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX credit_lots_user ON credit_lots(user_id, currency, status);
CREATE INDEX credit_lots_expiry ON credit_lots(status, expires_at);

CREATE TABLE unlocks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  product_id TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('paid', 'free')),
  allocations TEXT NOT NULL,          -- JSON [[lotId, units], ...]
  status TEXT NOT NULL CHECK (status IN ('reserved', 'delivered', 'released')),
  reserved_until INTEGER NOT NULL,
  reading_id TEXT,
  created_at INTEGER NOT NULL,
  settled_at INTEGER
);
CREATE INDEX unlocks_user ON unlocks(user_id, status);
CREATE INDEX unlocks_status ON unlocks(status, reserved_until);

CREATE TABLE ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('paid', 'free')),
  kind TEXT NOT NULL CHECK (kind IN ('grant', 'reserve', 'spend', 'restore', 'refund', 'expire')),
  units INTEGER NOT NULL CHECK (units > 0),
  lot_id TEXT NOT NULL,
  unlock_id TEXT,
  order_id TEXT,
  idem_key TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE INDEX ledger_user ON ledger(user_id, created_at);
CREATE INDEX ledger_lot ON ledger(lot_id);

-- Readings opened while logged in. No digest and no per-user uniqueness: two identical readings are two purchases.
CREATE TABLE readings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('tarot', 'saju')),
  product_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('paid', 'free', 'owner')),
  unlock_id TEXT UNIQUE,
  payload TEXT NOT NULL,              -- AES-GCM sealed chapter JSON (lib/account/secrets.ts)
  key_version INTEGER NOT NULL,       -- which derived key sealed it, for a future key change
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX readings_user ON readings(user_id, created_at, id);
