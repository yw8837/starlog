// One attempt of the real 정통 사주 for a tester's chart: saves the draft and its violations (hard/soft),
// so prompt/validator fixes can be re-checked offline on the same draft. Never regenerates.
// usage (repo root): VOICE_OUT=<dir> VOICE_NICK=<nick> VOICE_BIRTH='<SajuForm fields as JSON>' \
//   pnpm exec vitest run --config scripts/voice-real/vitest.config.ts saju.real
import { mkdirSync, writeFileSync } from "node:fs";
import { computeChart } from "@starlog/core";
import { expect, test } from "vitest";
import { anthropicProvider } from "@/lib/ai/anthropic";
import { usdOf } from "@/lib/ai/cost";
import { generateSajuReading } from "@/lib/ai/generate";
import { buildFactSet } from "@/lib/ai/prompts/saju";
import { GenerationError, type ReadingProvider, type Usage } from "@/lib/ai/provider";
import { isSoftViolation } from "@/lib/ai/style";
import { validateSajuReading } from "@/lib/ai/validate";
import { DEFAULT_SAJU_FORM, toSajuInput } from "@/lib/sajuForm";

/** 도비 (1988-08-15 10:22 양력, 서울, 여) when VOICE_BIRTH is not set. */
const DOBY = { calendar: "solar", year: 1988, month: 8, day: 15, timeKnown: true, hour: 10, minute: 22, gender: "female", placeId: "seoul" };

test("one real saju reading", async () => {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  expect(key, "ANTHROPIC_API_KEY").toBeTruthy();
  const out = process.env.VOICE_OUT!;
  const nick = process.env.VOICE_NICK?.trim() || "doby";
  const birth = process.env.VOICE_BIRTH ? JSON.parse(process.env.VOICE_BIRTH) : DOBY;
  mkdirSync(out, { recursive: true });

  const facts = buildFactSet(computeChart(toSajuInput({ ...DEFAULT_SAJU_FORM, ...birth })), Date.now(), undefined, []);

  const real = anthropicProvider(key!);
  const usage: Usage[] = [];
  const attempts: { violations: string[]; data: unknown }[] = [];
  const provider: ReadingProvider = {
    name: real.name,
    async generate(task, attempt, feedback, hooks) {
      if (attempt > 1) throw new GenerationError("UPSTREAM", ["stopped-after-attempt-1"]);
      const result = await real.generate(task, attempt, feedback, hooks);
      usage.push(...result.usage);
      attempts.push({ violations: validateSajuReading(result.data as never, facts), data: result.data });
      return result;
    },
  };
  const started = Date.now();
  try {
    await generateSajuReading(provider, facts);
  } catch {
    // attempt 2 is stopped on purpose; the draft and its violations are in `attempts`
  }
  const usd = usdOf(usage);
  const seconds = Math.round((Date.now() - started) / 100) / 10;
  writeFileSync(`${out}/${nick}-saju-attempt1.json`, JSON.stringify({ birth, facts, attempts, usage, usd, seconds }, null, 2));
  for (const a of attempts) for (const v of a.violations) console.log(`${isSoftViolation(v) ? "[soft]" : "[HARD]"} ${v}`);
  console.log(`${nick} · attempts ${attempts.length} · ${seconds}s · $${usd.toFixed(4)}`);
  expect(attempts.length).toBe(1);
});
