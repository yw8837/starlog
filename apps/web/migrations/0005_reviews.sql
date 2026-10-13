-- 풀이 후기 (owner 2026-10-13; docs/superpowers/specs/2026-10-13-starlog-reviews-design.md): only the
-- owner of a saved reading writes one, one per reading; no rewards. Public: the stars, the line, the
-- product and topic, a masked nickname. A review outlives its reading (reading_id goes NULL) and goes
-- with the account (lib/account/deletion.ts).
CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  reading_id TEXT UNIQUE REFERENCES readings(id) ON DELETE SET NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  product TEXT NOT NULL,               -- tarot | saju | a premium id
  topic_label TEXT,                    -- 주제별 사주's topic ("연애운"), read from the saved reading
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body TEXT,                           -- 5–200 characters that passed lib/reviews/text.ts
  nickname TEXT NOT NULL,              -- masked when written ("별*냥")
  status TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden')),
  hidden_reason TEXT,                  -- why the owner hid it (rule breaches only)
  created_at INTEGER NOT NULL,
  edited_at INTEGER
);
CREATE INDEX reviews_public ON reviews(status, product, created_at);
CREATE INDEX reviews_user ON reviews(user_id);

CREATE TABLE review_helpful (
  review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (review_id, user_id)
);

CREATE TABLE review_reports (
  review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (review_id, user_id)
);
