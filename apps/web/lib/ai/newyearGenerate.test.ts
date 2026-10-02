import { computeChart } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { DEFAULT_SAJU_FORM, toSajuInput, type SajuForm } from "@/lib/sajuForm";
import { LOVE_STATUS, WORK_STATUS } from "@/lib/api/inputs";
import { assembleNewYear, generateNewYearPart, generateNewYearTeaser } from "./generatePremium";
import { mockProvider } from "./mock";
import { mockNewYearPartA, mockNewYearPartB, mockNewYearPartC, mockNewYearTeaser } from "./mockPremium";
import { NEWYEAR_SYSTEM, buildNewYearFacts, monthHeading, newyearLockedToc } from "./prompts/newyear";
import type { SajuProfile } from "./prompts/saju";
import { MODEL_BLIND_RULE } from "./style";
import { validateNewYearPartA, validateNewYearPartB, validateNewYearPartC, validateNewYearTeaser } from "./validatePremium";

const BIRTHS = [
  { year: 1993, month: 8, day: 17, timeKnown: true, hour: 7, minute: 20, gender: "male" as const, placeId: "busan" },
  { year: 1990, month: 1, day: 1 },
  { year: 1985, month: 2, day: 4, timeKnown: true, hour: 11, minute: 0 },
  { year: 2001, month: 6, day: 30, gender: "male" as const },
  { year: 1978, month: 11, day: 2, timeKnown: true, hour: 22, minute: 30 },
  { year: 1996, month: 3, day: 21, calendar: "lunar" as const },
];
const facts = (i: number) => buildNewYearFacts(computeChart(toSajuInput({ ...DEFAULT_SAJU_FORM, ...BIRTHS[i] })), { workStatus: "직장인", concern: "이직을 해야 할지 고민이에요" });
const hard = (v: string[]) => v.filter((x) => !x.startsWith("[문체]"));

/** Deterministic PRNG (mulberry32), so a failing draw can be replayed. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CONCERNS = [undefined, "이직을 해야 할지 고민이에요", "올해 돈을 모을 수 있을까요", "요즘 잠을 잘 못 자요", "결혼 준비가 걱정돼요"];

/** A random birth (time known or not, solar or lunar) and a random profile. */
function randomFacts(seed: number) {
  const r = rng(seed);
  const pick = <T,>(items: readonly T[]) => items[Math.floor(r() * items.length)]!;
  const known = r() < 0.5;
  const form: SajuForm = {
    ...DEFAULT_SAJU_FORM,
    calendar: r() < 0.2 ? "lunar" : "solar",
    year: 1950 + Math.floor(r() * 56), month: 1 + Math.floor(r() * 12), day: 1 + Math.floor(r() * 28),
    timeKnown: known, hour: known ? Math.floor(r() * 24) : null, minute: known ? Math.floor(r() * 60) : null,
    gender: r() < 0.5 ? "female" : "male", placeId: r() < 0.5 ? "seoul" : "busan",
  };
  const profile: SajuProfile = {};
  if (r() < 0.7) profile.loveStatus = pick(Object.values(LOVE_STATUS));
  if (r() < 0.7) profile.workStatus = pick(Object.values(WORK_STATUS));
  const concern = pick(CONCERNS);
  if (concern) profile.concern = concern;
  return buildNewYearFacts(computeChart(toSajuInput(form)), Object.keys(profile).length ? profile : undefined);
}

describe("new-year prompts", () => {
  it("blinds the model and bans grading and health claims", () => {
    expect(NEWYEAR_SYSTEM).toContain(MODEL_BLIND_RULE);
    expect(NEWYEAR_SYSTEM.split(MODEL_BLIND_RULE)).toHaveLength(2);
    expect(NEWYEAR_SYSTEM).toContain("## newyear-a");
    expect(NEWYEAR_SYSTEM).toContain("## newyear-c");
    expect(NEWYEAR_SYSTEM).toMatch(/좋은 달·나쁜 달/);
    expect(NEWYEAR_SYSTEM).toMatch(/장기·질병·증상 이름을 쓰지 않아요/);
    expect(NEWYEAR_SYSTEM).not.toContain("베타");
  });

  it("locks 21 headings: the year, four areas, the lucky part, twelve months, closing, observation", () => {
    const n = facts(0);
    const toc = newyearLockedToc(n);
    expect(toc).toHaveLength(21);
    expect(toc).toContain(monthHeading(n.year.months[0]!, n.year.january));
  });
});

describe("new-year validators and mocks", () => {
  it("passes the mocks for every golden birth", () => {
    BIRTHS.forEach((_, i) => {
      const n = facts(i);
      expect(hard(validateNewYearTeaser(mockNewYearTeaser(n), n)), `teaser ${i}`).toEqual([]);
      expect(hard(validateNewYearPartA(mockNewYearPartA(n), n)), `A ${i}`).toEqual([]);
      expect(hard(validateNewYearPartB(mockNewYearPartB(n), n)), `B ${i}`).toEqual([]);
      expect(hard(validateNewYearPartC(mockNewYearPartC(n), n)), `C ${i}`).toEqual([]);
    });
  });

  it("passes the mocks for random births and profiles", () => {
    for (let i = 0; i < 40; i++) {
      const n = randomFacts(3000 + i);
      const label = `${i} ${n.facts.pillars.map((p) => p.gz).join("")} ${JSON.stringify(n.facts.profile ?? {})}`;
      expect(hard(validateNewYearTeaser(mockNewYearTeaser(n), n)), `teaser ${label}`).toEqual([]);
      expect(hard(validateNewYearPartA(mockNewYearPartA(n), n)), `A ${label}`).toEqual([]);
      expect(hard(validateNewYearPartB(mockNewYearPartB(n), n)), `B ${label}`).toEqual([]);
      expect(hard(validateNewYearPartC(mockNewYearPartC(n), n)), `C ${label}`).toEqual([]);
    }
  });

  it("catches a graded month, an organ, a lucky number, an invented date and a month without its 월건", () => {
    const n = facts(0);
    const a = mockNewYearPartA(n);
    expect(validateNewYearPartA({ ...a, areas: { ...a.areas, health: { body: `${a.areas.health.body} 위장이 약해질 수 있어요.` } } }, n).join(" ")).toContain("생활 습관");
    expect(validateNewYearPartA({ ...a, lucky: { body: `${a.lucky.body} 행운의 숫자는 7이에요.` } }, n).join(" ")).toContain("행운");
    const b = mockNewYearPartB(n);
    const graded = { firstHalf: b.firstHalf.map((m, i) => (i === 2 ? { body: `${m.body} 3월은 조심해야 할 달이에요.` } : m)) };
    expect(hard(validateNewYearPartB(graded, n)).length).toBeGreaterThan(0);
    const dated = { firstHalf: b.firstHalf.map((m, i) => (i === 3 ? { body: `${m.body} 4월 18일에 계약하세요.` } : m)) };
    expect(validateNewYearPartB(dated, n).join(" ")).toContain("날짜");
    const bare = { firstHalf: b.firstHalf.map((m, i) => (i === 4 ? { body: "이 달은 차분하게 보내 보세요. ".repeat(12) } : m)) };
    expect(validateNewYearPartB(bare, n).join(" ")).toContain("5월");
    const named = { ...a, overview: { body: `${a.overview.body} Claude가 계산했어요.` } };
    expect(hard(validateNewYearPartA(named, n)).length).toBeGreaterThan(0);
  });

  it("writes three parts and assembles twelve months under code-owned headings", async () => {
    const n = facts(2);
    const preview = (await generateNewYearTeaser(mockProvider, n)).data;
    expect(preview.title.length).toBeGreaterThan(1);
    expect(preview.lockedToc).toHaveLength(21);
    const a = (await generateNewYearPart(mockProvider, n, 0, [])).data;
    const b = (await generateNewYearPart(mockProvider, n, 1, [a])).data;
    const c = (await generateNewYearPart(mockProvider, n, 2, [a, b])).data;
    const reading = assembleNewYear(n, [a, b, c]);
    expect(reading.months).toHaveLength(12);
    expect(reading.months[1]!.heading).toBe(monthHeading(n.year.months[1]!, n.year.january));
    expect(reading.months.map((m) => m.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});
