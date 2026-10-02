import { describe, expect, it } from "vitest";
import { budgetProblems, parseUploadSize } from "../../../../scripts/check-worker-size.mjs";

describe("worker size gate", () => {
  it("reads wrangler's summary line, commas included", () => {
    expect(parseUploadSize("…\nTotal Upload: 12,345.67 KiB / gzip: 2,201.50 KiB\n…")).toEqual({ rawKiB: 12345.67, gzipKiB: 2201.5 });
    expect(parseUploadSize("no summary")).toBeNull();
  });

  it("fails above baseline + budget and above the plan limit", () => {
    const baseline = { plan: "free", limitKiB: 3072, budgetKiB: 614, gzipKiB: 2200 };
    expect(budgetProblems(2700, baseline)).toEqual([]);
    expect(budgetProblems(2900, baseline)).toHaveLength(1);
    expect(budgetProblems(3100, { ...baseline, budgetKiB: 2000 })[0]).toMatch(/free plan limit/);
  });
});
