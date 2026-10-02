import { afterAll, beforeAll, describe } from "vitest";
import type { D1Binding } from "@/lib/db/d1";
import { P4_TABLES_CHILD_FIRST, openLocalD1 } from "@/lib/db/testing/localD1";
import { ledgerContract } from "./ledgerContract";
import { premiumLedgerContract } from "./ledgerPremiumContract";

/** The same suite on real local D1 (workerd). Skipped with CI_NO_WORKERD=1. */
describe.skipIf(process.env.CI_NO_WORKERD === "1")("ledger (local D1)", () => {
  let db: D1Binding;
  let dispose: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    ({ db, dispose } = await openLocalD1());
  }, 120_000);

  afterAll(async () => {
    await dispose?.();
  });

  const fresh = async () => {
    await db.batch(P4_TABLES_CHILD_FIRST.map((table) => db.prepare(`DELETE FROM ${table}`)));
    return db;
  };

  ledgerContract(fresh);
  describe("premium", () => premiumLedgerContract(fresh));
});
