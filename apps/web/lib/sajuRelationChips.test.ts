import { relationsWithin, type SajuChart } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { RELATION_NONE, RELATION_NOT_EVENT, relationChips } from "./sajuRelationChips";

/** 글자끼리 맺은 관계 (spec 2026-11-11, 정통 사주에 충·합 … 안, C13): 합과 충만, 쉬운 이름과 자리, 사건으로 읽지 않음. */

type P = { stem: string; branch: string };
const chart = (year: string, month: string, day: string, hour?: string) =>
  ({
    pillars: {
      year: { stem: year[0], branch: year[1] },
      month: { stem: month[0], branch: month[1] },
      day: { stem: day[0], branch: day[1] },
      hour: hour ? { stem: hour[0], branch: hour[1] } : null,
    } as unknown as Record<string, P | null>,
  }) as unknown as Pick<SajuChart, "pillars">;

describe("relationChips", () => {
  it("names 육합, 충 and 천간합 in plain words with their places; never 형·파·해, 반합 or 천간충", () => {
    // 甲子 己丑 庚午 乙巳: 子丑 육합, 子午 충, 甲己 천간합, 甲庚 천간충, 乙庚 천간합, 丑午 해, 巳午… 반합 none (no center pair), 寅巳申 형 none
    const chips = relationChips(chart("甲子", "己丑", "庚午", "乙巳"));
    expect(chips).toEqual([
      { name: "묶이려는 짝", term: "육합", places: "연주 아래 子 · 월주 아래 丑", pillars: "연주·월주" },
      { name: "정면으로 마주 보는 짝", term: "충", places: "연주 아래 子 · 일주 아래 午", pillars: "연주·일주" },
      { name: "위 글자끼리 묶이려는 짝", term: "천간합", places: "연주 위 甲 · 월주 위 己", pillars: "연주·월주" },
      { name: "위 글자끼리 묶이려는 짝", term: "천간합", places: "일주 위 庚 · 시주 위 乙", pillars: "일주·시주" },
    ]);
    const text = JSON.stringify(chips);
    expect(text).not.toMatch(/형|파|해|반합|천간충|刑|破|害/);
  });

  it("names a whole 삼합 or 방합 with its element, not the 반합 pairs inside it", () => {
    // 申 子 辰 all stand: 삼합 (물 기운); 申子·子辰 반합 are covered by it
    expect(relationChips(chart("壬申", "丙子", "戊辰"))).toContainEqual({ name: "세 글자가 모인 무리", term: "삼합 · 물 기운", places: "연주 아래 申 · 월주 아래 子 · 일주 아래 辰", pillars: "연주·월주·일주" });
    // 寅 卯 辰: 방합 (나무 기운)
    expect(relationChips(chart("甲寅", "丁卯", "戊辰"))).toContainEqual({ name: "계절이 모인 무리", term: "방합 · 나무 기운", places: "연주 아래 寅 · 월주 아래 卯 · 일주 아래 辰", pillars: "연주·월주·일주" });
    expect(JSON.stringify(relationChips(chart("壬申", "丙子", "戊辰")))).not.toContain("반합");
  });

  it("is empty when no pair joins or faces another", () => {
    expect(relationChips(chart("甲寅", "丙辰", "戊午"))).toEqual([]);
  });

  it("when only held-back pairs stand (반합, 천간충), its empty line stays true: it names what the chips cover (review 7)", () => {
    // 甲子 庚辰 丙寅: 甲庚 천간충, 子辰 반합, nothing the chips show
    const c = chart("甲子", "庚辰", "丙寅");
    const p = c.pillars as unknown as Record<string, P>;
    const keys = ["year", "month", "day"];
    const found = relationsWithin(
      keys.map((k) => ({ glyph: p[k]!.stem, at: k })),
      keys.map((k) => ({ glyph: p[k]!.branch, at: k })),
    ).map((r) => r.type.split("(")[0]);
    expect(found.sort()).toEqual(["반합", "천간충"]);
    expect(relationChips(c)).toEqual([]);
    expect(RELATION_NONE).toBe("육합·삼합·방합·천간합·충으로 맺은 글자 짝은 없어요.");
    expect(RELATION_NONE).not.toMatch(/합이나 충/);
  });

  it("says what a chip is not", () => {
    expect(RELATION_NOT_EVENT).toBe("사건으로 읽지 않아요. 이런 배치가 있다는 것만 보여 줘요.");
  });
});
