import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** scripts/ops (review 2026-10-20): the gate's prerender check and the deploy's count of pending migrations. */
const ops = (name: string) => readFileSync(fileURLToPath(new URL(`../../../scripts/ops/${name}`, import.meta.url)), "utf8");

/** Runs gate3-lite's prerender check in a folder whose build prerendered `routes`: its exit code and its last line. */
function prerenderCheck(routes: string[]): { code: number; out: string } {
  const check = /node -e '([^']+)' > "\$LOG\/prerender\.log"/.exec(ops("gate3-lite.sh"))?.[1];
  if (!check) throw new Error("gate3-lite.sh has no prerender check");
  const dir = mkdtempSync(join(tmpdir(), "gate3-"));
  try {
    mkdirSync(join(dir, ".next"));
    writeFileSync(join(dir, ".next", "prerender-manifest.json"), JSON.stringify({ routes: Object.fromEntries(routes.map((route) => [route, {}])) }));
    try {
      return { code: 0, out: execFileSync(process.execPath, ["-e", check], { cwd: dir, encoding: "utf8" }).trim() };
    } catch (error) {
      const failed = error as { status: number; stdout: string };
      return { code: failed.status, out: String(failed.stdout).trim() };
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("scripts/ops/gate3-lite.sh: pages that read a runtime setting are never prerendered", () => {
  const RUNTIME = [
    "/login",
    "/tarot/start",
    ...["deep-tarot", "match", "newyear-2027"].flatMap((slug) => [`/premium/${slug}`, `/premium/${slug}/sample`]),
    // the premium flows and the policies (review 2026-10-20: the policies show the clauses and the notice by the clock)
    "/premium/deep-tarot/result",
    "/premium/match/new",
    "/premium/match/preview",
    "/premium/newyear-2027/new",
    "/premium/newyear-2027/preview",
    "/privacy",
    "/terms",
    "/refund",
  ];

  it("fails a build that prerendered any of them, naming each", () => {
    const result = prerenderCheck(["/", "/guide", ...RUNTIME]);
    expect(result.code).toBe(1);
    expect(result.out.replace(/^prerendered: /, "").split(" ").sort()).toEqual([...RUNTIME].sort());
  });

  it("passes a build that prerendered none of them", () => {
    expect(prerenderCheck(["/", "/guide", "/pricing"])).toEqual({ code: 0, out: "ok" });
  });
});

describe("scripts/ops/deploy.sh: the remote D1's pending migrations", () => {
  it("counts every 4-digit migration name, 0010 and later included, and no header", () => {
    const pattern = /grep -cE '([^']+)' "\$LOG\/migrations\.log"/.exec(ops("deploy.sh"))?.[1];
    expect(pattern).toBeTruthy();
    const pending = new RegExp(pattern!);
    const listing = ["┌──────────────────────────┐", "│ Name                     │", "│ 0009_buyer_previews.sql  │", "│ 0010_daily_shares.sql    │", "│ 0123_later.sql           │", "| 1000_much_later.sql |", "No migrations to apply!"];
    expect(listing.filter((line) => pending.test(line))).toEqual(listing.slice(2, 6));
  });
});
