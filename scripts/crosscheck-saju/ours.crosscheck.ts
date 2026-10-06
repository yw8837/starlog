// Runs our engine (packages/core computeChart = manseryeok@2.0.0 + saju-policy@1 wrapper) on cases.json
// and writes ours.json. Read-only use of the engine; nothing under packages/ is changed.
// Run: npx vitest run -c scripts/crosscheck-saju/vitest.config.ts   (from the repo root)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getSolarTerm, lunarToSolar, solarToLunar } from "manseryeok";
import { expect, it } from "vitest";
import { computeChart, DEFAULT_POLICY, SAJU_ENGINE, SajuError } from "../../packages/core/src";
import type { Pillar, SajuChart, SajuInput, SajuPolicy } from "../../packages/core/src";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// D = product default. The others are the policy's own alternatives, checked with the same reference.
const PROFILES: Record<string, SajuPolicy> = {
  D: DEFAULT_POLICY,
  DU: { ...DEFAULT_POLICY, jasi: "DAY_CHANGES_AT_23" },
  ES: { ...DEFAULT_POLICY, clock: "ERA_STANDARD" },
  FX: { ...DEFAULT_POLICY, clock: "FIXED_127_5" },
  R: { ...DEFAULT_POLICY, clock: "WALL", applyHistoricalDst: false },
};

type Case = SajuInput & { id: string; group: string };

const gz = (p: Pillar | null) => (p ? p.stem + p.branch : null);

function summarize(c: SajuChart) {
  return {
    pillars: [gz(c.pillars.year), gz(c.pillars.month), gz(c.pillars.day), gz(c.pillars.hour)],
    solarDate: c.solarDate,
    lunarDate: c.lunarDate,
    instantUTC: c.instantUTC,
    correctedLocalTime: c.correctedLocalTime,
    correctionMinutes: c.correctionMinutes,
    monthStartTerm: c.monthStartTerm,
    luck: { forward: c.luck.forward, startAge: c.luck.startAge, start: c.luck.start, first: c.luck.pillars[0]?.ganzhi ?? null },
    ambiguous: c.ambiguous,
    warnings: c.warnings.map(w => (w.window ? { code: w.code, window: w.window } : { code: w.code })),
  };
}

function runAll(cases: Case[]): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const k of cases) {
    const input: SajuInput = {
      calendar: k.calendar, year: k.year, month: k.month, day: k.day, time: k.time, gender: k.gender, place: k.place,
      ...(k.calendar === "lunar" ? { isLeapMonth: k.isLeapMonth ?? false } : {}),
    };
    out[k.id] = {};
    for (const [name, policy] of Object.entries(PROFILES)) {
      try {
        out[k.id]![name] = summarize(computeChart(input, policy));
      } catch (e) {
        if (!(e instanceof SajuError)) throw e;
        out[k.id]![name] = { error: e.code };
      }
    }
  }
  return out;
}

/** One case per line, so the committed file diffs and reads well. */
function writeJsonLines(path: string, head: Record<string, unknown>, cases: Record<string, unknown>): void {
  const lines = Object.entries(cases).map(([id, v]) => ` ${JSON.stringify(id)}: ${JSON.stringify(v)}`);
  const headText = JSON.stringify(head).slice(1, -1);
  writeFileSync(path, `{${headText},\n"cases": {\n${lines.join(",\n")}\n}}\n`);
}

it("computes our charts for every case and profile", () => {
  const cases = JSON.parse(readFileSync(here("./cases.json"), "utf8")) as Case[];
  const out = runAll(cases);
  // manseryeok's 절기 table (the engine our year/month pillars read), 1929–2026, all 24 terms
  const terms: Record<number, string[]> = {};
  for (let y = 1929; y <= 2026; y++) terms[y] = Array.from({ length: 24 }, (_, i) => getSolarTerm(y, i).date.toISOString());
  writeJsonLines(here("./ours.json"), { engine: SAJU_ENGINE, policy: DEFAULT_POLICY, profiles: PROFILES, terms }, out);
  expect(Object.keys(out)).toHaveLength(cases.length);
});

it("dumps manseryeok's lunar conversion (what computeChart calls) for every day 1930–2025", () => {
  const pad = (n: number) => String(n).padStart(2, "0");
  const solarToLunarAll: Record<string, string> = {};
  for (let ms = Date.UTC(1930, 0, 1); ms <= Date.UTC(2025, 11, 31); ms += 86_400_000) {
    const d = new Date(ms);
    const l = solarToLunar(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    solarToLunarAll[`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`] = `${l.year}-${l.isLeapMonth ? "윤" : ""}${pad(l.month)}-${pad(l.day)}`;
  }
  const lunarToSolarAll: Record<string, string> = {};
  for (let y = 1930; y <= 2025; y++) {
    for (let m = 1; m <= 12; m++) {
      for (const leap of [false, true]) {
        for (let d = 1; d <= 30; d++) {
          try {
            const s = lunarToSolar(y, m, d, leap);
            lunarToSolarAll[`${y}-${leap ? "윤" : ""}${pad(m)}-${pad(d)}`] = `${s.year}-${pad(s.month)}-${pad(s.day)}`;
          } catch (e) {
            if (!(e instanceof RangeError)) throw e; // nonexistent lunar date (the wrapper maps it to INVALID_LUNAR_DATE)
          }
        }
      }
    }
  }
  writeFileSync(here("./ours-lunar.json"), JSON.stringify({ solarToLunar: solarToLunarAll, lunarToSolar: lunarToSolarAll }) + "\n");
  expect(Object.keys(solarToLunarAll).length).toBeGreaterThan(35_000);
});

it("computes the wider sweep when fuzz-cases.json exists", () => {
  if (!existsSync(here("./fuzz-cases.json"))) return;
  const cases = JSON.parse(readFileSync(here("./fuzz-cases.json"), "utf8")) as Case[];
  const out = runAll(cases);
  writeJsonLines(here("./ours-fuzz.json"), { engine: SAJU_ENGINE }, out);
  expect(Object.keys(out)).toHaveLength(cases.length);
});
