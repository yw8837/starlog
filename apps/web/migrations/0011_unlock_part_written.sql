-- L-2: a premium reservation that has written a part (lib/pay/ledger.ts extendUnlock sets it after a
-- part, and when a resume token claims the next one). Giving such a reservation back (a failed part, or a
-- hold that lapsed between parts) leaves the purchase reopenable but no longer refundable, like one whose
-- client left. Standard readings and premium ones that never wrote a part leave it at 0.
ALTER TABLE unlocks ADD COLUMN part_written INTEGER NOT NULL DEFAULT 0;
