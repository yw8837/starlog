import { TEMPLATES, createDeck, pickCards, computeChart } from "@starlog/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HistorySchema } from "@/lib/ai/history";
import { mockProvider, mockSajuReading, mockTarotReading } from "@/lib/ai/mock";
import { buildFactSet, sajuReadingPrompt, sajuTeaserPrompt } from "@/lib/ai/prompts/saju";
import { buildTarotContext, tarotReadingPrompt, tarotTeaserPrompt } from "@/lib/ai/prompts/tarot";
import { isSoftViolation } from "@/lib/ai/style";
import { validateSajuReading, validateTarotReading } from "@/lib/ai/validate";
import { profileOf } from "@/lib/api/sajuRequest";
import { DEFAULT_SAJU_FORM, toSajuInput } from "@/lib/sajuForm";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { POST as draw } from "./tarot/draw/route";
import { POST as reading } from "./tarot/reading/route";
import { POST as teaser } from "./tarot/teaser/route";
import { POST as sajuReading } from "./saju/reading/route";
import { POST as sajuTeaser } from "./saju/teaser/route";

type Handler = (request: Request) => Promise<Response>;

const call = async (handler: Handler, body: unknown) => {
  const response = await handler(new Request("http://localhost/api", {
    method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "198.18.0.1" }, body: JSON.stringify(body),
  }));
  return { status: response.status, data: (await response.json()) as Record<string, any> };
};

const drawFor = async (templateId: string) => (await call(draw, { templateId, picks: [3, 30, 60] })).data.drawToken as string;

const CUSTOM = { topicId: "custom", whoId: "me" as const, topicText: "창업 준비", whoText: "나", whenText: "다음 주 금요일 면접", question: "다음 주 금요일 면접, 창업 준비는 어떻게 될까", conditions: [], note: "" };
const HISTORY = [
  { date: "2026-09-28", kind: "tarot", question: "이번 주, 나의 재물 흐름은 어떨까", verdict: "지출부터 줄이는 편이 좋아요.", observation: "카드값 알림이 줄어드는지 눈여겨보세요.", checkin: "맞았어요" },
];

beforeEach(() => {
  vi.stubEnv("STARLOG_AI", "mock");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("BETA_FULL_PER_DAY", "100");
  vi.stubEnv("BETA_TEASER_PER_DAY", "100");
  resetMemoryLimiter();
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("custom topic, who and when (question builder C4)", () => {
  it("accepts a custom topic on the who chip's spread and puts the texts inside data tags", async () => {
    const drawToken = await drawFor("self-flow");
    const res = await call(teaser, { drawToken, input: { ...CUSTOM, topicText: "창업 <준비>" } });
    expect(res.status).toBe(200);
    const ctx = buildTarotContext("self-flow", pickCards(createDeck("c", 0.3), TEMPLATES["self-flow"], [1, 2, 3]), { ...CUSTOM, topicText: "창업 <준비>" });
    const prompt = tarotReadingPrompt(ctx);
    const inside = (tag: string) => prompt.slice(prompt.indexOf(`<${tag}>`), prompt.indexOf(`</${tag}>`));
    expect(inside("custom_topic")).toContain("창업 준비");
    expect(inside("who_detail")).toContain("나");
    expect(inside("when_detail")).toContain("다음 주 금요일 면접");
    expect(prompt).not.toContain("<준비>");
    expect(prompt).toContain("사용자가 직접 쓴 주제");
  });

  it("disables only the topic-drift check for a custom topic", async () => {
    const cards = pickCards(createDeck("custom-drift", 0.3), TEMPLATES["self-flow"], [3, 30, 60]);
    const ctx = buildTarotContext("self-flow", cards, CUSTOM);
    expect(ctx.bannedWords).toEqual([]);
    const r = mockTarotReading(ctx);
    const withRomance = { ...r, alternatives: { ...r.alternatives, body: `${r.alternatives.body} 연락이 오가는 흐름도 함께 보면 좋아요.` } };
    expect(validateTarotReading(withRomance, ctx).filter((v) => !isSoftViolation(v))).toEqual([]);
    // every other rule still applies
    const guarantee = { ...r, alternatives: { ...r.alternatives, body: `${r.alternatives.body} 반드시 잘 돼요.` } };
    expect(validateTarotReading(guarantee, ctx).join(" ")).toMatch(/금지 표현/);
    // the custom 언제 may name a weekday
    const weekday = { ...r, timing: { ...r.timing, body: `${r.timing.body} 금요일 면접 전날에는 쉬어 가요.` } };
    expect(validateTarotReading(weekday, ctx).join(" ")).not.toMatch(/날짜·요일/);
  });

  it.each([
    ["a custom topic on another who's spread", { ...CUSTOM, whoId: "us" }, "self-flow", 400],
    ["a custom topic without topicText", { ...CUSTOM, topicText: "" }, "self-flow", 400],
    ["a custom topic without whoId", { ...CUSTOM, whoId: undefined }, "self-flow", 400],
    ["topicText over 30 characters", { ...CUSTOM, topicText: "가".repeat(31) }, "self-flow", 400],
    ["whoText over 30 characters", { ...CUSTOM, whoText: "나".repeat(31) }, "self-flow", 400],
    ["whenText over 30 characters", { ...CUSTOM, whenText: "다".repeat(31) }, "self-flow", 400],
    ["a crisis phrase in topicText", { ...CUSTOM, topicText: "죽고 싶어요" }, "self-flow", 422],
    ["a crisis phrase in whenText", { ...CUSTOM, whenText: "사라지고 싶은 밤" }, "self-flow", 422],
    ["a crisis phrase in whoText", { ...CUSTOM, whoText: "자해한 친구" }, "self-flow", 422],
  ])("refuses %s", async (_label, input, templateId, status) => {
    const drawToken = await drawFor(templateId);
    expect((await call(teaser, { drawToken, input })).status).toBe(status);
  });

  it("keeps whoText and whenText on a catalog topic", async () => {
    const drawToken = await drawFor("relationship");
    const res = await call(reading, { drawToken, input: { topicId: "conflict", whoId: "us", question: "", whoText: "엄마", whenText: "추석 전", conditions: [], note: "" } });
    expect(res.status).toBe(200);
    expect(res.data.reading.timing.heading).toBe("정한 때까지, 언제 움직이면 좋을지");
  });
});

describe("saju personal context (loveStatus, workStatus, concern)", () => {
  const birth = { ...DEFAULT_SAJU_FORM, year: 1995, month: 5, day: 20, timeKnown: true, hour: 14, minute: 5, gender: "male" };

  it("maps ids to labels and puts them, with the concern, inside <user_context>", () => {
    const profile = profileOf({ loveStatus: "single", workStatus: "between-jobs", concern: "이직을 <해야> 할지 고민이에요" })!;
    expect(profile).toEqual({ loveStatus: "솔로", workStatus: "구직·쉬는 중", concern: "이직을 해야 할지 고민이에요" });
    const facts = buildFactSet(computeChart(toSajuInput(birth as never)), Date.parse("2026-10-01T03:00:00Z"), profile);
    for (const prompt of [sajuTeaserPrompt(facts), sajuReadingPrompt(facts)]) {
      const context = prompt.slice(prompt.indexOf("<user_context>"), prompt.indexOf("</user_context>"));
      expect(context).toContain("연애 상태: 솔로");
      expect(context).toContain("일 상태: 구직·쉬는 중");
      expect(context).toContain("이직을 해야 할지 고민이에요");
      expect(prompt.slice(prompt.indexOf("<facts>"), prompt.indexOf("</facts>"))).not.toContain("이직");
    }
  });

  it("uses the context in the mock prologue and soft-flags a reading that ignores it", () => {
    const facts = buildFactSet(computeChart(toSajuInput(birth as never)), Date.parse("2026-10-01T03:00:00Z"), { workStatus: "구직·쉬는 중", concern: "이직을 해야 할지 고민이에요" });
    const r = mockSajuReading(facts);
    expect(validateSajuReading(r, facts)).toEqual([]);
    const ignoring = { ...r, sections: r.sections.map((s) => ({ ...s, body: s.body.replace(/지금은 [^.]*알려 줬죠\. /, "").replace(/'이직을 해야 할지 고민이에요'[^.]*\. /, "") })) };
    const found = validateSajuReading(ignoring, facts);
    expect(found.join(" ")).toMatch(/사용자가 알려 준 상황/);
    expect(found.every(isSoftViolation)).toBe(true);
  });

  it("accepts the fields on both routes and refuses bad values", async () => {
    const ok = await call(sajuTeaser, { birth, loveStatus: "dating", workStatus: "employee", concern: "회사 생활이 버거워요" });
    expect(ok.status).toBe(200);
    const full = await call(sajuReading, { birth, loveStatus: "married", workStatus: "self-employed" });
    expect(full.status).toBe(200);
    expect((await call(sajuTeaser, { birth, loveStatus: "complicated" })).status).toBe(400);
    expect((await call(sajuTeaser, { birth, concern: "가".repeat(61) })).status).toBe(400);
    const crisis = await call(sajuTeaser, { birth, concern: "요즘 죽고 싶다는 생각이 들어요" });
    expect(crisis.status).toBe(422);
    expect(crisis.data.care).toBe(true);
  });
});

describe("history (earlier readings from the device)", () => {
  it("validates the schema: at most 3 items, dates, kinds, lengths and check-in values", () => {
    expect(HistorySchema.safeParse(HISTORY).success).toBe(true);
    expect(HistorySchema.safeParse([...HISTORY, ...HISTORY, ...HISTORY, ...HISTORY]).success).toBe(false);
    expect(HistorySchema.safeParse([{ ...HISTORY[0], date: "2026/09/28" }]).success).toBe(false);
    expect(HistorySchema.safeParse([{ ...HISTORY[0], kind: "daily" }]).success).toBe(false);
    expect(HistorySchema.safeParse([{ ...HISTORY[0], question: "가".repeat(61) }]).success).toBe(false);
    expect(HistorySchema.safeParse([{ ...HISTORY[0], verdict: "가".repeat(81) }]).success).toBe(false);
    expect(HistorySchema.safeParse([{ ...HISTORY[0], observation: "가".repeat(121) }]).success).toBe(false);
    expect(HistorySchema.safeParse([{ ...HISTORY[0], checkin: "right" }]).success).toBe(false);
  });

  it("puts sanitized history inside <history> in tarot and saju prompts, and says (없음) without it", () => {
    const cards = pickCards(createDeck("h", 0.3), TEMPLATES["self-flow"], [1, 2, 3]);
    const input = { topicId: "money", whoId: "me" as const, whenId: "week" as const, question: "", conditions: [], note: "" };
    const withHistory = tarotTeaserPrompt(buildTarotContext("self-flow", cards, input, { history: [{ ...HISTORY[0]!, kind: "tarot", checkin: "맞았어요", verdict: "지출부터 <줄이는> 편이 좋아요." }] }));
    const block = withHistory.slice(withHistory.indexOf("<history>"), withHistory.indexOf("</history>"));
    expect(block).toContain("2026-09-28 · 타로 · 질문: 이번 주, 나의 재물 흐름은 어떨까");
    expect(block).toContain("사용자의 돌아보기: 맞았어요");
    expect(block).toContain("지출부터 줄이는 편이 좋아요.");
    expect(withHistory).not.toContain("<줄이는>");
    expect(tarotTeaserPrompt(buildTarotContext("self-flow", cards, input))).toContain("<history>\n(없음)\n</history>");
    const facts = buildFactSet(computeChart(toSajuInput(DEFAULT_SAJU_FORM)), Date.now(), undefined, [{ ...HISTORY[0]!, kind: "saju", checkin: "아직이에요" }]);
    const saju = sajuReadingPrompt(facts);
    expect(saju.slice(saju.indexOf("<history>"), saju.indexOf("</history>"))).toContain("사용자의 돌아보기: 아직이에요");
    expect(saju.slice(saju.indexOf("<facts>"), saju.indexOf("</facts>"))).not.toContain("재물 흐름");
  });

  it("accepts history on the tarot and saju routes and keeps it out of the chapter token", async () => {
    const drawToken = await drawFor("self-flow");
    const res = await call(reading, { drawToken, input: { topicId: "money", whoId: "me", whenId: "week", question: "", conditions: [], note: "", history: HISTORY } });
    expect(res.status).toBe(200);
    const payload = JSON.parse(Buffer.from(res.data.chapterToken.split(".")[0], "base64url").toString("utf8"));
    expect(payload.ctx.input).not.toHaveProperty("history");
    expect((await call(sajuTeaser, { birth: DEFAULT_SAJU_FORM, history: [{ ...HISTORY[0], kind: "saju" }] })).status).toBe(200);
    expect((await call(sajuTeaser, { birth: DEFAULT_SAJU_FORM, history: [{ ...HISTORY[0], checkin: "maybe" }] })).status).toBe(400);
  });

  it("is used only as prompt data: the mock provider sees the same task either way", async () => {
    const spy = vi.spyOn(mockProvider, "generate");
    const drawToken = await drawFor("self-flow");
    await call(teaser, { drawToken, input: { topicId: "money", whoId: "me", whenId: "week", question: "", conditions: [], note: "", history: HISTORY } });
    expect(spy.mock.calls[0]![0].user).toContain("<history>");
  });
});
