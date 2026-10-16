import { describe, expect, it } from "vitest";
import { mockProvider } from "@/lib/ai/mock";
import type { GenerationTask, ReadingProvider } from "@/lib/ai/provider";
import type { Gate } from "@/lib/api/http";
import { DEFAULT_SAJU_FORM } from "@/lib/sajuForm";
import { chapterIdOf } from "@/lib/security/chapterToken";
import { issueDraw } from "@/lib/security/drawToken";
import { DEEP_ADAPTER, MATCH_ADAPTER, NEWYEAR_ADAPTER, type Adapter } from "./adapters";
import { preparePremiumFollowUp } from "./followup";
import { PREMIUM, PREMIUM_CHAPTER_TTL_MS } from "./products";
import { runNextPart, type PremiumContext } from "./run";

/**
 * The names screens show (owner 2026-10-17: 켈틱 크로스 10장, 프리미엄 궁합) never reach the model. If one did, the model
 * would echo it, validatePremium's tradition-name check would refuse the part and every regeneration would cost money.
 * Every task of every product is recorded: the preview, each part, and a follow-up (system, shared block and task).
 */

const SECRET = "prompt-names-test-secret-0123456789abcdef";
const NOW = Date.parse("2026-11-20T12:00:00+09:00");
const SHOWN = /켈틱|셀틱|celtic|프리미엄 궁합/i;

function recording() {
  const tasks: Array<GenerationTask<unknown>> = [];
  const provider: ReadingProvider = {
    name: "mock",
    generate(task, attempt, feedback, hooks) {
      tasks.push(task as GenerationTask<unknown>);
      return mockProvider.generate(task, attempt, feedback, hooks);
    },
  };
  return { provider, tasks };
}

const gateOf = (provider: ReadingProvider): Gate => ({ secret: SECRET, provider, owner: false, now: NOW, cookies: {}, client: "test" });

async function everyTask<B, C extends PremiumContext>(adapter: Adapter<B, C>, raw: unknown): Promise<Array<GenerationTask<unknown>>> {
  const { provider, tasks } = recording();
  const body = adapter.teaserBody.parse(raw);
  const ctx = await adapter.context(body, gateOf(provider));
  if (ctx instanceof Response) throw new Error(`context ${ctx.status}`);
  await adapter.teaser(provider, ctx);
  let done: unknown[] = [];
  let reading: unknown = null;
  while (!reading) {
    const step = await runNextPart(provider, ctx, done);
    if (step.complete) reading = step.reading;
    else done = step.parts;
  }
  const chapter = await adapter.chapterContext(body, ctx, SECRET, await chapterIdOf(reading, NOW + PREMIUM_CHAPTER_TTL_MS));
  const followUp = await preparePremiumFollowUp(chapter as Parameters<typeof preparePremiumFollowUp>[0], reading, NOW, SECRET, await chapterIdOf(reading, NOW + PREMIUM_CHAPTER_TTL_MS));
  if (followUp instanceof Response) throw new Error(`follow-up ${followUp.status}`);
  await followUp.generate(provider, [], "가장 먼저 해 볼 일은 뭘까요?");
  return tasks;
}

const textOf = (task: GenerationTask<unknown>) => [task.system, task.shared ?? "", task.user].join("\n");

describe("the screens' product names stay out of every model prompt", () => {
  it("names the products as the screens do", () => {
    expect([PREMIUM["tarot-deep"].name, PREMIUM.match.name]).toEqual(["켈틱 크로스 10장", "프리미엄 궁합"]);
  });

  it("켈틱 크로스 10장: the preview, both parts and a follow-up", async () => {
    const { drawToken } = await issueDraw("deep-tarot", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], SECRET, NOW);
    const tasks = await everyTask(DEEP_ADAPTER, {
      drawToken,
      input: { topicId: "love", whoId: "me", whenId: "month", question: "", conditions: [{ label: "지금 상태", value: "썸 타는 중" }], note: "연락은 자주 해요" },
    });
    expect(tasks.map((t) => t.name)).toEqual(["premium-teaser", "deep-tarot-part", "deep-tarot-part", "premium-followup"]);
    for (const task of tasks) {
      expect(textOf(task)).not.toMatch(SHOWN);
      expect(textOf(task)).not.toContain(PREMIUM["tarot-deep"].name);
    }
  });

  it("프리미엄 궁합: the preview, both parts and a follow-up", async () => {
    const { drawToken } = await issueDraw("match", [0, 1, 2, 3, 4], SECRET, NOW);
    const tasks = await everyTask(MATCH_ADAPTER, {
      me: { birth: DEFAULT_SAJU_FORM },
      partner: { birth: { ...DEFAULT_SAJU_FORM, year: 1992, month: 2, day: 26, gender: "male" }, label: "준호" },
      relation: "lover", concern: "요즘 대화가 줄었어요", drawToken, ack: true,
    });
    expect(tasks.map((t) => t.name)).toEqual(["premium-teaser", "match-part", "match-part", "premium-followup"]);
    for (const task of tasks) {
      expect(textOf(task)).not.toMatch(SHOWN);
      expect(textOf(task)).not.toContain(PREMIUM.match.name);
    }
  });

  it("2027 신년운세: the preview, the three parts and a follow-up", async () => {
    const tasks = await everyTask(NEWYEAR_ADAPTER, { birth: DEFAULT_SAJU_FORM, workStatus: "employee" });
    expect(tasks.map((t) => t.name)).toEqual(["premium-teaser", "newyear-part", "newyear-part", "newyear-part", "premium-followup"]);
    for (const task of tasks) expect(textOf(task)).not.toMatch(SHOWN);
  });
});
