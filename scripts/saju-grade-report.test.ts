// 사주 등급 tables and distribution checks (spec docs/superpowers/specs/2026-11-11-saju-grade-card-design.md A6–A7, F C3).
// Scores every combination once (561,600 with the hour, 43,200 without) for all 60 세운, writes
//   apps/web/lib/sajuGradeCuts.generated.json  (per 세운: the lowest S, A and B score; bundled with the card)
//   apps/web/lib/sajuGradeRanks.generated.json (per 세운: how many combinations score at or above each score; loaded on demand)
// and checks every bullet of A7. Each check is soft: a failure is reported with the measured number, never tuned away.
// usage: pnpm grade:table
import { writeFileSync } from "node:fs";
import {
  GRADE_LETTERS, GRADE_POPULATION, SAJU_GRADE_RULE, SIXTY_GANZHI, gradeCuts, gradeOf, scoreGradePopulation, type GradeCuts,
} from "@starlog/core";
import { describe, expect, test } from "vitest";

const OUT = new URL("../apps/web/lib/", import.meta.url);
const ELEMENT_NAMES = ["목", "화", "토", "금", "수"] as const;
const TARGET_SHARE = [8, 22, 40, 30] as const;
const pct = (n: number, of: number) => (100 * n) / of;
const fixed = (x: number) => x.toFixed(1);

interface Measured {
  cuts: GradeCuts[];
  /** cumulative at-or-above counts, per 세운, scores 0–100 */
  atOrAbove: number[][];
}

function measure(hourKnown: boolean): Measured {
  const label = hourKnown ? `시 앎 ${GRADE_POPULATION.hourKnown.toLocaleString()}` : `시 모름 ${GRADE_POPULATION.hourUnknown.toLocaleString()}`;
  const { size, scores, dayMasters, counts } = scoreGradePopulation(hourKnown);
  const cuts = counts.map((row) => gradeCuts(row));
  const atOrAbove = counts.map((row) => {
    const out = Array<number>(101).fill(0);
    for (let s = 100, sum = 0; s >= 0; s--) out[s] = sum += row[s]!;
    return out;
  });
  const grades = new Uint8Array(size * 60);
  for (let i = 0; i < size; i++) for (let y = 0; y < 60; y++) grades[60 * i + y] = GRADE_LETTERS.indexOf(gradeOf(scores[60 * i + y]!, cuts[y]!));

  // A7 bullets
  const distinct = counts.map((row) => row.filter((n) => n > 0).length);
  const tie = counts.map((row) => pct(Math.max(...row), size));
  const shares = SIXTY_GANZHI.map((_, y) => {
    const out = [0, 0, 0, 0];
    for (let i = 0; i < size; i++) out[grades[60 * i + y]!]!++;
    return out.map((n) => pct(n, size));
  });
  const shareGap = Math.max(...shares.flatMap((row) => row.map((s, g) => Math.abs(s - TARGET_SHARE[g]!))));
  let allC = 0;
  let worstNoA = 0;
  let leastS = size;
  for (let start = 0; start < 60; start++) {
    let c = 0, noA = 0, withS = 0;
    for (let i = 0; i < size; i++) {
      let best = 3;
      for (let t = 0; t < 10; t++) best = Math.min(best, grades[60 * i + ((start + t) % 60)]!);
      if (best === 3) c++;
      if (best >= 2) noA++;
      if (best === 0) withS++;
    }
    allC = Math.max(allC, c);
    worstNoA = Math.max(worstNoA, noA);
    leastS = Math.min(leastS, withS);
  }
  const perMaster = [0, 0, 0, 0, 0];
  for (const e of dayMasters) perMaster[e]!++;
  const meanS = ELEMENT_NAMES.map((_, e) => {
    let s = 0;
    for (let i = 0; i < size; i++) if (dayMasters[i] === e) for (let y = 0; y < 60; y++) if (grades[60 * i + y] === 0) s++;
    return pct(s, perMaster[e]! * 60);
  });
  const kinds = [0, 0, 0, 0, 0];
  let neverBright = 0;
  for (let i = 0; i < size; i++) {
    const seen = new Set<number>();
    for (let y = 0; y < 60; y++) seen.add(grades[60 * i + y]!);
    kinds[seen.size]!++;
    if (!seen.has(0) && !seen.has(1)) neverBright++;
  }

  // per day master in 丙午 2026, 丁未 2027, 戊申 2028 (for the how page)
  const yearRows = ["丙午", "丁未", "戊申"].map((gz) => {
    const y = SIXTY_GANZHI.indexOf(gz);
    const byMaster = ELEMENT_NAMES.map((name, e) => {
      const n = [0, 0, 0, 0];
      for (let i = 0; i < size; i++) if (dayMasters[i] === e) n[grades[60 * i + y]!]!++;
      return `${name} ${n.map((x) => fixed(pct(x, perMaster[e]!))).join("/")}`;
    });
    return `${gz}(${1984 + y}) 일간별 S/A/B/C %: ${byMaster.join(" · ")}`;
  });

  console.log([
    `== ${label}`,
    `해마다 서로 다른 점수 수: 최소 ${Math.min(...distinct)} (최대 ${Math.max(...distinct)})`,
    `가장 많은 동점 비율: 최대 ${tie.reduce((a, b) => Math.max(a, b)).toFixed(2)}%`,
    `등급 비율과 목표(8/22/40/30)의 최대 차이: ${shareGap.toFixed(2)}%p`,
    `어느 10년 창이든 내내 C인 명식: 최대 ${allC}개 (60개 시작점)`,
    `10년 동안 A 이상이 한 번도 없는 명식: 최대 ${fixed(pct(worstNoA, size))}% · 10년 동안 S를 한 번 이상: 최소 ${fixed(pct(leastS, size))}%`,
    `60해 평균 S 비율(일간 목/화/토/금/수): ${meanS.map(fixed).join("/")}%`,
    `60해 동안 받는 등급 종류(1/2/3/4종): ${kinds.slice(1).map((n) => fixed(pct(n, size))).join(" / ")}%`,
    `60해 동안 S·A가 한 번도 없는 명식: ${neverBright}개`,
    ...yearRows,
  ].join("\n"));

  expect.soft(Math.min(...distinct), `${label}: 해마다 서로 다른 점수 60개 이상`).toBeGreaterThanOrEqual(60);
  expect.soft(Math.max(...tie), `${label}: 동점 8% 이하`).toBeLessThanOrEqual(8);
  expect.soft(shareGap, `${label}: 목표 비율과 4%p 이하 차이`).toBeLessThanOrEqual(4);
  expect.soft(allC, `${label}: 60개 시작점 모든 10년 창에서 내내 C 0개`).toBe(0);
  for (const [e, s] of meanS.entries()) {
    expect.soft(s, `${label}: 일간 ${ELEMENT_NAMES[e]} 60해 평균 S 6~11%`).toBeGreaterThanOrEqual(6);
    expect.soft(s, `${label}: 일간 ${ELEMENT_NAMES[e]} 60해 평균 S 6~11%`).toBeLessThanOrEqual(11);
  }
  expect.soft(kinds[1], `${label}: 모든 명식이 60해 동안 2종 이상`).toBe(0);
  return { cuts, atOrAbove };
}

describe("사주 등급 tables (A6–A7)", () => {
  test("scores both populations, writes the tables, checks the distribution", () => {
    const known = measure(true);
    const unknown = measure(false);
    const header = { rule: SAJU_GRADE_RULE.id, years: "SIXTY_GANZHI order: 0 甲子 … 59 癸亥 (the 세운)" };
    writeFileSync(
      new URL("sajuGradeCuts.generated.json", OUT),
      `${JSON.stringify({ ...header, note: "[lowest S, lowest A, lowest B] score", known: known.cuts, unknown: unknown.cuts })}\n`,
    );
    writeFileSync(
      new URL("sajuGradeRanks.generated.json", OUT),
      `${JSON.stringify({
        ...header,
        note: "combinations scoring at or above each score 0–100",
        population: { known: GRADE_POPULATION.hourKnown, unknown: GRADE_POPULATION.hourUnknown },
        known: known.atOrAbove,
        unknown: unknown.atOrAbove,
      })}\n`,
    );
  });
});
