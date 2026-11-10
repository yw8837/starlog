import { SIXTY_GANZHI, gradeCuts, scoreGradePopulation } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { GRADE_MEASURED, type DayMasterElement } from "./sajuGradeMeasured";

/** Every number /saju/grade/how shows, scored again from both populations (as scripts/saju-grade-report.test.ts does). */

const ELEMENTS: readonly DayMasterElement[] = ["목", "화", "토", "금", "수"];
const TARGET = [8, 22, 40, 30];
const pct = (n: number, of: number) => (100 * n) / of;
const one = (x: number) => Math.round(x * 10) / 10;
const two = (x: number) => Math.round(x * 100) / 100;

describe("the measured distribution on the how page (A7)", () => {
  it.each([["known", true], ["unknown", false]] as const)("%s: every number is what the rule gives", (key, hourKnown) => {
    const shown = GRADE_MEASURED[key];
    const { size, scores, dayMasters, counts } = scoreGradePopulation(hourKnown);
    expect(size).toBe(shown.size);
    const cuts = counts.map((row) => gradeCuts(row));
    const grades = new Uint8Array(size * 60);
    for (let i = 0; i < size; i++) {
      for (let y = 0; y < 60; y++) {
        const s = scores[60 * i + y]!;
        const c = cuts[y]!;
        grades[60 * i + y] = s >= c[0] ? 0 : s >= c[1] ? 1 : s >= c[2] ? 2 : 3;
      }
    }

    expect(Math.min(...counts.map((row) => row.filter((n) => n > 0).length))).toBe(shown.minDistinctScores);
    expect(two(Math.max(...counts.map((row) => pct(Math.max(...row), size))))).toBe(shown.maxTie);
    let gap = 0;
    for (let y = 0; y < 60; y++) {
      const n = [0, 0, 0, 0];
      for (let i = 0; i < size; i++) n[grades[60 * i + y]!]!++;
      for (let g = 0; g < 4; g++) gap = Math.max(gap, Math.abs(pct(n[g]!, size) - TARGET[g]!));
    }
    expect(two(gap)).toBe(shown.maxGapFromTarget);

    let allC = 0, noBright = 0, someS = size;
    for (let start = 0; start < 60; start++) {
      let c = 0, nb = 0, ws = 0;
      for (let i = 0; i < size; i++) {
        let best = 3;
        for (let t = 0; t < 10; t++) best = Math.min(best, grades[60 * i + ((start + t) % 60)]!);
        if (best === 3) c++;
        if (best >= 2) nb++;
        if (best === 0) ws++;
      }
      allC = Math.max(allC, c);
      noBright = Math.max(noBright, nb);
      someS = Math.min(someS, ws);
    }
    expect(allC).toBe(shown.allCTenYears);
    expect(one(pct(noBright, size))).toBe(shown.noBrightTenYears);
    expect(one(pct(someS, size))).toBe(shown.someSTenYears);

    const perMaster = [0, 0, 0, 0, 0];
    const sYears = [0, 0, 0, 0, 0];
    const kinds = [0, 0, 0, 0, 0];
    let never = 0;
    for (let i = 0; i < size; i++) {
      perMaster[dayMasters[i]!]!++;
      const seen = new Set<number>();
      for (let y = 0; y < 60; y++) {
        const g = grades[60 * i + y]!;
        seen.add(g);
        if (g === 0) sYears[dayMasters[i]!]!++;
      }
      kinds[seen.size]!++;
      if (!seen.has(0) && !seen.has(1)) never++;
    }
    expect(sYears.map((n, e) => one(pct(n, perMaster[e]! * 60)))).toEqual([...shown.meanS]);
    expect(kinds.slice(1).map((n) => one(pct(n, size)))).toEqual([...shown.kinds]);
    expect(never).toBe(shown.neverBright);

    for (const [year, gz] of [[2026, "丙午"], [2027, "丁未"], [2028, "戊申"]] as const) {
      const y = SIXTY_GANZHI.indexOf(gz);
      const byMaster = ELEMENTS.map(() => [0, 0, 0, 0]);
      for (let i = 0; i < size; i++) byMaster[dayMasters[i]!]![grades[60 * i + y]!]!++;
      for (const [e, name] of ELEMENTS.entries()) {
        expect(byMaster[e]!.map((n) => one(pct(n, perMaster[e]!))), `${key} ${year} ${name}`).toEqual([...shown.years[year][name]]);
      }
    }
  }, 120_000);

  it("agrees with the owner-confirmed figures (확정 사항 4, whole percents there) to within one point", () => {
    const { known } = GRADE_MEASURED;
    expect(known.years[2026].화[0]).toBe(0.0);
    for (const [shown, confirmed] of [[known.years[2026].화[3], 50], [known.years[2027].화[3], 47], [known.years[2027].토[3], 36], [known.years[2028].금[3], 49]] as const) {
      expect(Math.abs(shown - confirmed)).toBeLessThan(1);
    }
    expect(known.meanS).toEqual([9.3, 9.4, 6.6, 8.9, 9.0]);
  });
});
