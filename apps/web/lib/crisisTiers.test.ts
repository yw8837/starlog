import { afterEach, describe, expect, it, vi } from "vitest";
import { CARE_PROMPT, careViolations } from "@/lib/ai/care";
import { buildRequest } from "@/lib/ai/anthropic";
import { generateValidated, type GenerationTask, type ReadingProvider } from "@/lib/ai/provider";
import { crisisCheck, crisisTierOf } from "@/lib/api/http";
import { respondGeneration } from "@/lib/api/stream";
import { mockProvider } from "@/lib/ai/mock";
import { CARE_BODY } from "@/lib/crisis";
import { z } from "zod";

/**
 * 단계별 위기 대응 (owner 2026-10-31). A reader met a refusal on her first free reading and took it for the service
 * cutting off; the guidance we follow (Anthropic, Samaritans, 보고 듣고 말하기; tiers from the Columbia scale) says to
 * acknowledge, point to people and keep the door open. A passive wish goes on to a reading written with care; a stated
 * thought of dying or self-harm gets the care screen; a plan or a means puts the emergency lines first.
 */
afterEach(() => vi.restoreAllMocks());

describe("crisis tiers", () => {
  it.each([
    "살 기 싫 어", "사라지고 싶은 밤", "살아갈 이유가 없어", "살고 싶지 않아요", "너무 힘들어서 살고 싶지 않아", "없어지고 싶어", "다 끝내고 싶어",
    "헤어지고 너무 힘들어서 사라지고 싶어요. 그 사람 다시 만날 수 있을까요?",
  ])("passive (a wish to be gone): %s", (text) => expect(crisisTierOf(text)).toBe("passive"));

  it.each([
    "죽고싶어", "자살", "자해", "목숨을 끊고 싶어", "세상을 떠나고 싶어", "그만 살고 싶어", "삶을 끝내고 싶어", "그냥 죽을래", "그냥 죽을까",
    "I want to kill myself", "헤어지고 나서 죽고 싶다는 생각이 들어요",
  ])("active (a stated thought of dying or self-harm): %s", (text) => expect(crisisTierOf(text)).toBe("active"));

  it.each(["죽고 싶어서 유서를 썼어요", "오늘 밤 죽고 싶어요", "자살 방법을 찾고 있어요", "옥상에 올라가서 죽고 싶어", "살기 싫어서 수면제를 모았어요"])(
    "urgent (a means, or a time or place with a stated thought of dying, in one sentence): %s",
    (text) => expect(crisisTierOf(text)).toBe("urgent"),
  );

  // Code review 2026-10-31: everyday words next to a passive wish sent it to the emergency screen.
  it.each([
    "헤어지고 사라지고 싶어요. 오늘 밤 연락 올까요?", "요즘 살기 싫어요. 이직 계획이 있는데 괜찮을까요", "다시 만날 방법을 찾고 싶어요. 요즘 살기 싫어요",
    "옥상 정원 있는 집으로 이사 가면 살기 싫은 마음이 나아질까요", "오늘 밤 사라지고 싶어요",
  ])("a passive wish stays passive next to a time, a plan or a place: %s", (text) => expect(crisisTierOf(text)).toBe("passive"));

  // Code review 2026-10-31: the embarrassment exemption erased real distress.
  it.each(["너무 부끄럽고 힘들어서 사라지고 싶어요", "민망하고 비참해서 사라지고 싶어", "창피한 인생 사라지고 싶어"])(
    "distress beside an embarrassed word is still passive: %s",
    (text) => expect(crisisTierOf(text)).toBe("passive"),
  );

  it.each(["옥상에서 뛰어내리고 싶어요", "투신하고 싶어요", "목을 매고 싶어요"])("a means named as a wish is a stated thought: %s", (text) =>
    expect(["active", "urgent"]).toContain(crisisTierOf(text)),
  );

  // Second review 2026-10-31: a means in another sentence or field still leads to the emergency lines.
  it.each(["요즘 사라지고 싶어요. 번개탄 사 뒀어요", "살기 싫어요. 유서도 써놨어요", "번지점프 해보고 싶어요. 옥상에서 뛰어내리고 싶어요"])(
    "urgent with a means anywhere: %s",
    (text) => expect(crisisTierOf(text)).toBe("urgent"),
  );

  it("takes a leap for fun out only right before it; 내일 alone is no emergency", () => {
    expect(crisisTierOf("번지점프 뛰어내리고 싶어요")).toBeNull();
    expect(crisisTierOf("다이빙 배우는 중인데 요즘은 그냥 뛰어내리고 싶어")).toBe("urgent");
    expect(crisisTierOf("내일 면접인데 죽고 싶어")).toBe("active");
  });

  it("reads a denial and the helpline's name as what they are", () => {
    expect(crisisTierOf("죽고 싶진 않은데 사라지고 싶어")).toBe("passive");
    expect(crisisTierOf("죽고 싶지는 않아요. 그냥 쉬고 싶어요")).toBeNull();
    expect(crisisTierOf("죽고 싶지 않은 날이 없어요")).toBe("active");
    expect(crisisTierOf("자살예방 교육 강사로 일하는데 이직운이 궁금해요")).toBeNull();
    expect(crisisTierOf("자살 예방 교육을 맡았어요")).toBeNull();
  });

  it.each(["쪽팔려서 사라지고 싶어요", "창피해서 진짜 사라지고 싶다", "너무 부끄러워서 사라지고 싶어", "민망해서 사라지고 싶었어요"])(
    "embarrassment is not a crisis: %s",
    (text) => expect(crisisTierOf(text)).toBeNull(),
  );

  it("keeps another phrase next to an embarrassed one", () => {
    expect(crisisTierOf("쪽팔려서 사라지고 싶어요. 요즘은 살기 싫어요")).toBe("passive");
    expect(crisisTierOf("창피해서 사라지고 싶고 죽고 싶어")).toBe("active");
  });

  it.each(["보고 싶어 죽겠어요", "힘들어 죽겠어요 그 사람 다시 볼 수 있을까", "그 사람이랑 다시 만날 수 있을까요?", "이 관계를 끝내고 싶어요", "회사를 그만두고 싶어요"])(
    "everyday words and hyperbole are no crisis: %s",
    (text) => expect(crisisTierOf(text)).toBeNull(),
  );
});

describe("crisisCheck", () => {
  it("goes on with care for a passive wish, and logs the route, tier and field, never the text", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = crisisCheck("tarot", "이번 달 흐름이 궁금해요", "요즘 사라지고 싶어요");
    expect(result).toEqual({ refusal: null, care: true });
    expect(warn).toHaveBeenCalledWith(JSON.stringify({ evt: "crisis", route: "tarot", tier: "passive", field: 1 }));
    expect(warn.mock.calls.flat().join(" ")).not.toContain("사라지고");
  });

  it("refuses the highest tier with the care copy; urgent says so", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const active = crisisCheck("followup", "사라지고 싶어요", "죽고 싶어요");
    expect(active.refusal?.status).toBe(422);
    expect(await active.refusal?.json()).toEqual({ code: "REFUSED", care: true, message: CARE_BODY });
    const urgent = crisisCheck("tarot", "오늘 밤 죽고 싶어요");
    expect(await urgent.refusal?.json()).toEqual({ code: "REFUSED", care: true, urgent: true, message: CARE_BODY });
  });

  it("is urgent when a stated thought of dying and a means are in different fields (code review 2026-10-31)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = crisisCheck("tarot", "죽고 싶어요", "유서 써놨어요");
    expect(await result.refusal?.json()).toMatchObject({ urgent: true });
    // A passive wish and a means in another field are urgent too; with an everyday word they are not.
    expect(await crisisCheck("tarot", "요즘 살기 싫어요", "유서 써놨어요").refusal?.json()).toMatchObject({ urgent: true });
    expect(crisisCheck("tarot", "요즘 살기 싫어요", "오늘 밤 연락 올까요?")).toEqual({ refusal: null, care: true });
    // nor with a leap for fun in another field (final review 2026-10-31)
    expect(crisisCheck("tarot", "요즘 살기 싫어요", "번지점프 뛰어내리고 싶어요")).toEqual({ refusal: null, care: true });
  });

  it("says nothing and logs nothing for an ordinary question", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(crisisCheck("tarot", "그 사람 마음이 궁금해요", undefined)).toEqual({ refusal: null, care: false });
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("돌봄 모드 in a generation", () => {
  const gate = { secret: "test-secret-0123456789-0123456789-abcdef", provider: mockProvider, owner: false, now: Date.now(), cookies: {}, client: "test-client" };

  it("carries care to every upstream call and to the body, streamed or not", async () => {
    let seen: boolean | undefined;
    let seenConcurrent: boolean | undefined;
    const run = async (hooks: Parameters<Parameters<typeof respondGeneration>[1]>[0]) => {
      seen = hooks.care;
      seenConcurrent = hooks.concurrent?.().care;
      return { body: { reading: "…" }, cookies: [] };
    };
    const json = await respondGeneration(new Request("http://localhost/api", { method: "POST" }), run, { gate, care: true });
    expect(await json.json()).toEqual({ reading: "…", care: true });
    expect([seen, seenConcurrent]).toEqual([true, true]);
    const streamed = await respondGeneration(new Request("http://localhost/api", { method: "POST", headers: { accept: "application/x-ndjson" } }), run, { gate, care: true });
    const events = (await streamed.text()).trim().split("\n").map((line) => JSON.parse(line) as { type: string; data?: unknown });
    expect(events.at(-1)).toEqual({ type: "done", data: { reading: "…", care: true } });
  });

  it("leaves a body without care untouched", async () => {
    const response = await respondGeneration(new Request("http://localhost/api", { method: "POST" }), async (hooks) => ({ body: { care: hooks.care ?? null }, cookies: [] }), { gate });
    expect(await response.json()).toEqual({ care: null });
  });

  const task: GenerationTask<{ text: string }> = { name: "tarot-reading", system: "s", user: "u", schema: z.object({ text: z.string() }), maxTokens: 100, effort: "low" } as unknown as GenerationTask<{ text: string }>;

  it("adds the care block after the user's material, outside the cached part", () => {
    const plain = buildRequest(task, 100);
    const cared = buildRequest(task, 100, undefined, true);
    expect(plain.messages[0]!.content.map((b) => ("text" in b ? b.text : ""))).not.toContain(CARE_PROMPT);
    const blocks = cared.messages[0]!.content;
    expect(blocks.at(-1)).toEqual({ type: "text", text: CARE_PROMPT });
    expect(JSON.stringify(cared.system)).not.toContain("<care>");
  });

  it("regenerates a draft written with care that names dying, with the reason as feedback", async () => {
    const drafts = [{ text: "죽고 싶은 마음이 들 때도 있죠" }, { text: "오늘은 따뜻한 밥 한 끼를 챙겨요" }];
    const feedback: Array<string[] | undefined> = [];
    const provider: ReadingProvider = {
      name: "mock",
      generate: async (_task, attempt, fb) => {
        feedback.push(fb);
        return { data: drafts[attempt - 1]! as never, usage: [] };
      },
    } as ReadingProvider;
    const result = await generateValidated(provider, task, () => [], { care: true });
    expect(result.data).toEqual({ text: "오늘은 따뜻한 밥 한 끼를 챙겨요" });
    expect(feedback[1]).toEqual(careViolations(drafts[0]));
    // Without care the same draft passes (the card name 죽음 or a quoted chip is no problem elsewhere).
    const plain = await generateValidated(provider, task, () => []);
    expect(plain.data).toEqual(drafts[0]);
  });

  it("lets the card name 죽음 through", () => expect(careViolations({ text: "죽음 카드는 한 국면이 바뀌는 흐름이에요" })).toEqual([]));

  it("lets everyday 목숨 and 극단적 through (code review 2026-10-31)", () => {
    expect(careViolations({ text: "목숨 걸고 준비한 시험처럼 애쓴 시간이었죠" })).toEqual([]);
    expect(careViolations({ text: "극단적인 결정보다 하루를 미뤄 보세요" })).toEqual([]);
    expect(careViolations({ text: "목숨을 끊는다는 말" })).not.toEqual([]);
  });
});

describe("the helpline's own name in a draft written with care", () => {
  it("passes 자살예방상담전화 109 (a real run named it, 2026-10-31) and still stops 자살 on its own", () => {
    expect(careViolations({ text: "마음이 무거운 밤에는 자살예방상담전화 109에 전화해 보세요" })).toEqual([]);
    expect(careViolations({ text: "자살을 생각하는 마음" })).not.toEqual([]);
  });
});
