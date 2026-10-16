import { computeChart } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { mockProvider } from "@/lib/ai/mock";
import { mockMatchPartA } from "@/lib/ai/mockPremium";
import { MATCH_SAJU_SYSTEM, buildMatchFacts } from "@/lib/ai/prompts/match";
import { ymKo } from "@/lib/ai/prompts/saju";
import type { GenerationTask, ReadingProvider } from "@/lib/ai/provider";
import { validateMatchPartA } from "@/lib/ai/validatePremium";
import type { Gate } from "@/lib/api/http";
import { DEFAULT_SAJU_FORM, toSajuInput } from "@/lib/sajuForm";
import { chapterIdOf } from "@/lib/security/chapterToken";
import { issueDraw } from "@/lib/security/drawToken";
import { MATCH_ADAPTER } from "./adapters";
import { preparePremiumFollowUp } from "./followup";
import { PREMIUM_CHAPTER_TTL_MS } from "./products";
import { runNextPart, type PremiumContext } from "./run";

/**
 * Owner 2026-10-17 (H1, "글에서 빼기"): a 궁합 reading names the other person by their day master, the tilt of their
 * elements and the names of the relations between the two charts only. Their pillars, their 일지·년지, their 대운
 * (period, start, 간지) and their birth year never reach the model, so they never reach the text the account and the
 * device keep; the validator refuses them as a safety net.
 */

const SECRET = "match-partner-text-secret-0123456789abcdef";
const NOW = Date.parse("2026-11-20T12:00:00+09:00");
const PARTNER = { ...DEFAULT_SAJU_FORM, year: 1992, month: 2, day: 26, timeKnown: true, hour: 8, minute: 30, gender: "male" as const };
const BODY = { me: { birth: DEFAULT_SAJU_FORM }, partner: { birth: PARTNER, label: "준호" }, relation: "lover", concern: "요즘 대화가 줄었어요", ack: true };

const gateOf = (provider: ReadingProvider): Gate => ({ secret: SECRET, provider, owner: false, now: NOW, cookies: {}, client: "test" });

async function written() {
  const tasks: Array<GenerationTask<unknown>> = [];
  const provider: ReadingProvider = {
    name: "mock",
    generate(task, attempt, feedback, hooks) {
      tasks.push(task as GenerationTask<unknown>);
      return mockProvider.generate(task, attempt, feedback, hooks);
    },
  };
  const { drawToken } = await issueDraw("match", [0, 1, 2, 3, 4], SECRET, NOW);
  const body = MATCH_ADAPTER.teaserBody.parse({ ...BODY, drawToken });
  const ctx = (await MATCH_ADAPTER.context(body, gateOf(provider))) as Extract<PremiumContext, { product: "match" }>;
  await MATCH_ADAPTER.teaser(provider, ctx);
  const first = await runNextPart(provider, ctx, []);
  const last = await runNextPart(provider, ctx, first.parts);
  if (!last.complete) throw new Error("not finished");
  const chapter = await MATCH_ADAPTER.chapterContext(body, ctx, SECRET, await chapterIdOf(last.reading, NOW + PREMIUM_CHAPTER_TTL_MS));
  const followUp = await preparePremiumFollowUp(chapter as Parameters<typeof preparePremiumFollowUp>[0], last.reading, NOW, SECRET, await chapterIdOf(last.reading, NOW + PREMIUM_CHAPTER_TTL_MS));
  if (followUp instanceof Response) throw new Error("follow-up refused");
  await followUp.generate(provider, [], "대화를 어떻게 시작하면 좋을까요?");
  return { tasks, reading: last.reading, facts: ctx.match, partA: first.parts[0] };
}

/** What only the other person's chart holds: pillar 간지, 일지·년지 glyphs, 대운 간지 and start months, the birth year. */
function partnerOnly(f: Awaited<ReturnType<typeof written>>["facts"]["facts"]) {
  // Whatever my own facts or the pair facts already say (my pillars and 대운, this year's 세운) is no leak.
  const mine = JSON.stringify({ me: f.me, pair: f.pair });
  const pillars = f.partner.pillars.filter((p) => !mine.includes(p.gz));
  const branches = f.partner.pillars.filter((p) => p.pillar.includes("일주") || p.pillar.includes("년주")).map((p) => p.gz.charAt(1)).filter((g) => !mine.includes(g));
  const cycles = (f.partner.luck?.cycles ?? []).filter((c) => !mine.includes(c.gz));
  const months = (f.partner.luck?.cycles ?? []).flatMap((c) => (c.from && !mine.includes(c.from) ? [c.from, ymKo(c.from)] : []));
  return { pillars, branches, cycles, months, year: String(f.partner.input.birthYear) };
}

function expectNone(text: string, p: ReturnType<typeof partnerOnly>) {
  for (const pillar of p.pillars) {
    expect(text, pillar.gz).not.toContain(pillar.gz);
    expect(text, pillar.ko).not.toMatch(new RegExp(`${pillar.ko}(\\(|년|월|일|시|주)`));
  }
  for (const glyph of p.branches) expect(text, glyph).not.toContain(glyph);
  for (const cycle of p.cycles) expect(text, cycle.gz).not.toContain(cycle.gz);
  for (const month of p.months) expect(text, month).not.toContain(month);
  expect(text).not.toContain(p.year);
}

describe("the other person in a 궁합 (owner 2026-10-17 H1)", () => {
  it("reaches the model as their day master, the tilt of their elements and relation names only", async () => {
    const { tasks, facts } = await written();
    const p = partnerOnly(facts.facts);
    expect(p.pillars.length).toBeGreaterThanOrEqual(3);
    expect(p.months.length).toBeGreaterThan(0);
    expect(tasks.map((t) => t.name)).toEqual(["premium-teaser", "match-part", "match-part", "premium-followup"]);
    for (const task of tasks) expectNone([task.system, task.shared ?? "", task.user].join("\n"), p);
    const shared = tasks[0]!.shared ?? "";
    expect(shared).toContain(facts.facts.partner.dayMaster.display);
    expect(shared).toMatch(/그 사람의 대운|대운이 .*바뀌|바뀌지 않아요/);
  });

  it("stays out of the reading the account and the device keep (the mock reading, written part by part)", async () => {
    const { reading, facts } = await written();
    expectNone(JSON.stringify(reading), partnerOnly(facts.facts));
  });

  it("is refused by the validator as a safety net: their pillars, 대운 months and birth year", async () => {
    const { facts, partA } = await written();
    const f = facts.facts;
    const p = partnerOnly(f);
    const base = (partA ?? mockMatchPartA(f)) as ReturnType<typeof mockMatchPartA>;
    const withLine = (line: string) => validateMatchPartA({ ...base, luck: { body: `${base.luck.body} ${line}` } }, f);
    expect(validateMatchPartA(base, f).filter((v) => v.includes("그 사람의"))).toEqual([]);
    expect(withLine(`준호의 년주는 ${p.pillars[0]!.ko}(${p.pillars[0]!.gz})예요.`).join(" ")).toMatch(/그 사람의 (기둥|간지)/);
    expect(withLine(`준호는 ${p.months[1]} 무렵 대운이 바뀌어요.`).join(" ")).toMatch(/그 사람의 대운/);
    expect(withLine(`준호는 ${p.year}년생이에요.`).join(" ")).toMatch(/그 사람의 (출생|생년)/);
  });
});

describe("two 일지 of the same glyph (review 2026-10-17 #3)", () => {
  // 1990-01-05 庚午 (me) × 1990-01-17 壬午 (the other person): the relation is 같은 글자, so naming that glyph for them
  // would name their 일지.
  const facts = buildMatchFacts(computeChart(toSajuInput({ ...DEFAULT_SAJU_FORM, day: 5 })), computeChart(toSajuInput({ ...DEFAULT_SAJU_FORM, day: 17, gender: "male" })), { relation: "friend", label: "민지" }, NOW);
  const base = mockMatchPartA(facts);
  const said = (line: string) => validateMatchPartA({ ...base, pillars: { body: `${base.pillars.body} ${line}` } }, facts).filter((v) => v.includes("그 사람의 일지"));

  it("refuses the glyph or its reading said for the other person's 일지, and lets my own 일지 be named", () => {
    expect(facts.pair.dayBranches.map((r) => r.type)).toEqual(["같은 글자"]);
    expect(said("")).toEqual([]);
    expect(said("두 사람 모두 일지가 午예요.")).toHaveLength(1);
    expect(said("민지의 일지도 오(午)라서 같은 글자예요.")).toHaveLength(1);
    expect(said("그 사람 일지는 오화예요.")).toHaveLength(1);
    expect(said("나의 일지는 오(午)예요.")).toEqual([]);
    expect(said("두 사람의 일지는 같은 글자예요.")).toEqual([]);
    // A year's 간지 is no 일지 of theirs, even when it holds the glyph.
    expect(said("2026년 병오(丙午)는 나의 일지와 그 사람의 일지 모두와 같은 글자예요.")).toEqual([]);
  });

  it("tells the model not to write that glyph for them", () => {
    expect(MATCH_SAJU_SYSTEM).toContain("두 일지가 같은 글자라도");
  });
});

// The engine's pillars for the two births, so a later engine change shows up here first.
describe("the births above", () => {
  it("are 丙寅 (me) and 壬申 (the other person) by their day pillars", () => {
    expect(computeChart(toSajuInput(DEFAULT_SAJU_FORM)).pillars.day.stem + computeChart(toSajuInput(DEFAULT_SAJU_FORM)).pillars.day.branch).toBe("丙寅");
    expect(computeChart(toSajuInput(PARTNER)).pillars.day.stem + computeChart(toSajuInput(PARTNER)).pillars.day.branch).toBe("壬申");
  });
});
