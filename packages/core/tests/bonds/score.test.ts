import { describe, expect, it } from "vitest";
import type { SajuElement } from "../../src/saju/labels";
import { BOND_MAX, BOND_MIN, bondBasis, bondScore, type BondBasis } from "../../src/bonds/score";

const el = (목: number, 화: number, 토: number, 금: number, 수: number): Record<SajuElement, number> => ({ 목, 화, 토, 금, 수 });
const basis = (dayStem: string, yearBranch: string, dayBranch: string, elements: Record<SajuElement, number>): BondBasis =>
  ({ dayStem, yearBranch, dayBranch, elements, uncertain: false });

describe("bondBasis", () => {
  it("reads the sample chart from the date only (1990-01-01 → 己巳 丙子 丙寅)", () => {
    expect(bondBasis({ calendar: "solar", year: 1990, month: 1, day: 1 })).toEqual({
      dayStem: "丙", yearBranch: "巳", dayBranch: "寅", elements: el(1, 3, 1, 0, 1), uncertain: false,
    });
  });

  it("never depends on a birth time (there is no time input at all)", () => {
    const a = bondBasis({ calendar: "solar", year: 1995, month: 2, day: 4 });
    const b = bondBasis({ calendar: "solar", year: 1995, month: 2, day: 4 });
    expect(a).toEqual(b);
  });

  it("marks a birthday on 입춘 as uncertain", () => {
    // 2000-02-04 is 입춘: the year pillar changes during the day
    expect(bondBasis({ calendar: "solar", year: 2000, month: 2, day: 4 }).uncertain).toBe(true);
  });
});

describe("bondScore", () => {
  const best = [basis("甲", "子", "寅", el(2, 1, 1, 0, 2)), basis("己", "丑", "亥", el(1, 1, 2, 2, 0))] as const;
  const worst = [basis("甲", "子", "子", el(3, 1, 1, 1, 0)), basis("庚", "午", "午", el(3, 1, 1, 1, 0))] as const;

  it("adds 천간합, 띠 육합, 일지 육합 and both 오행 fills (98)", () => {
    const r = bondScore(best[0], best[1]);
    expect(r.parts.map((p) => [p.id, p.points])).toEqual([
      ["stem-combine", 12], ["year-six", 8], ["day-six", 6], ["fill-mine", 5], ["fill-theirs", 5],
    ]);
    expect(r.score).toBe(98);
  });

  it("clamps to the floor (62 - 5 - 4 = 53 → 55)", () => {
    const r = bondScore(worst[0], worst[1]);
    expect(r.parts.map((p) => [p.id, p.points])).toEqual([["year-clash", -5], ["day-clash", -4]]);
    expect(r.score).toBe(BOND_MIN);
  });

  it("scores 상생 and same element, 삼합, 같은 띠 and 원진", () => {
    const neutral = el(1, 1, 2, 1, 1);
    // day branches 丑·卯 have no relation, so only the stem and year items show
    expect(bondScore(basis("甲", "子", "丑", neutral), basis("丙", "辰", "卯", neutral)).parts.map((p) => p.id))
      .toEqual(["stem-generate", "year-three"]);
    expect(bondScore(basis("甲", "子", "丑", neutral), basis("乙", "子", "卯", neutral)).parts.map((p) => p.id))
      .toEqual(["stem-same", "year-same"]);
    expect(bondScore(basis("甲", "子", "寅", neutral), basis("庚", "未", "午", neutral)).parts.map((p) => [p.id, p.points]))
      .toEqual([["year-wonjin", -3], ["day-three", 5]]);
  });

  it("is symmetric and deterministic for many pairs", () => {
    const stems = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
    const branches = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
    for (let i = 0; i < 60; i++) {
      const a = basis(stems[i % 10]!, branches[i % 12]!, branches[(i * 5) % 12]!, el(i % 3, 2, 1, (i + 1) % 3, 1));
      const b = basis(stems[(i * 7) % 10]!, branches[(i * 3) % 12]!, branches[(i * 11) % 12]!, el(1, i % 4, 2, 0, (i + 2) % 3));
      const ab = bondScore(a, b).score;
      expect(bondScore(b, a).score).toBe(ab);
      expect(bondScore(a, b).score).toBe(ab);
      expect(ab).toBeGreaterThanOrEqual(BOND_MIN);
      expect(ab).toBeLessThanOrEqual(BOND_MAX);
    }
  });

  it("is symmetric for real birthdays too", () => {
    const days = [[1990, 1, 1], [1991, 5, 12], [1992, 8, 3], [1988, 11, 20], [1995, 2, 28], [2001, 7, 7], [1979, 12, 31]] as const;
    const bases = days.map(([year, month, day]) => bondBasis({ calendar: "solar", year, month, day }));
    for (const a of bases) for (const b of bases) expect(bondScore(a, b).score).toBe(bondScore(b, a).score);
  });

  it("explains every part in plain Korean from the owner's side", () => {
    for (const p of bondScore(best[0], best[1]).parts) expect(p.text).toMatch(/[가-힣]/);
    expect(bondScore(best[0], best[1]).parts.find((p) => p.id === "fill-mine")!.text).toContain("금");
  });

  it("adds a zero-point note when either date sits on a pillar boundary", () => {
    const r = bondScore({ ...best[0], uncertain: true }, best[1]);
    expect(r.parts.at(-1)).toMatchObject({ id: "uncertain", points: 0 });
  });
});
