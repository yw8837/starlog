// Real-API smoke run (not in CI; costs money). Per run: 재물운 tarot teaser + full reading, 오늘의 한 장,
// saju teaser + full prologue for a non-sample chart with the status chips (연애·일 상태).
// SMOKE_RUNS repeats the set (default 1).
// SMOKE_MODEL / SMOKE_EFFORT apply one model and effort to every kind (default: the app's config).
// SMOKE_STAMP reuses an earlier run's stamp, so run N draws the same cards and daily card (A/B).
// SMOKE_TAROT=marriage reads 결혼운 (나, self-flow) instead of 재물운 for the tarot teaser and reading.
// Records attempts, validation, AI-tell score, tokens and cost per call; writes every output and a
// summary to apps/web/test-results/ai-smoke/<folder>/. Never prints the key.
// usage: SMOKE_RUNS=5 pnpm ai:smoke
//        SMOKE_RUNS=5 SMOKE_MODEL=claude-sonnet-5-5 SMOKE_EFFORT=high SMOKE_STAMP=<stamp> pnpm ai:smoke
import { mkdirSync, writeFileSync } from "node:fs";
import { DEFAULT_REVERSAL_RATE, TEMPLATES, TOPICS_BY_WHO, computeChart, createDeck, pickCards } from "@starlog/core";
import { expect, test } from "vitest";
import { anthropicProvider } from "@/lib/ai/anthropic";
import { EFFORTS, KIND_ENV, MODELS, generationSetting } from "@/lib/ai/config";
import { usdOf } from "@/lib/ai/cost";
import { generateDaily, generateSajuReading, generateSajuTeaser, generateTarotReading, generateTarotTeaser, withWrittenCards } from "@/lib/ai/generate";
import { buildFactSet, type SajuProfile } from "@/lib/ai/prompts/saju";
import { buildTarotContext, type TarotContext } from "@/lib/ai/prompts/tarot";
import { GenerationError, type ReadingProvider, type Usage } from "@/lib/ai/provider";
import type { DailyDraft, SajuReading, SajuTeaser, TarotReading, TarotTeaser } from "@/lib/ai/schemas";
import { aiTells } from "@/lib/ai/style";
import { validateDaily, validateSajuReading, validateSajuTeaser, validateTarotReading, validateTarotTeaser } from "@/lib/ai/validate";
import { LOVE_STATUS, WORK_STATUS } from "@/lib/api/inputs";
import { DEFAULT_SAJU_FORM, toSajuInput } from "@/lib/sajuForm";
import { dailyCard, dailyLuckyNumber } from "@/lib/security/drawToken";

const krwFromEnv = Number(process.env.KRW_PER_USD);
const KRW_PER_USD = Number.isFinite(krwFromEnv) && krwFromEnv > 0 ? krwFromEnv : 1400;
const RUNS = Math.min(10, Math.max(1, Math.trunc(Number(process.env.SMOKE_RUNS ?? 1)) || 1));
const SMOKE_MODEL = process.env.SMOKE_MODEL?.trim() || null;
const SMOKE_EFFORT = process.env.SMOKE_EFFORT?.trim() || null;
const SMOKE_STAMP = process.env.SMOKE_STAMP?.trim() || null;
const SMOKE_TAROT = process.env.SMOKE_TAROT?.trim() || "money";
/** SMOKE_KINDS=tarot-teaser,daily runs only those kinds (default: all). */
const SMOKE_KINDS = process.env.SMOKE_KINDS?.split(",").map((k) => k.trim()).filter(Boolean) ?? null;
/** SMOKE_CAP_KRW: no attempt starts unless the spend so far plus ATTEMPT_KRW for it stays under this (the owner's cap). */
const SMOKE_CAP_KRW = Number(process.env.SMOKE_CAP_KRW) > 0 ? Number(process.env.SMOKE_CAP_KRW) : Infinity;
/** A generous cost of one attempt per kind (measured: teaser 45–115원, tarot reading 187–316원, saju reading up to 413원). */
const ATTEMPT_KRW = { "tarot-teaser": 150, "tarot-reading": 400, daily: 100, "saju-teaser": 100, "saju-reading": 550 } as const;

/** The tarot input per SMOKE_TAROT: the owner's 재물운 case, or 결혼운 with its catalog chips (a talk of marriage under way). */
function smokeTarotInput() {
  if (SMOKE_TAROT === "money") {
    return {
      topicId: "money", whoId: "me" as const, whenId: "week" as const, question: "",
      conditions: [{ label: "지금 상황", value: "지금은 수입이 없음" }, { label: "관심 방향", value: "새 수입원 찾기" }],
      note: "퇴사하고 두 달째 쉬면서 다음 일을 찾고 있어요",
    };
  }
  const topic = TOPICS_BY_WHO.me.find((t) => t.id === SMOKE_TAROT && t.template === "self-flow");
  if (!topic) throw new Error(`SMOKE_TAROT must be "money" or a 나 topic on the self-flow spread (got ${SMOKE_TAROT})`);
  const whenId = (topic.whens ?? ["month"]).includes("month") ? "month" as const : topic.whens![0]!;
  return {
    topicId: topic.id, whoId: "me" as const, whenId, question: "",
    conditions: topic.conditions.map((c) => ({ label: c.label, value: c.options[Math.min(2, c.options.length - 2)]! })),
    note: "",
  };
}

type Kind = "tarot-teaser" | "tarot-reading" | "daily" | "saju-teaser" | "saju-reading";
const ROUTE: Record<Kind, string> = {
  "tarot-teaser": "/api/tarot/teaser", "tarot-reading": "/api/tarot/reading", daily: "/api/tarot/daily",
  "saju-teaser": "/api/saju/teaser", "saju-reading": "/api/saju/reading",
};

interface Row {
  run: number;
  kind: Kind;
  route: string;
  ok: boolean;
  error: string | null;
  attempts: number;
  attemptViolations: string[][];
  finalViolations: string[];
  aiTellScore: number;
  aiTells: string[];
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number };
  models: string[];
  usd: number;
  krw: number;
  seconds: number;
}

/** Wraps the real provider: counts attempts, keeps each attempt's violations and every usage entry. */
/** `guard` runs before every upstream attempt (retries included) and throws to stop at the cost cap. */
function recording(real: ReadingProvider, validate: (draft: never) => string[], guard: (usage: Usage[]) => void = () => {}) {
  const attempts: string[][] = [];
  const usage: Usage[] = [];
  const provider: ReadingProvider = {
    name: real.name,
    async generate(task, attempt, feedback) {
      guard(usage);
      try {
        const result = await real.generate(task, attempt, feedback);
        usage.push(...result.usage);
        // 7절·8절's parallel call shares the saju reading's provider but not its shape: the reading validator threw a
        // TypeError on it, so every smoke run fell back to the code-built 7절·8절 (2026-10-15). Its own validator already ran.
        attempts.push(task.name === "saju-enrichment" ? [] : validate(result.data as never));
        return result;
      } catch (error) {
        attempts.push([`(${error instanceof GenerationError ? error.code : "error"})`]);
        throw error;
      }
    },
  };
  return { provider, attempts, usage };
}

const tarotProse = (r: TarotReading) => [
  r.verdict, ...r.cards.map((c) => c.body), r.connection.body, r.timing.body, ...r.scenarios.items.map((i) => i.body),
  ...r.messages.items, r.messages.hint, ...r.avoid.items, r.alternatives.body, r.action.body, r.observation.body,
].join("\n");

test("ai smoke", async () => {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) {
    console.log("ai:smoke: no API key found, nothing was called.");
    return;
  }
  if (SMOKE_MODEL && !(MODELS as readonly string[]).includes(SMOKE_MODEL)) throw new Error(`SMOKE_MODEL must be one of ${MODELS.join(", ")}`);
  if (SMOKE_EFFORT && !(EFFORTS as readonly string[]).includes(SMOKE_EFFORT)) throw new Error(`SMOKE_EFFORT must be one of ${EFFORTS.join(", ")}`);
  if (SMOKE_STAMP && !/^[A-Za-z0-9_-]{1,80}$/.test(SMOKE_STAMP)) throw new Error("SMOKE_STAMP may use letters, digits, - and _ only");
  // Every kind gets the smoke model/effort, whatever per-kind variables .env.local holds.
  for (const suffix of Object.values(KIND_ENV)) {
    if (SMOKE_MODEL) process.env[`STARLOG_MODEL_${suffix}`] = SMOKE_MODEL;
    if (SMOKE_EFFORT) process.env[`STARLOG_EFFORT_${suffix}`] = SMOKE_EFFORT;
  }
  const settings = Object.fromEntries((Object.keys(KIND_ENV) as Array<keyof typeof KIND_ENV>).map((kind) => [kind, generationSetting(kind)]));

  const real = anthropicProvider(key);
  const now = new Date().toISOString().replace(/[:.]/g, "-");
  /** Seeds the cards and the daily device; reuse it (SMOKE_STAMP) to compare models on identical inputs. */
  const stamp = SMOKE_STAMP ?? now;
  const label = `${SMOKE_MODEL ?? "config-model"}-${SMOKE_EFFORT ?? "config-effort"}`;
  const folder = SMOKE_STAMP ? `${now}-${label}-from-${SMOKE_STAMP}` : `${now}-${label}`;
  const dir = new URL(`../apps/web/test-results/ai-smoke/${folder}/`, import.meta.url);
  mkdirSync(dir, { recursive: true });
  console.log(`ai:smoke stamp ${stamp} · 실행 ${RUNS}회 · 모델 ${SMOKE_MODEL ?? "앱 설정"} · effort ${SMOKE_EFFORT ?? "앱 설정"}`);
  const rows: Row[] = [];

  // The saju form's optional status chips, as the route maps them (profileOf). The saju side takes no free text.
  const profile: SajuProfile = { loveStatus: LOVE_STATUS.dating, workStatus: WORK_STATUS.employee };
  const saju = buildFactSet(computeChart(toSajuInput({
    ...DEFAULT_SAJU_FORM, year: 1993, month: 8, day: 17, timeKnown: true, hour: 7, minute: 20, gender: "male", placeId: "busan",
  })), Date.now(), profile);

  async function call<T>(run: number, kind: Kind, validate: (draft: never) => string[], generate: (p: ReadingProvider) => Promise<{ data: T }>,
    recheck: (data: T) => string[], prose: (data: T) => string, input: unknown) {
    if (SMOKE_KINDS && !SMOKE_KINDS.includes(kind)) return null;
    // An attempt starts only if the spend so far plus a generous estimate of one attempt stays under the cap.
    const spentWith = (usage: Usage[]) => rows.reduce((sum, r) => sum + r.krw, 0) + Math.round(usdOf(usage) * KRW_PER_USD);
    if (spentWith([]) + ATTEMPT_KRW[kind] > SMOKE_CAP_KRW) {
      console.log(`run ${run} ${kind}: 건너뜀 · 지금까지 ${spentWith([])}원, 한 번 더 하면 상한 ${SMOKE_CAP_KRW}원을 넘을 수 있어요`);
      return null;
    }
    const rec = recording(real, validate, (usage) => {
      if (spentWith(usage) + ATTEMPT_KRW[kind] > SMOKE_CAP_KRW) throw new Error(`cost cap ${SMOKE_CAP_KRW}원: stopped before another attempt (${spentWith(usage)}원 spent)`);
    });
    const started = Date.now();
    let data: T | null = null;
    let error: string | null = null;
    try {
      data = (await generate(rec.provider)).data;
    } catch (e) {
      error = e instanceof GenerationError ? `${e.code}${e.detail.length ? `: ${e.detail.join(" | ")}` : ""}` : e instanceof Error ? e.constructor.name : "error";
    }
    const finalViolations = data ? recheck(data) : [];
    const tells = data ? aiTells(prose(data)) : [];
    const usd = usdOf(rec.usage);
    const row: Row = {
      run, kind, route: ROUTE[kind],
      ok: data !== null && !finalViolations.some((v) => !v.startsWith("[문체]")),
      error, attempts: rec.attempts.length, attemptViolations: rec.attempts, finalViolations,
      aiTellScore: tells.length, aiTells: tells.map((t) => `${t.id} ${t.label}`),
      tokens: rec.usage.reduce((s, u) => ({ input: s.input + u.inputTokens, output: s.output + u.outputTokens, cacheRead: s.cacheRead + u.cacheReadTokens, cacheWrite: s.cacheWrite + u.cacheWriteTokens }), { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }),
      models: [...new Set(rec.usage.map((u) => u.model))],
      usd, krw: Math.round(usd * KRW_PER_USD), seconds: Math.round((Date.now() - started) / 100) / 10,
    };
    rows.push(row);
    writeFileSync(new URL(`${run}-${kind}.json`, dir), JSON.stringify({ ...row, input, output: data }, null, 2));
    console.log(`run ${run} ${kind}: ${row.ok ? "통과" : "실패"} · 시도 ${row.attempts} · AI티 ${row.aiTellScore} · ${row.krw}원 · ${row.seconds}s${error ? ` · ${error.slice(0, 160)}` : ""}`);
    return data;
  }

  for (let run = 1; run <= RUNS; run++) {
    const cards = pickCards(createDeck(`smoke-${stamp}-${run}`, DEFAULT_REVERSAL_RATE), TEMPLATES["self-flow"], [5, 25, 50]);
    const money: TarotContext = buildTarotContext("self-flow", cards, smokeTarotInput());
    const moneyInput = { question: money.question, conditions: money.conditions, note: money.note, cards: cards.map((c) => `${c.position}: ${c.cardId} ${c.orientation}`) };
    const teaser = await call<TarotTeaser>(run, "tarot-teaser", (d) => validateTarotTeaser(d, money), (p) => generateTarotTeaser(p, money),
      (d) => validateTarotTeaser(d, money), (d) => [d.firstCard.body, d.secondCard?.body ?? ""].join(" "), moneyInput);
    // 감질맛: the paid reading reads on from the teaser's two cards, as the reading route does with the teaser's seal.
    const written = teaser?.secondCard ? [teaser.firstCard, teaser.secondCard] : [];

    // Fixed per stamp and run (not per day or device), so an A/B run sees the same daily card.
    const did = `smoke-${stamp}-${run}`;
    const day = "smoke";
    const card = dailyCard(did, day);
    const daily = buildTarotContext("daily", [{ ...card, position: "오늘의 한 장", slot: 0 }], null);
    await call<DailyDraft>(run, "daily", (d) => validateDaily(d, daily), (p) => generateDaily(p, daily),
      (d) => validateDaily(d, daily), (d) => [d.summary, d.body, d.areas.love, d.areas.money, d.areas.work, d.tip].join("\n"),
      { card, luckyNumber: dailyLuckyNumber(did, day) });

    await call<TarotReading>(run, "tarot-reading", (d) => validateTarotReading(withWrittenCards(d, written), money, { written: written.length }), (p) => generateTarotReading(p, money, undefined, written),
      (d) => validateTarotReading(d, money, { written: written.length }), tarotProse, { ...moneyInput, written: written.length });

    const chart = { chart: "1993-08-17 07:20 부산 남", pillars: saju.pillars.map((p) => p.gz), profile };
    await call<SajuTeaser>(run, "saju-teaser", (d) => validateSajuTeaser(d, saju), (p) => generateSajuTeaser(p, saju),
      (d) => validateSajuTeaser(d, saju), (d) => d.summary, chart);
    await call<SajuReading>(run, "saju-reading", (d) => validateSajuReading(d, saju), (p) => generateSajuReading(p, saju),
      (d) => validateSajuReading(d, saju), (d) => [...d.sections.map((s) => s.body), d.observation.body].join("\n"), chart);
  }

  // ---- summary ----
  const stat = (values: number[]) => ({
    avg: values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : 0,
    min: values.length ? Math.min(...values) : 0,
    max: values.length ? Math.max(...values) : 0,
  });
  const kinds: Kind[] = ["tarot-teaser", "tarot-reading", "daily", "saju-teaser", "saju-reading"];
  const perKind = kinds.map((kind) => {
    const r = rows.filter((row) => row.kind === kind);
    return {
      kind, route: ROUTE[kind], n: r.length,
      passRate: r.length ? Math.round((r.filter((row) => row.ok).length / r.length) * 100) : 0,
      attempts: stat(r.map((row) => row.attempts)),
      krw: stat(r.map((row) => row.krw)),
      aiTellScore: stat(r.map((row) => row.aiTellScore)),
      seconds: stat(r.map((row) => row.seconds)),
    };
  });
  const totalUsd = rows.reduce((sum, row) => sum + row.usd, 0);
  const summary = {
    runs: RUNS, stamp, folder,
    model: SMOKE_MODEL ?? "앱 설정", effort: SMOKE_EFFORT ?? "앱 설정", settings,
    krwPerUsd: Number.isFinite(krwFromEnv) && krwFromEnv > 0 ? "KRW_PER_USD 환경값" : 1400,
    totalUsd: Math.round(totalUsd * 10000) / 10000, totalKrw: Math.round(totalUsd * KRW_PER_USD), perKind,
  };
  writeFileSync(new URL("summary.json", dir), JSON.stringify({ ...summary, rows }, null, 2));

  const lines = [
    `# ai:smoke 요약 (${folder})`, "",
    `실행 ${RUNS}회 · stamp ${stamp} · 모델 ${summary.model} · effort ${summary.effort} · 총비용 약 ${summary.totalKrw.toLocaleString("ko-KR")}원 ($${summary.totalUsd})`, "",
    "| 호출 | 경로 | n | 통과율 | 시도 평균/최소/최대 | 비용(원) 평균/최소/최대 | AI티 평균 | 시간(초) 평균 |",
    "|---|---|---|---|---|---|---|---|",
    ...perKind.map((k) => `| ${k.kind} | ${k.route} | ${k.n} | ${k.passRate}% | ${k.attempts.avg}/${k.attempts.min}/${k.attempts.max} | ${k.krw.avg}/${k.krw.min}/${k.krw.max} | ${k.aiTellScore.avg} | ${k.seconds.avg} |`),
    "", "## 실패·위반", "",
    ...rows.filter((row) => !row.ok || row.finalViolations.length || row.attempts > 1).map((row) =>
      `- run ${row.run} ${row.kind}: ${row.ok ? "통과" : "실패"}, 시도 ${row.attempts}${row.error ? `, 오류 ${row.error}` : ""}\n` +
      row.attemptViolations.map((v, i) => `  - 시도 ${i + 1}: ${v.length ? v.join(" / ") : "위반 없음"}`).join("\n")),
  ];
  writeFileSync(new URL("summary.md", dir), `${lines.join("\n")}\n`);

  console.log(`\n${lines.slice(0, 3 + 2 + perKind.length + 1).join("\n")}`);
  console.log(`\n출력 폴더: apps/web/test-results/ai-smoke/${folder}/ (stamp ${stamp})`);
  if (!SMOKE_KINDS && SMOKE_CAP_KRW === Infinity) expect(rows.length).toBe(RUNS * kinds.length);
});
