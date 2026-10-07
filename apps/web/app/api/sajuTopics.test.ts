import golden from "@content/eval/saju-topics/golden.json";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockProvider } from "@/lib/ai/mock";
import { SAJU_TOPIC_SYSTEM } from "@/lib/ai/prompts/sajuTopicPrompts";
import { resetDailyStore } from "@/lib/api/dailyStore";
import { SajuBody } from "@/lib/api/inputs";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { SAJU_TOPICS, TOPIC_SECTIONS, topicLockedToc } from "@/lib/sajuTopics";
import { POST as owner } from "./owner/route";
import { POST as followup } from "./followup/route";
import { POST as sajuReading } from "./saju/reading/route";
import { POST as sajuTeaser } from "./saju/teaser/route";

type Handler = (request: Request) => Promise<Response>;

/** A device: keeps cookies between calls like a browser; `headers` adds request headers (the language). */
function device(ip: string) {
  const jar = new Map<string, string>();
  const call = async (handler: Handler, body: unknown, headers: Record<string, string> = {}) => {
    const response = await handler(
      new Request("http://localhost/api", {
        method: "POST",
        headers: { "content-type": "application/json", "cf-connecting-ip": ip, cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "), ...headers },
        body: JSON.stringify(body),
      }),
    );
    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(";");
      const index = pair!.indexOf("=");
      jar.set(pair!.slice(0, index), pair!.slice(index + 1));
    }
    return { status: response.status, data: (await response.json()) as Record<string, any> };
  };
  return { call, jar };
}

const C3 = golden.charts.find((c) => c.id === "C3")!.birth;
const T0 = Date.parse("2026-10-02T03:00:00Z"); // 12:00 KST
let ipSeq = 0;
const fresh = () => device(`203.0.113.${100 + ++ipSeq}`);
const payloadOf = (token: string) => JSON.parse(Buffer.from(token.split(".")[0]!, "base64url").toString("utf8"));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  vi.stubEnv("STARLOG_AI", "mock");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("STARLOG_OWNER_CODE", "owner-code-for-tests-0001");
  resetMemoryLimiter();
  resetDailyStore();
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("SajuBody (owner cut: a topic and no chip)", () => {
  it("defaults to 전체 흐름 and drops an older client's concern and any situation", () => {
    const parsed = SajuBody.parse({ birth: C3, concern: "이직", situation: "leaking" });
    expect(parsed.topic).toBe("overall");
    expect(parsed).not.toHaveProperty("concern");
    expect(parsed).not.toHaveProperty("situation");
    expect(SajuBody.parse({ birth: C3, topic: "money", situation: "leaking" })).not.toHaveProperty("situation");
  });

  it("takes a topic, refuses a status chip with it and an unknown topic", () => {
    expect(SajuBody.safeParse({ birth: C3, topic: "money" }).success).toBe(true);
    expect(SajuBody.safeParse({ birth: C3, topic: "money", loveStatus: "dating" }).success).toBe(false);
    expect(SajuBody.safeParse({ birth: C3, topic: "overall", loveStatus: "dating" }).success).toBe(true);
    expect(SajuBody.safeParse({ birth: C3, topic: "health" }).success).toBe(false);
  });

  it("knows exactly the topics of lib/sajuTopics.ts", () => {
    for (const topic of SAJU_TOPICS) expect(SajuBody.safeParse({ birth: C3, topic: topic.id }).success).toBe(true);
  });
});

describe("/api/saju/teaser with a topic", () => {
  it("writes the topic's teaser with its seven headings and when it goes stale", async () => {
    const res = await fresh().call(sajuTeaser, { birth: C3, topic: "money" });
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ topic: "money", lockedToc: topicLockedToc("money"), freshUntil: "2026-11-01T03:00:00.000Z" });
    expect(typeof res.data.title).toBe("string");
  });

  it("still writes 전체 흐름 for an older client, now with freshUntil and without a topic", async () => {
    const res = await fresh().call(sajuTeaser, { birth: C3 });
    expect(res.status).toBe(200);
    expect(res.data.lockedToc).toHaveLength(9); // 한눈에 보기, seven sections, the observation
    expect(res.data).not.toHaveProperty("topic");
    expect(res.data.freshUntil).toBe("2026-11-01T03:00:00.000Z");
  });

  it("refuses a status chip with a topic, and simply drops a situation key", async () => {
    expect((await fresh().call(sajuTeaser, { birth: C3, topic: "career", workStatus: "employee" })).status).toBe(400);
    expect((await fresh().call(sajuTeaser, { birth: C3, topic: "money", situation: "some" })).status).toBe(200);
  });

  it("sends only the topic's own saju records, with the topic system prompt and no chip", async () => {
    const spy = vi.spyOn(mockProvider, "generate");
    const history = [
      { date: "2026-09-28", kind: "saju", topic: "love", question: "사주 연애운 · 봄의 촛불", verdict: "연애 요약" },
      { date: "2026-09-27", kind: "saju", topic: "money", question: "사주 재물운 · 흙 속의 쇠", verdict: "재물 요약" },
      { date: "2026-09-26", kind: "tarot", question: "이번 주 재물 흐름은 어떨까", verdict: "타로 요약" },
    ];
    const res = await fresh().call(sajuTeaser, { birth: C3, topic: "money", history });
    expect(res.status).toBe(200);
    const task = spy.mock.calls[0]![0];
    expect(task).toMatchObject({ name: "saju-topic-teaser", system: SAJU_TOPIC_SYSTEM });
    expect(task.user).toContain("사주 재물운 · 흙 속의 쇠");
    expect(task.user).toContain("요즘 상황: (고르지 않음)");
    expect(task.user).not.toContain("사주 연애운");
    expect(task.user).not.toContain("이번 주 재물 흐름은 어떨까");
  });

  it("keeps topic records out of a 전체 흐름 request's history", async () => {
    const spy = vi.spyOn(mockProvider, "generate");
    const history = [
      { date: "2026-09-28", kind: "saju", topic: "love", question: "사주 연애운 · 봄의 촛불", verdict: "연애 요약" },
      { date: "2026-09-26", kind: "tarot", question: "이번 주 재물 흐름은 어떨까", verdict: "타로 요약" },
    ];
    expect((await fresh().call(sajuTeaser, { birth: C3, history })).status).toBe(200);
    expect(spy.mock.calls[0]![0].user).toContain("이번 주 재물 흐름은 어떨까");
    expect(spy.mock.calls[0]![0].user).not.toContain("사주 연애운");
  });

  it("counts topic teasers in the device's five a day, whatever the topic", async () => {
    const d = fresh();
    for (const topic of ["love", "reunion", "money", "career", "overall"]) expect((await d.call(sajuTeaser, { birth: C3, topic })).status).toBe(200);
    const sixth = await d.call(sajuTeaser, { birth: C3, topic: "money" });
    expect(sixth.status).toBe(429);
    expect(sixth.data.code).toBe("BETA_LIMIT");
  });

  it("refuses topics with the flag off, serves only the owner pass in owner mode, and keeps 전체 흐름 open", async () => {
    vi.stubEnv("NEXT_PUBLIC_SAJU_TOPICS", "off");
    const off = await fresh().call(sajuTeaser, { birth: C3, topic: "money" });
    expect(off.status).toBe(400);
    expect(off.data.field).toBe("topic");
    expect((await fresh().call(sajuTeaser, { birth: C3 })).status).toBe(200);
    vi.stubEnv("NEXT_PUBLIC_SAJU_TOPICS", "owner");
    expect((await fresh().call(sajuTeaser, { birth: C3, topic: "money" })).status).toBe(400);
    const boss = fresh();
    expect((await boss.call(owner, { code: "owner-code-for-tests-0001" })).status).toBe(200);
    expect((await boss.call(sajuTeaser, { birth: C3, topic: "money" })).status).toBe(200);
  });

  it("serves topics on Korean screens only", async () => {
    expect((await fresh().call(sajuTeaser, { birth: C3, topic: "money" }, { "x-starlog-locale": "en" })).status).toBe(400);
    expect((await fresh().call(sajuTeaser, { birth: C3 }, { "x-starlog-locale": "en" })).status).toBe(200);
  });
});

describe("/api/saju/reading with a topic", () => {
  it("opens the topic's six sections under code-owned headings, with the topic in the chapter token", async () => {
    const res = await fresh().call(sajuReading, { birth: C3, topic: "money" });
    expect(res.status).toBe(200);
    expect(res.data.reading.sections.map((s: { heading: string }) => s.heading)).toEqual(TOPIC_SECTIONS.money);
    expect(res.data.reading.observation.heading).toBe("앞으로 몇 주 · 확인해 볼 신호");
    const payload = payloadOf(res.data.chapterToken);
    expect(payload.ctx).toMatchObject({ kind: "saju", topic: "money" });
    expect(payload.ctx).not.toHaveProperty("profile");
    expect(payload.ctx).not.toHaveProperty("situation");
  });

  it("keeps 전체 흐름's token as it was: the statuses, no topic", async () => {
    const res = await fresh().call(sajuReading, { birth: C3, loveStatus: "dating" });
    expect(res.status).toBe(200);
    const payload = payloadOf(res.data.chapterToken);
    expect(payload.ctx).toMatchObject({ kind: "saju", profile: { loveStatus: "연애 중" } });
    expect(payload.ctx).not.toHaveProperty("topic");
  });
});

describe("follow-ups on a topic chapter (spec §7.7)", () => {
  it("answers with the topic prompt, and still does after the flag is turned off", async () => {
    const d = fresh();
    const r = await d.call(sajuReading, { birth: C3, topic: "career" });
    expect(r.status).toBe(200);
    vi.stubEnv("NEXT_PUBLIC_SAJU_TOPICS", "off");
    const spy = vi.spyOn(mockProvider, "generate");
    const f = await d.call(followup, { chapterToken: r.data.chapterToken, reading: r.data.reading, question: "옮긴다면 무엇을 기준으로 볼까요?" });
    expect(f.status).toBe(200);
    expect(f.data.remaining).toBe(2);
    expect(spy.mock.calls[0]![0]).toMatchObject({ name: "followup", system: SAJU_TOPIC_SYSTEM });
    expect(spy.mock.calls[0]![0].user).toContain("<topic>직업운</topic>");
    expect(spy.mock.calls[0]![0].user).toContain("요즘 상황: (고르지 않음)");
  });
});
