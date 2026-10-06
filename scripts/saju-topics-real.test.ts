// 주제별 사주 tiny real check (saju-topics lite plan, step D). Controller only: calls the generation functions
// directly (no routes, no flag), like scripts/ai-smoke.test.ts.
// SAJU_TOPICS_CHECK=mock: the same cases with the mock provider. Costs nothing; run it first to see the wiring.
// SAJU_TOPICS_CHECK=anthropic: the one real check: 4 topics × C1, C3 = 8 teasers + 8 full readings (costs money,
//   needs ANTHROPIC_API_KEY). A hard cap, SAJU_TOPICS_CHECK_BUDGET_KRW (default and at most 5,000원), holds every
//   upstream call: each reserves its worst case first and is never sent past the cap.
// SAJU_TOPICS_CHECK_TOPICS=reunion · SAJU_TOPICS_CHECK_CHARTS=C3: repeat only those cases (after a fix).
// Writes every output, a readable sheet per full reading and a summary to
// apps/web/test-results/saju-topics-check/<folder>/. Never prints the key.
// usage: SAJU_TOPICS_CHECK=mock pnpm ai:check:saju-topics
//        SAJU_TOPICS_CHECK=anthropic pnpm ai:check:saju-topics
import { mkdirSync, writeFileSync } from "node:fs";
import { computeChart } from "@starlog/core";
import golden from "@content/eval/saju-topics/golden.json";
import { expect, test } from "vitest";
import { anthropicProvider } from "@/lib/ai/anthropic";
import { usdOf } from "@/lib/ai/cost";
import { generateSajuTopicReading, generateSajuTopicTeaser } from "@/lib/ai/generate";
import { mockProvider } from "@/lib/ai/mock";
import { topicFactsBlock } from "@/lib/ai/prompts/sajuTopicPrompts";
import { buildTopicFactSet, type SajuTopicFactSet } from "@/lib/ai/prompts/sajuTopics";
import { GenerationError, type GenerationHooks, type ReadingProvider, type Usage } from "@/lib/ai/provider";
import type { SajuReading } from "@/lib/ai/schemas";
import { aiTells, isSoftViolation } from "@/lib/ai/style";
import { validateSajuTopicReading, validateSajuTopicTeaser } from "@/lib/ai/validateSajuTopics";
import type { SajuTopicId } from "@/lib/reading/types";
import { toSajuInput, type SajuForm } from "@/lib/sajuForm";
import { topicLabel } from "@/lib/sajuTopics";

const MODE = process.env.SAJU_TOPICS_CHECK?.trim() ?? "";
const REAL = MODE === "anthropic";
const list = (raw: string | undefined, fallback: readonly string[]) => (raw?.trim() ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [...fallback]);
const TOPICS = list(process.env.SAJU_TOPICS_CHECK_TOPICS, golden.realRun.topics) as SajuTopicId[];
const CHARTS = list(process.env.SAJU_TOPICS_CHECK_CHARTS, golden.realRun.charts);
/** The real check stays under 5,000원; a larger SAJU_TOPICS_CHECK_BUDGET_KRW is cut to it. */
const BUDGET_CAP_KRW = 5000;
const requested = Number(process.env.SAJU_TOPICS_CHECK_BUDGET_KRW ?? BUDGET_CAP_KRW);
const BUDGET_KRW = Math.min(BUDGET_CAP_KRW, Number.isFinite(requested) && requested > 0 ? requested : BUDGET_CAP_KRW);
/** The report uses the spec's 1,400원/$; the cap uses the server's conservative 1,500원/$. */
const REPORT_KRW_PER_USD = 1400;
const CAP_KRW_PER_USD = 1500;
const CONCURRENCY = 3;
const NOW = Date.parse(golden.evalNow);
const OUT_ROOT = new URL("../apps/web/test-results/saju-topics-check/", import.meta.url);

type Kind = "teaser" | "reading";

interface Case {
  chart: string;
  topic: SajuTopicId;
}

interface Row {
  id: string;
  chart: string;
  topic: SajuTopicId;
  kind: Kind;
  status: "ok" | "failed" | "skipped";
  error: string | null;
  attempts: number;
  attemptViolations: string[][];
  hard: string[];
  soft: string[];
  aiTells: string[];
  /** a situation chip or a written concern reached a prompt (it must not: nothing sends one) */
  chipInPrompt: boolean;
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number };
  models: string[];
  krw: number;
  capKrw: number;
  seconds: number;
}

const chartOf = (id: string) => golden.charts.find((c) => c.id === id)!;
const readingProse = (r: SajuReading) => [...r.sections.map((s) => s.body), r.observation.body].join("\n");

test("saju topics tiny real check", async () => {
  if (MODE !== "mock" && MODE !== "anthropic") {
    console.log("ai:check:saju-topics: set SAJU_TOPICS_CHECK=mock or anthropic; nothing was called.");
    return;
  }
  const unknownTopic = TOPICS.find((t) => !golden.realRun.topics.includes(t));
  if (unknownTopic) throw new Error(`SAJU_TOPICS_CHECK_TOPICS: unknown topic ${unknownTopic}`);
  const unknownChart = CHARTS.find((id) => !golden.charts.some((c) => c.id === id));
  if (unknownChart) throw new Error(`SAJU_TOPICS_CHECK_CHARTS: unknown chart ${unknownChart}`);
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (REAL && !key) {
    console.log("ai:check:saju-topics: no API key found, nothing was called.");
    return;
  }
  const base: ReadingProvider = REAL ? anthropicProvider(key!) : mockProvider;

  const now = new Date().toISOString().replace(/[:.]/g, "-");
  const folder = `${now}-${MODE}`;
  const dir = new URL(`${folder}/`, OUT_ROOT);
  mkdirSync(new URL("readable/", dir), { recursive: true });

  const cases: Case[] = CHARTS.flatMap((chart) => TOPICS.map((topic): Case => ({ chart, topic })));
  console.log(`ai:check:saju-topics ${MODE} · ${cases.length}건 × 맛보기·전체 · 상한 ${REAL ? `${BUDGET_KRW.toLocaleString("ko-KR")}원` : "0원(mock)"} · 동시 ${CONCURRENCY}`);

  // ---- the hard cap: every upstream call reserves its worst case and never starts past the cap ----
  let committedKrw = 0;
  let heldKrw = 0;
  let capped = false;
  const capKrw = (usage: readonly Usage[]) => usdOf(usage) * CAP_KRW_PER_USD;
  function budgetHooks(billed: Usage[]): { hooks: GenerationHooks; stopped: () => boolean } {
    const controller = new AbortController();
    let current = 0;
    const hooks: GenerationHooks = {
      signal: controller.signal,
      onReserve: (usage) => {
        const krw = capKrw(usage);
        if (committedKrw + heldKrw + krw > BUDGET_KRW) {
          capped = true;
          controller.abort(); // the call sees an aborted signal and is never sent
          return;
        }
        current = krw;
        heldKrw += krw;
      },
      onRelease: () => {
        heldKrw -= current;
        current = 0;
      },
      onUsage: (usage) => {
        heldKrw -= current;
        current = 0;
        committedKrw += capKrw(usage);
        billed.push(...usage);
      },
    };
    return { hooks, stopped: () => controller.signal.aborted };
  }

  /** Wraps the provider: each attempt's violations and the user prompts it was sent. */
  function recording(validate: (draft: never) => string[]) {
    const attempts: string[][] = [];
    const prompts: string[] = [];
    const provider: ReadingProvider = {
      name: base.name,
      async generate(task, attempt, feedback, hooks) {
        prompts.push(task.user);
        try {
          const result = await base.generate(task, attempt, feedback, hooks);
          attempts.push(validate(result.data as never));
          return result;
        } catch (error) {
          attempts.push([`(${error instanceof GenerationError ? error.code : "error"})`]);
          throw error;
        }
      },
    };
    return { provider, attempts, prompts };
  }

  const rows: Row[] = [];
  const teasers = new Map<string, { title: string; summary: string }>();
  const caseKey = (c: Case) => `${c.chart}-${c.topic}`;

  async function run(c: Case, kind: Kind) {
    const id = `${caseKey(c)}-${kind}`;
    const facts: SajuTopicFactSet = buildTopicFactSet(computeChart(toSajuInput(chartOf(c.chart).birth as SajuForm)), NOW, c.topic);
    const validate = (draft: never): string[] => (kind === "teaser" ? validateSajuTopicTeaser(draft, facts) : validateSajuTopicReading(draft, facts));
    const row: Row = {
      id, chart: c.chart, topic: c.topic, kind,
      status: "skipped", error: null, attempts: 0, attemptViolations: [], hard: [], soft: [], aiTells: [], chipInPrompt: false,
      tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, models: [], krw: 0, capKrw: 0, seconds: 0,
    };
    rows.push(row);
    if (capped || committedKrw + heldKrw >= BUDGET_KRW) {
      row.error = "상한에 닿아 시작하지 않음";
      console.log(`${id}: 건너뜀 · ${row.error}`);
      return;
    }
    const rec = recording(validate);
    const billed: Usage[] = [];
    const { hooks, stopped } = budgetHooks(billed);
    const started = Date.now();
    let data: unknown = null;
    try {
      data = kind === "teaser"
        ? (await generateSajuTopicTeaser(rec.provider, facts, hooks)).data
        : (await generateSajuTopicReading(rec.provider, facts, hooks)).data;
    } catch (e) {
      row.error = e instanceof GenerationError ? `${e.code}${e.detail.length ? `: ${e.detail.join(" | ")}` : ""}` : e instanceof Error ? e.constructor.name : "error";
    }
    const final = data ? validate(data as never) : [];
    const prose = !data ? "" : kind === "teaser" ? (data as { summary: string }).summary : readingProse(data as SajuReading);
    row.status = data ? "ok" : stopped() ? "skipped" : "failed";
    if (!data && stopped()) row.error = "상한에 닿아 멈춤";
    row.attempts = rec.attempts.length;
    row.attemptViolations = rec.attempts;
    row.hard = final.filter((v) => !isSoftViolation(v));
    row.soft = final.filter(isSoftViolation);
    row.aiTells = aiTells(prose).map((t) => `${t.id} ${t.label}`);
    row.chipInPrompt = rec.prompts.some((p) => /요즘 상황: (?!\(고르지 않음\))/.test(p) || /한 줄 고민/.test(p));
    row.tokens = billed.reduce((s, u) => ({ input: s.input + u.inputTokens, output: s.output + u.outputTokens, cacheRead: s.cacheRead + u.cacheReadTokens, cacheWrite: s.cacheWrite + u.cacheWriteTokens }), row.tokens);
    row.models = [...new Set(billed.map((u) => u.model))];
    row.krw = Math.round(usdOf(billed) * REPORT_KRW_PER_USD);
    row.capKrw = Math.round(capKrw(billed));
    row.seconds = Math.round((Date.now() - started) / 100) / 10;
    if (kind === "teaser" && data) teasers.set(caseKey(c), data as { title: string; summary: string });
    const input = { chart: c.chart, pillars: chartOf(c.chart).pillars, birth: chartOf(c.chart).birth, topic: c.topic };
    writeFileSync(new URL(`${id}.json`, dir), JSON.stringify({ ...row, input, output: data }, null, 2));
    if (kind === "reading" && data) {
      const reading = data as SajuReading;
      const teaser = teasers.get(caseKey(c));
      const sheet = [
        `# ${topicLabel(c.topic)} · ${c.chart} (${chartOf(c.chart).pillars})`,
        "",
        "## 이 명식의 사실 (읽는 사람용, 사용자에게 보이지 않음)",
        "",
        "```",
        topicFactsBlock(facts),
        "```",
        "",
        "## 맛보기",
        "",
        teaser ? `**${teaser.title}**\n\n${teaser.summary}` : "(맛보기 없음)",
        "",
        "## 전체 풀이",
        "",
        ...[...reading.sections, reading.observation].map((s) => `### ${s.heading}\n\n${s.body}\n`),
      ].join("\n");
      writeFileSync(new URL(`readable/${c.topic}-${c.chart}.md`, dir), sheet);
    }
    console.log(`${id}: ${row.status === "ok" && !row.hard.length ? "통과" : "실패"} · 시도 ${row.attempts} · 하드 ${row.hard.length} · AI티 ${row.aiTells.length} · ${row.krw}원 · ${row.seconds}s${row.error ? ` · ${row.error.slice(0, 160)}` : ""}`);
  }

  async function pool(items: readonly Case[], kind: Kind) {
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (next < items.length) await run(items[next++]!, kind);
    }));
  }
  // Teasers first: they cost little and show a broken prompt before the full readings spend anything.
  await pool(cases, "teaser");
  await pool(cases, "reading");

  // ---- summary (spec §12.0 pass: hard 0, attempts ≤ 1.3, cost within §11's criteria) ----
  const avg = (values: number[]) => (values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100 : 0);
  const p95 = (values: number[]) => (values.length ? [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * 0.95) - 1)]! : 0);
  const done = rows.filter((r) => r.status !== "skipped");
  const block = (kind: Kind) => {
    const r = done.filter((x) => x.kind === kind);
    return {
      n: r.length,
      failed: r.filter((x) => x.status === "failed").length,
      hard: r.reduce((n, x) => n + x.hard.length, 0),
      attemptsAvg: avg(r.map((x) => x.attempts)),
      krwAvg: avg(r.map((x) => x.krw)),
      secondsP95: p95(r.map((x) => x.seconds)),
      aiTellsAvg: avg(r.map((x) => x.aiTells.length)),
    };
  };
  const teaserBlock = block("teaser");
  const readingBlock = block("reading");
  const checks = [
    { name: "모두 완성(QUALITY 0)", pass: done.length > 0 && teaserBlock.failed + readingBlock.failed === 0 },
    { name: "최종 출력 하드 위반 0", pass: teaserBlock.hard + readingBlock.hard === 0 },
    { name: "시도 평균 1.3 이하", pass: avg(done.map((r) => r.attempts)) <= 1.3 },
    { name: "비용 평균: 전체 풀이 350원 이하, 맛보기 45원 이하(1,400원/$)", pass: readingBlock.krwAvg <= 350 && teaserBlock.krwAvg <= 45 },
    { name: "건너뛴 건 없음(상한 안)", pass: rows.every((r) => r.status !== "skipped") },
    { name: "프롬프트에 상황 칩·고민 없음", pass: rows.every((r) => !r.chipInPrompt) },
  ];
  const totalKrw = rows.reduce((n, r) => n + r.krw, 0);
  const summary = { mode: MODE, folder, evalNow: golden.evalNow, topics: TOPICS, charts: CHARTS, budgetKrw: BUDGET_KRW, spentCapKrw: Math.round(committedKrw), totalKrw, capped, teaser: teaserBlock, reading: readingBlock, checks };
  writeFileSync(new URL("summary.json", dir), JSON.stringify({ ...summary, rows }, null, 2));
  const line = (name: string, b: ReturnType<typeof block>) => `| ${name} | ${b.n} | ${b.failed} | ${b.hard} | ${b.attemptsAvg} | ${b.krwAvg} | ${b.secondsP95} | ${b.aiTellsAvg} |`;
  const md = [
    `# 주제별 사주 확인 (${folder})`,
    "",
    `${MODE} · 운 ${TOPICS.map(topicLabel).join(", ")} · 명식 ${CHARTS.join(", ")} · 비용 약 ${totalKrw.toLocaleString("ko-KR")}원(1,400원/$) · 상한 기준 ${summary.spentCapKrw.toLocaleString("ko-KR")}원 / ${BUDGET_KRW.toLocaleString("ko-KR")}원`,
    "",
    "| 묶음 | n | 실패 | 하드 | 시도 평균 | 비용 평균(원) | 시간 p95(초) | AI티 평균 |",
    "|---|---|---|---|---|---|---|---|",
    line("맛보기", teaserBlock),
    line("전체 풀이", readingBlock),
    "",
    "## 통과 기준",
    "",
    ...checks.map((c) => `- ${c.pass ? "통과" : "실패"}: ${c.name}`),
    "",
    "## 실패·위반·다시 쓴 건",
    "",
    ...rows.filter((r) => r.status !== "ok" || r.hard.length || r.attempts > 1).map((r) =>
      `- ${r.id}: ${r.status}${r.error ? ` (${r.error})` : ""}\n${r.attemptViolations.map((v, i) => `  - 시도 ${i + 1}: ${v.length ? v.join(" / ") : "위반 없음"}`).join("\n")}`),
    "",
    "읽기: readable/ 폴더의 글을 사실 블록과 견줘 읽어요(명식 사실 오류, 상대 정보·예언·금액·날짜 표현).",
    "",
  ];
  writeFileSync(new URL("summary.md", dir), md.join("\n"));
  console.log(`\n${md.slice(0, 9).join("\n")}\n${checks.map((c) => `${c.pass ? "통과" : "실패"}: ${c.name}`).join("\n")}`);
  console.log(`\n출력 폴더: apps/web/test-results/saju-topics-check/${folder}/`);

  expect(rows).toHaveLength(cases.length * 2);
  expect(committedKrw).toBeLessThanOrEqual(BUDGET_KRW);
  if (!REAL) {
    // The mock is the wiring check: every case completes on the first attempt with no hard violation.
    expect(rows.filter((r) => r.status !== "ok").map((r) => r.id)).toEqual([]);
    expect(rows.filter((r) => r.hard.length).map((r) => `${r.id}: ${r.hard.join(" / ")}`)).toEqual([]);
    expect(rows.filter((r) => r.attempts !== 1).map((r) => r.id)).toEqual([]);
    expect(rows.some((r) => r.chipInPrompt)).toBe(false);
  }
});
