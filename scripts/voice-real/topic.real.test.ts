// One attempt of a real 주제별 사주 (topic) reading for a tester's chart: saves the draft and its violations.
// Never regenerates. usage (repo root):
//   VOICE_OUT=<dir> VOICE_NICK=<nick> VOICE_TOPIC=career VOICE_BIRTH='<SajuForm JSON>' \
//   pnpm exec vitest run --config scripts/voice-real/vitest.config.ts topic.real
import { mkdirSync, writeFileSync } from "node:fs";
import { computeChart } from "@starlog/core";
import { expect, test } from "vitest";
import { anthropicProvider } from "@/lib/ai/anthropic";
import { usdOf } from "@/lib/ai/cost";
import { generateSajuTopicReading } from "@/lib/ai/generate";
import { buildTopicFactSet } from "@/lib/ai/prompts/sajuTopics";
import { GenerationError, type ReadingProvider, type Usage } from "@/lib/ai/provider";
import { isSoftViolation } from "@/lib/ai/style";
import { validateSajuTopicReading } from "@/lib/ai/validateSajuTopics";
import { DEFAULT_SAJU_FORM, toSajuInput } from "@/lib/sajuForm";

test("one real topic reading", async () => {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  expect(key, "ANTHROPIC_API_KEY").toBeTruthy();
  const out = process.env.VOICE_OUT!;
  const nick = process.env.VOICE_NICK!.trim();
  const topic = process.env.VOICE_TOPIC!.trim() as Parameters<typeof buildTopicFactSet>[2];
  const birth = JSON.parse(process.env.VOICE_BIRTH!);
  mkdirSync(out, { recursive: true });

  const facts = buildTopicFactSet(computeChart(toSajuInput({ ...DEFAULT_SAJU_FORM, ...birth })), Date.now(), topic, undefined, []);

  const real = anthropicProvider(key!);
  const usage: Usage[] = [];
  const attempts: { violations: string[]; data: unknown }[] = [];
  const provider: ReadingProvider = {
    name: real.name,
    async generate(task, attempt, feedback, hooks) {
      if (attempt > 1) throw new GenerationError("UPSTREAM", ["stopped-after-attempt-1"]);
      const result = await real.generate(task, attempt, feedback, hooks);
      usage.push(...result.usage);
      attempts.push({ violations: validateSajuTopicReading(result.data as never, facts), data: result.data });
      return result;
    },
  };
  const started = Date.now();
  try {
    await generateSajuTopicReading(provider, facts);
  } catch {
    // attempt 2 is stopped on purpose
  }
  const usd = usdOf(usage);
  const seconds = Math.round((Date.now() - started) / 100) / 10;
  writeFileSync(`${out}/${nick}-${topic}-attempt1.json`, JSON.stringify({ birth, topic, attempts, usage, usd, seconds }, null, 2));
  for (const a of attempts) for (const v of a.violations) console.log(`${isSoftViolation(v) ? "[soft]" : "[HARD]"} ${v}`);
  console.log(`${nick} ${topic} · attempts ${attempts.length} · ${seconds}s · $${usd.toFixed(4)}`);
  expect(attempts.length).toBe(1);
});
