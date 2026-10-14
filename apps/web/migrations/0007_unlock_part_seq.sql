-- SEC-02: a premium resume token claims its next part once (lib/pay/ledger.ts extendUnlock). part_seq
-- is the part a reservation was last claimed for: a token holding n parts extends the reservation only
-- while part_seq = n, and bumps it in the same UPDATE, so a replayed token cannot run that part again.
-- Standard readings leave it at 0.
ALTER TABLE unlocks ADD COLUMN part_seq INTEGER NOT NULL DEFAULT 0;
