// Real-API smoke run (not in CI): one money-template teaser + full reading, one daily card and one
// saju teaser for a non-sample chart. Prints validation results, token usage and an estimated cost.
// usage: pnpm ai:smoke   (ANTHROPIC_API_KEY in the environment or apps/web/.env.local)
import { mkdirSync, writeFileSync } from "node:fs";
import { DEFAULT_REVERSAL_RATE, TEMPLATES, computeChart, createDeck, pickCards } from "@starlog/core";
import { expect, test } from "vitest";
import { anthropicProvider } from "@/lib/ai/anthropic";
import { generateDaily, generateSajuTeaser, generateTarotReading, generateTarotTeaser } from "@/lib/ai/generate";
import { buildFactSet } from "@/lib/ai/prompts/saju";
import { buildTarotContext } from "@/lib/ai/prompts/tarot";
import type { Usage } from "@/lib/ai/provider";
import { validateDaily, validateSajuTeaser, validateTarotReading, validateTarotTeaser } from "@/lib/ai/validate";
import { DEFAULT_SAJU_FORM, toSajuInput } from "@/lib/sajuForm";

/** USD per million tokens, claude-opus-5-5 (fallback models are billed at their own rates; treated the same here). */
const PRICE = { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 };
const KRW_PER_USD = Number(process.env.KRW_PER_USD ?? 1400);

const costUsd = (usage: Usage[]) =>
  usage.reduce((sum, u) => sum + (u.inputTokens * PRICE.input + u.outputTokens * PRICE.output + u.cacheWriteTokens * PRICE.cacheWrite + u.cacheReadTokens * PRICE.cacheRead) / 1e6, 0);

test("ai smoke", async () => {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) {
    console.log("ai:smoke: ANTHROPIC_API_KEY is not set, nothing was called.");
    return;
  }
  const provider = anthropicProvider(key);
  const rows: Array<{ name: string; ms: number; violations: string[]; usage: Usage[] }> = [];
  const outputs: Record<string, unknown> = {};
  const run = async <T>(name: string, fn: () => Promise<{ data: T; usage: Usage[] }>, recheck: (data: T) => string[]) => {
    const started = Date.now();
    try {
      const { data, usage } = await fn();
      rows.push({ name, ms: Date.now() - started, violations: recheck(data), usage });
      outputs[name] = data;
    } catch (error) {
      rows.push({ name, ms: Date.now() - started, violations: [`FAILED: ${error instanceof Error ? error.message : String(error)}`], usage: [] });
    }
  };

  const seed = `smoke-${Date.now()}`;
  const cards = pickCards(createDeck(seed, DEFAULT_REVERSAL_RATE), TEMPLATES["self-flow"], [5, 25, 50]);
  const money = buildTarotContext("self-flow", cards, {
    topicId: "money", whoId: "me", whenId: "week", question: "",
    conditions: [{ label: "지금 상황", value: "수입이 들쭉날쭉" }, { label: "관심 방향", value: "지출 줄이기" }],
    note: "이번 달 카드값이 예상보다 많이 나왔어요",
  });
  await run("tarot-teaser (money)", () => generateTarotTeaser(provider, money), (d) => validateTarotTeaser(d, money));
  await run("tarot-reading (money)", () => generateTarotReading(provider, money), (d) => validateTarotReading(d, money));

  const dailyCards = pickCards(createDeck(`${seed}-daily`, DEFAULT_REVERSAL_RATE), TEMPLATES.daily, [0]);
  const daily = buildTarotContext("daily", dailyCards, null);
  await run("daily", () => generateDaily(provider, daily), (d) => validateDaily(d, daily));

  const chart = computeChart(toSajuInput({ ...DEFAULT_SAJU_FORM, year: 1993, month: 8, day: 17, timeKnown: true, hour: 7, minute: 20, gender: "male", placeId: "busan" }));
  const facts = buildFactSet(chart, Date.now());
  await run("saju-teaser (1993-08-17 07:20 부산 남)", () => generateSajuTeaser(provider, facts), (d) => validateSajuTeaser(d, facts));

  console.log("\nai:smoke results (model claude-opus-5-5; cost at Opus 5.5 list prices, KRW %d/USD)", KRW_PER_USD);
  let total = 0;
  for (const row of rows) {
    const tokens = row.usage.reduce((s, u) => ({ in: s.in + u.inputTokens, out: s.out + u.outputTokens, cw: s.cw + u.cacheWriteTokens, cr: s.cr + u.cacheReadTokens }), { in: 0, out: 0, cw: 0, cr: 0 });
    const usd = costUsd(row.usage);
    total += usd;
    console.log(`- ${row.name}: ${row.violations.length ? "VIOLATIONS" : "valid"} in ${(row.ms / 1000).toFixed(1)}s, calls ${row.usage.length}, models ${[...new Set(row.usage.map((u) => u.model))].join("/") || "-"}`);
    console.log(`  tokens in ${tokens.in} / out ${tokens.out} / cache write ${tokens.cw} / cache read ${tokens.cr} → $${usd.toFixed(4)} ≈ ${Math.round(usd * KRW_PER_USD)}원`);
    for (const v of row.violations) console.log(`  ! ${v}`);
  }
  console.log(`total ≈ $${total.toFixed(4)} ≈ ${Math.round(total * KRW_PER_USD)}원`);

  const dir = new URL("../apps/web/test-results/", import.meta.url);
  mkdirSync(dir, { recursive: true });
  const file = new URL(`ai-smoke-${seed}.json`, dir);
  writeFileSync(file, JSON.stringify({ cards, dailyCards, facts, outputs, rows }, null, 2));
  console.log(`outputs written to ${file.pathname}`);
  expect(rows.every((row) => !row.violations.some((v) => v.startsWith("FAILED")))).toBe(true);
});
