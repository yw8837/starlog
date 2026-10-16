// Real-API premium eval (stage 4, plan Task 25; spec §11 cost, §12 quality). Not part of `pnpm test`; costs money.
// Six golden cases (content/eval/premium/golden.json, two per product), each: the free preview, the reading part by
// part (as the routes write it), and one follow-up, through the routes' own adapters, so every prompt is the one
// production sends. Writes every output, summary.md and summary.json to apps/web/test-results/premium-eval/<folder>/
// (gitignored; SMOKE_OUT overrides).
// Budget: SMOKE_BUDGET_KRW (vitest.premium.config.ts defaults it to 7,000). Before every upstream call (an attempt, a
// regeneration, the provider's own second call after max_tokens) the spend so far plus the larger of spec §11's
// estimate and the dearest call of its kind seen so far must stay within it, or nothing more is called. Every billed
// usage counts once, a refused or cut-off call's too (lib/ai/budgetGuard.ts, costs from lib/ai/cost.ts).
// Never prints the key. Writes no partner birth: only the reading text and the case's label leave this process.
// usage: SMOKE_PROVIDER=mock pnpm ai:premium      (free dry run, mock provider, no key needed)
//        pnpm ai:premium                          (real API, 7,000원 cap)
//        SMOKE_BUDGET_KRW=5000 pnpm ai:premium    (another cap)
import { mkdirSync, writeFileSync } from "node:fs";
import { DEFAULT_REVERSAL_RATE, TEMPLATES, createDeck, pickCards, type TemplateId } from "@starlog/core";
import goldenJson from "@content/eval/premium/golden.json";
import { expect, test } from "vitest";
import { anthropicProvider } from "@/lib/ai/anthropic";
import { krwPerUsd, usdOf } from "@/lib/ai/cost";
import { mockProvider } from "@/lib/ai/mock";
import { budgeted, newBudget } from "@/lib/ai/budgetGuard";
import { GenerationError, type ReadingProvider, type Usage } from "@/lib/ai/provider";
import { aiTells } from "@/lib/ai/style";
import type { Gate } from "@/lib/api/http";
import { DEEP_ADAPTER, MATCH_ADAPTER, NEWYEAR_ADAPTER, type Adapter } from "@/lib/premium/adapters";
import { preparePremiumFollowUp } from "@/lib/premium/followup";
import { PREMIUM, PREMIUM_CHAPTER_TTL_MS, type PremiumId } from "@/lib/premium/products";
import { runNextPart, type PremiumContext } from "@/lib/premium/run";
import { DEFAULT_SAJU_FORM, type SajuForm } from "@/lib/sajuForm";
import { chapterIdOf, type ChapterContext } from "@/lib/security/chapterToken";
import { signToken, type SignedPayload } from "@/lib/security/sign";

type Kind = "preview" | "part" | "followup";

/**
 * Spec §11's estimate of one attempt (KRW at 1,500원/$, the high end): previews and follow-ups as listed; a part is its
 * reading's high end split over its parts, ×1.5 since the parts are not equal (deep 705/2, match 680/2, new year 830/3).
 */
export const ATTEMPT_KRW: Record<PremiumId, Record<Kind, number>> = {
  "tarot-deep": { preview: 50, part: 529, followup: 76 },
  match: { preview: 62, part: 510, followup: 75 },
  "newyear-2027": { preview: 52, part: 415, followup: 66 },
};

const FOLLOW_UP: Record<PremiumId, string> = {
  "tarot-deep": "가장 먼저 해 볼 일은 뭘까요?",
  match: "대화를 어떻게 시작하면 좋을까요?",
  "newyear-2027": "3월에는 무엇을 하면 좋을까요?",
};

interface Golden {
  "tarot-deep": Array<{ id: string; label: string; seed: string; input: Record<string, unknown> }>;
  match: Array<{ id: string; label: string; seed: string; relation: string; partnerLabel?: string; concern?: string; me: Partial<SajuForm>; partner: Partial<SajuForm> }>;
  "newyear-2027": Array<{ id: string; label: string; birth: Partial<SajuForm>; loveStatus?: string; workStatus?: string }>;
}
const golden = goldenJson as unknown as Golden;

const env = process.env;
const BUDGET_KRW = Number(env.SMOKE_BUDGET_KRW ?? 7000);
const FX = krwPerUsd();
/** Inside the 2027 신년운세 window; the facts of a 궁합 are computed as of now. */
const NOW = Date.parse("2026-11-20T12:00:00+09:00");
/** Signs this process's draw tokens and seals only; never a deploy's secret. */
const SECRET = "premium-eval-only-secret-0123456789abcdef";

interface Row {
  product: PremiumId;
  caseId: string;
  kind: Kind;
  index: number;
  ok: boolean;
  /** GenerationError code and the validator's findings, or the context's refusal */
  error: string | null;
  attempts: number;
  /** the validator's findings on the attempt before a regeneration (what the model was told to fix) */
  regenerated: string[];
  aiTells: string[];
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number };
  krw: number;
  seconds: number;
}

const form = (b: Partial<SajuForm>): SajuForm => ({ ...DEFAULT_SAJU_FORM, ...b });
const tokensOf = (usage: Usage[]) =>
  usage.reduce((s, u) => ({ input: s.input + u.inputTokens, output: s.output + u.outputTokens, cacheRead: s.cacheRead + u.cacheReadTokens, cacheWrite: s.cacheWrite + u.cacheWriteTokens }), { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });

/** A draw token for the first n cards of `seed`'s deck, as /api/tarot/draw signs one, so A/B runs see the same cards. */
async function fixedDraw(templateId: TemplateId, seed: string): Promise<string> {
  const picks = TEMPLATES[templateId].positions.map((_, i) => i);
  const cards = pickCards(createDeck(seed, DEFAULT_REVERSAL_RATE), TEMPLATES[templateId], picks);
  const payload = { k: "draw", v: 1, seed, rate: DEFAULT_REVERSAL_RATE, templateId, picks, cards: cards.map((c) => [c.cardId, c.orientation]), iat: NOW, exp: NOW + 86_400_000 };
  return signToken(payload as SignedPayload, SECRET);
}

interface Case {
  product: PremiumId;
  id: string;
  label: string;
  adapter: Adapter<unknown, PremiumContext>;
  body: unknown;
}

async function cases(): Promise<Case[]> {
  const out: Case[] = [];
  for (const g of golden["tarot-deep"]) {
    out.push({ product: "tarot-deep", id: g.id, label: g.label, adapter: DEEP_ADAPTER as unknown as Case["adapter"], body: { drawToken: await fixedDraw("deep-tarot", g.seed), input: g.input } });
  }
  for (const g of golden.match) {
    out.push({
      product: "match", id: g.id, label: g.label, adapter: MATCH_ADAPTER as unknown as Case["adapter"],
      body: {
        me: { birth: form(g.me) }, partner: { birth: form(g.partner), ...(g.partnerLabel ? { label: g.partnerLabel } : {}) },
        relation: g.relation, ...(g.concern ? { concern: g.concern } : {}), drawToken: await fixedDraw("match", g.seed), ack: true,
      },
    });
  }
  for (const g of golden["newyear-2027"]) {
    out.push({
      product: "newyear-2027", id: g.id, label: g.label, adapter: NEWYEAR_ADAPTER as unknown as Case["adapter"],
      body: { birth: form(g.birth), ...(g.loveStatus ? { loveStatus: g.loveStatus } : {}), ...(g.workStatus ? { workStatus: g.workStatus } : {}) },
    });
  }
  return out;
}

/** What may be written of an output: a 궁합 preview's charts and code-written lines come from both births, so they stay out. */
function writable(product: PremiumId, kind: Kind, output: unknown): unknown {
  if (product !== "match" || kind !== "preview" || !output || typeof output !== "object") return output;
  const { charts: _charts, facts: _facts, ...rest } = output as Record<string, unknown>;
  return rest;
}

test("premium eval", async () => {
  const mock = env.SMOKE_PROVIDER === "mock";
  const key = env.ANTHROPIC_API_KEY?.trim();
  if (!Number.isFinite(BUDGET_KRW) || BUDGET_KRW <= 0) throw new Error("SMOKE_BUDGET_KRW는 0보다 큰 원 단위 숫자여야 해요.");
  if (!mock && !key) throw new Error("ANTHROPIC_API_KEY가 없어 아무것도 부르지 않았어요. 모의 실행은 SMOKE_PROVIDER=mock 으로 해요.");
  const real = mock ? mockProvider : anthropicProvider(key!);
  const folder = `${new Date().toISOString().replace(/[:.]/g, "-")}-${mock ? "mock" : "real"}`;
  const dir = env.SMOKE_OUT ? new URL(`file:///${env.SMOKE_OUT.replace(/\\/g, "/").replace(/\/?$/, "/")}${folder}/`) : new URL(`../apps/web/test-results/premium-eval/${folder}/`, import.meta.url);
  mkdirSync(dir, { recursive: true });
  console.log(`ai:premium · ${mock ? "모의 공급자(무료)" : "실제 API"} · 예산 ${BUDGET_KRW.toLocaleString("ko-KR")}원 · 환율 ${FX}원/$`);

  const rows: Row[] = [];
  const budget = newBudget(BUDGET_KRW);

  /** One call (several attempts inside generateValidated), each attempt checked against the budget before it starts. */
  async function call<T>(c: Case, kind: Kind, index: number, fn: (p: ReadingProvider) => Promise<T>): Promise<T | null> {
    if (budget.stopped) return null;
    // Every upstream call checked before it starts, every billed usage counted once (lib/ai/budgetGuard.ts).
    const rec = budgeted(real, budget, { slot: `${c.product}:${kind}`, estimateKrw: ATTEMPT_KRW[c.product][kind], fx: FX, label: `${c.product} ${c.id} ${kind}${index}` });
    const { usage } = rec;
    const started = Date.now();
    let out: T | null = null;
    let error: string | null = null;
    try {
      out = await fn(rec.provider);
    } catch (e) {
      error = e instanceof GenerationError ? `${e.code}${e.detail.length ? `: ${e.detail.join(" | ")}` : ""}` : e instanceof Error ? e.name : "error";
    }
    const attempts = rec.attempts();
    const row: Row = {
      product: c.product, caseId: c.id, kind, index, ok: out !== null, error, attempts, regenerated: rec.regenerated(),
      aiTells: out ? aiTells(JSON.stringify(out)).map((t) => t.id) : [], tokens: tokensOf(usage),
      krw: Math.round(usdOf(usage) * FX), seconds: Math.round((Date.now() - started) / 100) / 10,
    };
    rows.push(row);
    writeFileSync(new URL(`${c.product}-${c.id}-${kind}${index}.json`, dir), JSON.stringify({ ...row, label: c.label, output: writable(c.product, kind, out) }, null, 2));
    console.log(`${c.product} ${c.id} ${kind}${index}: ${out ? "통과" : "실패"} · 시도 ${attempts} · ${row.krw}원 · ${row.seconds}s${error ? ` · ${error.slice(0, 160)}` : ""}`);
    return out;
  }

  const gate: Gate = { secret: SECRET, provider: real, owner: false, now: NOW, cookies: {}, client: "premium-eval" };
  for (const c of await cases()) {
    if (budget.stopped) break;
    const body = c.adapter.teaserBody.parse(c.body);
    const ctx = await c.adapter.context(body, gate);
    if (ctx instanceof Response) {
      rows.push({ product: c.product, caseId: c.id, kind: "preview", index: 0, ok: false, error: `context ${ctx.status} ${JSON.stringify(await ctx.json())}`, attempts: 0, regenerated: [], aiTells: [], tokens: tokensOf([]), krw: 0, seconds: 0 });
      console.log(`${c.product} ${c.id}: 입력이 거절됐어요 (${ctx.status})`);
      continue;
    }
    await call(c, "preview", 0, (p) => c.adapter.teaser(p, ctx));
    let done: unknown[] = [];
    let reading: unknown = null;
    for (let part = 0; part < 3 && !reading && !budget.stopped; part++) {
      const step = await call(c, "part", part, (p) => runNextPart(p, ctx, done));
      if (!step) break;
      if (step.complete) reading = step.reading;
      else done = step.parts;
    }
    if (!reading) continue;
    writeFileSync(new URL(`${c.product}-${c.id}-reading.json`, dir), JSON.stringify({ label: c.label, reading }, null, 2));
    const chapterId = await chapterIdOf(reading, NOW + PREMIUM_CHAPTER_TTL_MS);
    const chapter = (await c.adapter.chapterContext(body, ctx, SECRET, chapterId)) as Extract<ChapterContext, { kind: PremiumId }>;
    const prepared = await preparePremiumFollowUp(chapter, reading, NOW, SECRET, chapterId);
    if (prepared instanceof Response) {
      rows.push({ product: c.product, caseId: c.id, kind: "followup", index: 0, ok: false, error: `follow-up ${prepared.status}`, attempts: 0, regenerated: [], aiTells: [], tokens: tokensOf([]), krw: 0, seconds: 0 });
      continue;
    }
    const question = FOLLOW_UP[c.product];
    const answer = await call(c, "followup", 0, (p) => prepared.generate(p, [], question));
    if (answer) writeFileSync(new URL(`${c.product}-${c.id}-followup.json`, dir), JSON.stringify({ label: c.label, question, answer }, null, 2));
  }

  // ---- summary ----
  const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
  const lines = [
    `# ai:premium 요약 (${folder})`, "",
    `- 공급자: ${mock ? "모의(무료)" : "실제 API"} · 총비용 약 ${won(budget.spentKrw)} · 예산 ${won(BUDGET_KRW)} · 환율 ${FX}원/$`,
    `- 예산 중단: ${budget.stopped ?? "없음"}`, "",
    "## 호출마다", "",
    "| 상품 | 케이스 | 호출 | 결과 | 시도 | 원 | 초 | 입력/출력/캐시읽기/캐시쓰기 토큰 | 검증기 | AI 티 |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.product} | ${r.caseId} | ${r.kind}${r.index} | ${r.ok ? "통과" : "실패"} | ${r.attempts} | ${r.krw} | ${r.seconds} | ${r.tokens.input}/${r.tokens.output}/${r.tokens.cacheRead}/${r.tokens.cacheWrite} | ${r.ok ? (r.regenerated.length ? `재생성 뒤 통과 (${r.regenerated.join(" / ").slice(0, 200)})` : "첫 시도 통과") : (r.error ?? "").slice(0, 200)} | ${r.aiTells.join(", ") || "-"} |`),
    "", "## 상품마다", "",
    "| 상품 | 완성 | 미리보기 평균 | 풀이(파트 합) 평균 | 물어보기 1회 평균 | 풀이+물어보기 1회 | 가격 대비 | 파트 초 최대 |",
    "|---|---|---|---|---|---|---|---|",
  ];
  for (const product of Object.keys(ATTEMPT_KRW) as PremiumId[]) {
    const r = rows.filter((row) => row.product === product);
    const ids = [...new Set(r.map((row) => row.caseId))];
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    const readings = ids.map((id) => r.filter((row) => row.caseId === id && row.kind === "part").reduce((s, row) => s + row.krw, 0));
    const complete = ids.filter((id) => r.some((row) => row.caseId === id && row.kind === "followup" && row.ok)).length;
    const preview = avg(r.filter((row) => row.kind === "preview" && row.ok).map((row) => row.krw));
    const followup = avg(r.filter((row) => row.kind === "followup" && row.ok).map((row) => row.krw));
    const total = avg(readings) + followup;
    const partMax = Math.max(0, ...r.filter((row) => row.kind === "part").map((row) => row.seconds));
    lines.push(`| ${product} | ${complete}/${ids.length} | ${won(preview)} | ${won(avg(readings))} | ${won(followup)} | ${won(total)} | ${((100 * total) / PREMIUM[product].krw).toFixed(1)}% | ${partMax}s |`);
  }
  writeFileSync(new URL("summary.json", dir), JSON.stringify({ folder, provider: mock ? "mock" : "real", budget: BUDGET_KRW, spent: Math.round(budget.spentKrw), stopped: budget.stopped, rows }, null, 2));
  writeFileSync(new URL("summary.md", dir), `${lines.join("\n")}\n`);
  console.log(`\n${lines.join("\n")}\n\n출력 폴더: ${dir.pathname}`);
  expect(rows.length).toBeGreaterThan(0);
  if (mock) {
    // The dry run proves the harness: every call passes and nothing is spent.
    expect(budget.spentKrw).toBe(0);
    expect(rows.filter((r) => !r.ok)).toEqual([]);
    expect(rows).toHaveLength(6 * 2 + (2 + 2 + 3) * 2);
  }
});
