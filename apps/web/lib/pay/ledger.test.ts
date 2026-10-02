import { describe } from "vitest";
import { migratedTestD1 } from "@/lib/db/testing/migrate";
import { ledgerContract } from "./ledgerContract";

describe("ledger (test D1)", () => ledgerContract(async () => migratedTestD1()));
