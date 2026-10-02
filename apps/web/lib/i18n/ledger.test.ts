import { describe, expect, it } from "vitest";
import { emptyLedger, hashKo, markReviewed, recordDrafts, summarize, unitStatus } from "../../../../scripts/i18n/ledger.mjs";

const units = [
  { id: "messages:common:nav.home", kind: "messages", ko: "홈", phase: "A" },
  { id: "messages:common:nav.me", kind: "messages", ko: "내 정보", phase: "A" },
];
const present = () => true;

describe("review ledger", () => {
  it("records drafts with the Korean hash and keeps reviewed units whose Korean did not change", () => {
    let ledger = recordDrafts(emptyLedger("ja"), units);
    expect(ledger.entries["messages:common:nav.home"]).toEqual({ koHash: hashKo("홈"), status: "draft", reviewer: null, date: null });
    ledger = markReviewed(ledger, units, "messages:common:nav.*", "Aoi", "2026-10-10");
    ledger = recordDrafts(ledger, units);
    expect(ledger.entries["messages:common:nav.home"]!.status).toBe("reviewed");
  });

  it("calls a reviewed unit stale once its Korean changes, and missing when the locale lacks it", () => {
    const ledger = markReviewed(recordDrafts(emptyLedger("en"), units), units, "*", "Sam", "2026-10-10");
    const changed = { ...units[0]!, ko: "처음으로" };
    expect(unitStatus(ledger.entries[changed.id], changed, present)).toBe("stale");
    expect(unitStatus(undefined, units[1]!, () => false)).toBe("missing");
    expect(summarize(ledger, [changed, units[1]!], present)).toEqual({ reviewed: 1, draft: 0, stale: 1, missing: 0, total: 2 });
  });

  it("never marks a stale unit reviewed", () => {
    const ledger = recordDrafts(emptyLedger("en"), units);
    const changed = [{ ...units[0]!, ko: "처음으로" }, units[1]!];
    const marked = markReviewed(ledger, changed, "*", "Sam", "2026-10-10");
    expect(marked.entries["messages:common:nav.home"]!.status).toBe("draft");
    expect(marked.entries["messages:common:nav.me"]!.status).toBe("reviewed");
  });
});
