import { TEMPLATES, computeChart } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { DEFAULT_SAJU_FORM, toSajuInput } from "@/lib/sajuForm";
import { mockMatchPartA } from "./mockPremium";
import { buildMatchFacts, elementMeeting, matchCardsContext, matchCardsShared } from "./prompts/match";
import { validateMatchPartA } from "./validatePremium";

const chart = (y: number, m: number, d: number, extra: Partial<typeof DEFAULT_SAJU_FORM> = {}) =>
  computeChart(toSajuInput({ ...DEFAULT_SAJU_FORM, year: y, month: m, day: d, ...extra }));
const NOW = Date.parse("2026-10-20T12:00:00+09:00");

// Day pillars from the engine (manseryeok 2.0.0, checked 2026-10-01):
// 1990-01-01 丙寅, 1992-02-26 壬申, 1992-01-26 辛丑.
const me = chart(1990, 1, 1);

describe("match facts", () => {
  it("reads a clash between both day masters and both day branches (丙寅 × 壬申)", () => {
    const f = buildMatchFacts(me, chart(1992, 2, 26, { gender: "male" }), { relation: "lover" }, NOW);
    expect(f.me.dayMaster.glyph).toBe("丙");
    expect(f.partner.dayMaster.glyph).toBe("壬");
    expect(f.pair.dayMasters.stems.map((r) => r.type)).toContain("천간충(天干沖)");
    expect(f.pair.dayBranches.map((r) => r.type)).toContain("충(沖)");
    expect(f.pair.dayMasters.partnerIsToMe).toBe("편관");
    expect(f.pair.dayMasters.meIsToPartner).toBe("편재");
    expect(f.pair.dayMasters.meeting).toBe("水剋火: 그 사람의 일간이 내 일간을 다듬는(누르는) 쪽이에요");
    expect(f.pair.dayMasters.images).toBe("하늘의 해 × 큰 강과 바다");
  });

  it("reads a combination between day masters (丙 × 辛)", () => {
    const f = buildMatchFacts(me, chart(1992, 1, 26), { relation: "friend" }, NOW);
    expect(f.pair.dayMasters.stems.map((r) => r.type)).toContain("천간합(天干合)");
    expect(f.pair.dayMasters.partnerIsToMe).toBe("정재");
    expect(f.pair.dayMasters.meIsToPartner).toBe("정관");
  });

  it("lists what each chart fills in the other by definition", () => {
    const partner = chart(1992, 2, 26);
    const f = buildMatchFacts(me, partner, { relation: "coworker" }, NOW);
    const mine = f.me.elements.counts;
    const theirs = f.partner.elements.counts;
    const fills = (Object.keys(mine) as Array<keyof typeof mine>).filter((e) => mine[e] === 0 && theirs[e] > 0);
    expect(f.pair.elements.partnerFillsMine).toHaveLength(fills.length);
    expect(f.pair.elements.me).toEqual(mine);
  });

  it("names the time-unknown limit per person and never grades the pair", () => {
    const f = buildMatchFacts(me, chart(1992, 2, 26), { relation: "family" }, NOW);
    expect(f.pair.limits.join(" ")).toContain("그 사람은 태어난 시를 몰라");
    // Worded so the line passes the match validators when the model copies it (no 점수, no 궁합 판정).
    expect(f.pair.limits.join(" ")).toContain("두 사람을 좋고 나쁨으로 가르거나 수치로 매기지 않았어요");
    expect(JSON.stringify(f.pair)).not.toMatch(/점수|점\b|%|천생연분|궁합/);
  });

  it("allows my glyphs, ten gods and years, the shared years, and of the other person only the day stem (owner 2026-10-17)", () => {
    const f = buildMatchFacts(me, chart(1992, 2, 26), { relation: "spouse", label: "민지", concern: "요즘 대화가 줄었어요" }, NOW);
    expect(f.allowed.glyphs).toEqual(expect.arrayContaining(["丙", "寅", "壬"]));
    expect(f.allowed.glyphs).not.toContain("申");
    expect(f.allowed.tenGods).toEqual(expect.arrayContaining(["편관", "편재"]));
    expect(f.allowed.years).toEqual(expect.arrayContaining([1990, 2026]));
    expect(f.allowed.years).not.toContain(1992);
    expect(f.label).toBe("민지");
    for (const line of f.pair.luck.sharedYears) expect(line).toMatch(/^20\d\d년 /);
  });

  it("calls the same 일지 in two charts 같은 글자, never 자형, and gives neither chart the standard reading's monthly (M3)", () => {
    const f = buildMatchFacts(chart(1990, 1, 5), chart(1990, 1, 17, { gender: "male" }), { relation: "friend" }, NOW); // 庚午 × 壬午
    expect(f.pair.dayBranches).toEqual([{ type: "같은 글자", note: "같은 글자가 겹침" }]);
    expect(JSON.stringify(f.pair)).not.toContain("午");
    expect(JSON.stringify(f.pair)).not.toContain("자형");
    expect([f.me.monthly, f.partner.monthly]).toEqual([undefined, undefined]);
  });

  it("asks the 일지 절 for no relation when the two 일지 have none (丙寅 × 戊子)", () => {
    const f = buildMatchFacts(me, chart(1996, 10, 18, { gender: "male" }), { relation: "friend" }, NOW);
    expect(f.pair.dayBranches).toEqual([]);
    expect(validateMatchPartA(mockMatchPartA(f), f).filter((v) => v.includes("계산된 관계"))).toEqual([]);
  });

  it("hands over no relation between the other pillars, nor the other person's pillars, 대운 or birth year (owner 2026-10-17)", () => {
    const f = buildMatchFacts(chart(1990, 3, 1), chart(1990, 5, 1, { gender: "male" }), { relation: "friend" }, NOW); // 庚午 戊寅 乙丑 × 庚午 庚辰 丙寅
    const pair = JSON.stringify(f.pair);
    expect(pair).not.toMatch(/그 사람의 (년|월|시)|庚辰|丙寅/);
    expect(f.pair).not.toHaveProperty("pillars");
    expect(f.pair.elements.partner).toEqual({ most: expect.any(Array), fewest: expect.any(Array) });
    expect(f.pair.luck.partner).toMatch(/^그 사람의 대운(이 [123]년 안에 바뀌어요|은 3년 안에는 바뀌지 않아요)$/);
    expect(f.pair.luck.currentKo).toEqual(f.me.luck?.current ? [f.me.luck.current.ko] : []);
  });

  it("counts a year for both only when its 세운 meets each 일지 by a relation; 같은 글자 is no meeting (M2)", () => {
    // 辛未 × 壬午: 2026 午 and 2027 未 each meet one 일지 by 육합 and the other by 같은 글자 alone
    expect(buildMatchFacts(chart(1990, 1, 6), chart(1990, 1, 17, { gender: "male" }), { relation: "friend" }, NOW).pair.luck.sharedYears).toEqual([]);
    // 丙子 × 辛未: 2026 午 clashes with 子 and combines with 未; 2027 未 harms 子 but is only 같은 글자 to 未
    expect(buildMatchFacts(chart(1990, 1, 11), chart(1990, 1, 6), { relation: "friend" }, NOW).pair.luck.sharedYears)
      .toEqual(["2026년 병오(丙午): 나의 일지와 충(沖), 그 사람의 일지와 육합(六合)"]);
  });

  it("gives the five cards the element relations of the two sides, the middle and the last two places (C1, B6)", () => {
    const ids = ["wands-03", "cups-05", "swords-02", "pentacles-04", "major-19-sun"];
    const ctx = matchCardsContext("lover", ids.map((cardId, slot) => ({ cardId, position: TEMPLATES.match.positions[slot]!, orientation: "upright" as const, slot })));
    const shared = matchCardsShared(buildMatchFacts(me, chart(1992, 2, 26), { relation: "lover" }, NOW), ctx);
    expect(shared).toContain("<spread_facts>");
    expect(shared).toContain("나와 그 사람 쪽 원소 관계: 나의 마음(완드 3) × 그 사람 쪽 흐름(컵 5) 서로 부딪히는 짝");
    expect(shared).toContain("두 사람 사이 기준 원소 관계: 두 사람 사이(검 2) × 나의 마음(완드 3) 서로 돕는 짝, 두 사람 사이(검 2) × 그 사람 쪽 흐름(컵 5) 무난한 짝");
    expect(shared).toContain("엇갈리는 지점과 함께 가꿀 방향 원소 관계: 엇갈리는 지점(펜타클 4) × 함께 가꿀 방향(태양) 무난한 짝");
  });

  it("states element meetings both ways", () => {
    expect(elementMeeting("목", "화")).toBe("木生火: 내 일간이 그 사람의 일간을 돕는 쪽이에요");
    expect(elementMeeting("화", "목")).toBe("木生火: 그 사람의 일간이 내 일간을 돕는 쪽이에요");
    expect(elementMeeting("금", "목")).toBe("金剋木: 내 일간이 그 사람의 일간을 다듬는(누르는) 쪽이에요");
    expect(elementMeeting("토", "토")).toBe("두 일간이 같은 흙(土) 기운이에요");
  });
});
