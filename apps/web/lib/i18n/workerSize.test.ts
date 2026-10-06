import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { budgetProblems, parseUploadSize } from "../../../../scripts/check-worker-size.mjs";
import { dedupeChunkDir } from "../../../../scripts/dedupe-server-chunks.mjs";

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

describe("server chunk dedupe", () => {
  it("turns byte-identical Turbopack chunks into re-exports of the first, and leaves everything else alone", () => {
    const dir = mkdtempSync(join(tmpdir(), "starlog-chunks-"));
    try {
      const chunk = 'module.exports=[7,(e)=>{e.s(["answer",0,42])}];';
      writeFileSync(join(dir, "_a._.js"), `${chunk}\n\n//# sourceMappingURL=_a._.js.map`);
      writeFileSync(join(dir, "_b._.js"), `${chunk}\n\n//# sourceMappingURL=_b._.js.map`);
      writeFileSync(join(dir, "_c._.js"), "module.exports=[8,(e)=>{}];");
      // Same text twice, but not a Turbopack chunk: kept as it is.
      writeFileSync(join(dir, "_d.js"), "exports.x=[1];");
      writeFileSync(join(dir, "_e.js"), "exports.x=[1];");

      expect(dedupeChunkDir(dir)).toEqual([["_b._.js", "_a._.js"]]);
      expect(readFileSync(join(dir, "_b._.js"), "utf8")).toBe('module.exports=require("./_a._.js");\n');
      expect(readFileSync(join(dir, "_e.js"), "utf8")).toBe("exports.x=[1];");
      // The Turbopack runtime installs the module list a chunk exports: both paths give the same one.
      const load = createRequire(join(dir, "runtime.js"));
      expect(load("./_b._.js")).toBe(load("./_a._.js"));
      expect(dedupeChunkDir(dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
