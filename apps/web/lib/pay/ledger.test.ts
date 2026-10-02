import { describe } from "vitest";
import { migratedTestD1 } from "@/lib/db/testing/migrate";
import { ledgerContract } from "./ledgerContract";
import { premiumLedgerContract } from "./ledgerPremiumContract";

describe("ledger (test D1)", () => ledgerContract(async () => migratedTestD1()));
describe("premium ledger (test D1)", () => premiumLedgerContract(async () => migratedTestD1()));
