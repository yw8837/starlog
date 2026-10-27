-- 별자리 인연 (QA 2026-10-27, owner policy): a friend the owner removed cannot join that constellation again from the
-- same device (star_blocks, by the device hash stars already keep), and one person cannot be two stars of one
-- constellation under the same nickname (stars.basis_hash). No birth date is stored: the 궁합 basis is compared by a hash
-- salted with the constellation id. Both go with their constellation.
CREATE TABLE star_blocks (
  constellation_id TEXT NOT NULL REFERENCES constellations(id) ON DELETE CASCADE,
  friend_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (constellation_id, friend_key)
);
ALTER TABLE stars ADD COLUMN basis_hash TEXT;
