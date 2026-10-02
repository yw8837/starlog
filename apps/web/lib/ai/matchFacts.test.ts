import { computeChart } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { DEFAULT_SAJU_FORM, toSajuInput } from "@/lib/sajuForm";
import { buildMatchFacts, elementMeeting } from "./prompts/match";

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

  it("allows the glyphs, ten gods and years of both charts and of the shared years", () => {
    const f = buildMatchFacts(me, chart(1992, 2, 26), { relation: "spouse", label: "민지", concern: "요즘 대화가 줄었어요" }, NOW);
    expect(f.allowed.glyphs).toEqual(expect.arrayContaining(["丙", "寅", "壬", "申"]));
    expect(f.allowed.tenGods).toEqual(expect.arrayContaining(["편관", "편재"]));
    expect(f.allowed.years).toEqual(expect.arrayContaining([1990, 1992, 2026]));
    expect(f.label).toBe("민지");
    for (const line of f.pair.luck.sharedYears) expect(line).toMatch(/^20\d\d년 /);
  });

  it("states element meetings both ways", () => {
    expect(elementMeeting("목", "화")).toBe("木生火: 내 일간이 그 사람의 일간을 돕는 쪽이에요");
    expect(elementMeeting("화", "목")).toBe("木生火: 그 사람의 일간이 내 일간을 돕는 쪽이에요");
    expect(elementMeeting("금", "목")).toBe("金剋木: 내 일간이 그 사람의 일간을 다듬는(누르는) 쪽이에요");
    expect(elementMeeting("토", "토")).toBe("두 일간이 같은 흙(土) 기운이에요");
  });
});
