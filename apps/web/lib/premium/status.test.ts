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

  it("treats an older answer without `visible` as hidden, and anything odd as no answer", () => {
    expect(parsePremiumStatus({ products: [{ id: "match", open: true, opensAt: null }] })?.match).toEqual({ open: true, visible: false, opensAt: null });
    expect(parsePremiumStatus(null)).toBeNull();
    expect(parsePremiumStatus({ products: "x" })).toBeNull();
  });
});
