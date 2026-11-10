import { describe, expect, it } from "vitest";
import { parsePremiumStatus } from "./status";

describe("premium status in the browser", () => {
  it("reads every product, hidden and closed unless the server says otherwise", () => {
    const status = parsePremiumStatus({
      products: [
        { id: "tarot-deep", open: true, visible: true, opensAt: null },
        { id: "newyear-2027", open: false, visible: true, opensAt: 1_800_000_000_000 },
        { id: "someday", open: true, visible: true, opensAt: null },
      ],
    });
    expect(status).toEqual({
      "tarot-deep": { open: true, visible: true, opensAt: null },
      match: { open: false, visible: false, opensAt: null },
      "newyear-2027": { open: false, visible: true, opensAt: 1_800_000_000_000 },
    });
  });

  it("reads whether the 2027 신년운세 + 프리미엄 궁합 set may be ordered, closed when the server does not say", () => {
    expect(parsePremiumStatus({ products: [], set: { open: true, opensAt: 1 } })?.set).toEqual({ open: true });
    expect(parsePremiumStatus({ products: [], set: { open: "yes" } })?.set).toEqual({ open: false });
    expect(parsePremiumStatus({ products: [] })?.set).toBeUndefined();
  });

  it("treats an older answer without `visible` as hidden, and anything odd as no answer", () => {
    expect(parsePremiumStatus({ products: [{ id: "match", open: true, opensAt: null }] })?.match).toEqual({ open: true, visible: false, opensAt: null });
    expect(parsePremiumStatus(null)).toBeNull();
    expect(parsePremiumStatus({ products: "x" })).toBeNull();
  });
});
