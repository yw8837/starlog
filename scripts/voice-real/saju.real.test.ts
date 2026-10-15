// One attempt of the real 정통 사주 for a tester's chart: saves each call's draft and its violations (hard/soft),
// so prompt/validator fixes can be re-checked offline on the same draft. Never regenerates.
// Since 2026-10-08 the reading is calls started together (saju-enrichment: 7절·8절, with a code-built fallback), and since
// 2026-10-16 the main reading is two halves (saju-reading: 1–3절 and 계산 기준; saju-reading-b: 4–6절, the observation and the
// card); each call is timed and checked by its own validator.
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
import { validateSajuEnrichment, validateSajuReading, validateSajuReadingPartA, validateSajuReadingPartB } from "@/lib/ai/validate";
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
  const attempts: { task: string; seconds: number; violations: string[]; data: unknown }[] = [];
  const check = (task: string, data: unknown) =>
    task === "saju-enrichment" ? validateSajuEnrichment(data as never, facts)
      : task === "saju-reading-b" ? validateSajuReadingPartB(data as never, facts) : validateSajuReadingPartA(data as never, facts);
  const provider: ReadingProvider = {
    name: real.name,
    async generate(task, attempt, feedback, hooks) {
      if (attempt > 1) throw new GenerationError("UPSTREAM", ["stopped-after-attempt-1"]);
      const t0 = Date.now();
      try {
        const result = await real.generate(task, attempt, feedback, hooks);
        usage.push(...result.usage);
        attempts.push({ task: task.name, seconds: (Date.now() - t0) / 1000, violations: check(task.name, result.data), data: result.data });
        return result;
      } catch (error) {
        attempts.push({ task: task.name, seconds: (Date.now() - t0) / 1000, violations: [`call failed: ${(error as Error).message}`], data: null });
        throw error;
      }
    },
  };
  const started = Date.now();
  let merged: { violations: string[]; enrichment: string; data: unknown } | null = null;
  try {
    const result = await generateSajuReading(provider, facts);
    merged = { violations: validateSajuReading(result.data, facts), enrichment: result.enrichment, data: result.data };
  } catch {
    // attempt 2 is stopped on purpose; each call's draft and its violations are in `attempts`
  }
  const usd = usdOf(usage);
  const seconds = Math.round((Date.now() - started) / 100) / 10;
  writeFileSync(`${out}/${nick}-saju-attempt1.json`, JSON.stringify({ birth, facts, attempts, merged, usage, usd, seconds }, null, 2));
  for (const a of attempts) {
    console.log(`${a.task} · ${a.seconds}s`);
    for (const v of a.violations) console.log(`  ${isSoftViolation(v) ? "[soft]" : "[HARD]"} ${v}`);
  }
  if (merged) {
    console.log(`merged (7·8절 from ${merged.enrichment})`);
    for (const v of merged.violations) console.log(`  ${isSoftViolation(v) ? "[soft]" : "[HARD]"} ${v}`);
  }
  console.log(`${nick} · calls ${attempts.length} · ${seconds}s · $${usd.toFixed(4)}`);
  expect(attempts.filter((a) => a.task === "saju-reading").length).toBe(1);
});
