import "server-only";
import type { SajuTopicId } from "@/lib/reading/types";
import { SectionScanner } from "@/lib/api/sections";
import { SAJU_GAEUN_HEADING, SAJU_MAIN_SECTIONS, SAJU_NAMES_HEADING, SAJU_PROLOGUE_SECTIONS } from "@/lib/sajuPrologue";
import { TOPIC_OBSERVATION_HEADING, TOPIC_SECTIONS, topicLockedToc } from "@/lib/sajuTopics";
import { mockDaily, mockSajuEnrichment, mockSajuFollowUp, mockSajuMainReading, mockSajuTeaser, mockTarotFollowUp, mockTarotReading, mockTarotTeaser } from "./mock";
import { mockSajuTopicFollowUp, mockSajuTopicReading, mockSajuTopicTeaser } from "./mockSajuTopics";
import { SAJU_LOCKED_TOC, SAJU_OBSERVATION_HEADING, SAJU_SYSTEM, sajuFollowUpPrompt, sajuReadingPrompt, sajuTeaserPrompt, type SajuFactSet } from "./prompts/saju";
import { SAJU_ENRICHMENT_SYSTEM, sajuEnrichmentPrompt } from "./prompts/sajuEnrichment";
import { SAJU_TOPIC_SYSTEM, sajuTopicFollowUpPrompt, sajuTopicReadingPrompt, sajuTopicTeaserPrompt } from "./prompts/sajuTopicPrompts";
import type { SajuTopicFactSet } from "./prompts/sajuTopics";
import {
  TAROT_SYSTEM, cardLabel, dailyPrompt, tarotFollowUpPrompt, tarotHeadings, tarotLockedToc, tarotReadingPrompt, tarotTeaserPrompt,
  type FollowUpTurn, type TarotContext,
} from "./prompts/tarot";
import { generationSetting } from "./config";
import { GenerationError, generateValidated, type GenerationHooks, type ReadingProvider, type Usage } from "./provider";
import { mergeSajuReading, sajuEnrichmentFallback } from "./sajuParts";
import {
  DailyDraftSchema, FollowUpAnswerSchema, OneCardTeaserDraftSchema, SajuEnrichmentSchema, SajuReadingSchema, SajuTeaserDraftSchema, TarotReadingSchema,
  TarotTeaserDraftSchema,
  type DailyDraft, type FollowUpAnswer, type SajuEnrichment, type SajuGlance, type SajuReading, type SajuTeaser, type Section, type StoredSajuReading,
  type StoredTarotReading, type TarotReading, type TarotTeaser, type TarotTeaserDraft,
} from "./schemas";
import {
  validateDaily, validateSajuEnrichment, validateSajuFollowUp, validateSajuMainReading, validateSajuTeaser, validateTarotFollowUp, validateTarotReading,
  validateTarotTeaser,
} from "./validate";
import { validateSajuTopicFollowUp, validateSajuTopicReading, validateSajuTopicTeaser } from "./validateSajuTopics";

/**
 * One function per reading kind: prompt + schema + validator + mock, then the parts code owns
 * (locked TOC, fixed headings, card identity) are written over the model's output.
 */

export interface Result<T> {
  data: T;
  usage: Usage[];
}

export async function generateTarotTeaser(provider: ReadingProvider, ctx: TarotContext, hooks?: GenerationHooks): Promise<Result<TarotTeaser>> {
  const second = ctx.cards[1];
  const { data, usage } = await generateValidated<TarotTeaserDraft>(provider, {
    name: "tarot-teaser",
    system: TAROT_SYSTEM,
    user: tarotTeaserPrompt(ctx),
    schema: second ? TarotTeaserDraftSchema : OneCardTeaserDraftSchema,
    ...generationSetting("tarot-teaser"),
    mock: () => mockTarotTeaser(ctx),
  }, (draft) => validateTarotTeaser(draft, ctx), hooks);
  return {
    data: {
      cards: ctx.cards.map((card, i) => ({ position: card.position, cardId: card.cardId, keyword: data.cards[i]!.keyword.trim() })),
      firstCard: { heading: cardLabel(ctx.cards[0]!), body: data.firstCard.body.trim() },
      ...(second && data.secondCard ? { secondCard: { heading: cardLabel(second), body: data.secondCard.body.trim() } } : {}),
      // 감질맛: with a second card the first is shown in full and the paid reading keeps it, so it is not listed as locked.
      lockedToc: second && data.secondCard ? tarotLockedToc(ctx).filter((heading) => heading !== cardLabel(ctx.cards[0]!)) : tarotLockedToc(ctx),
    },
    usage,
  };
}

/** The reading with the teaser's written cards (감질맛) as its leading card bodies; the model's headings stay. */
export const withWrittenCards = (reading: TarotReading, written: readonly Section[]): TarotReading => ({
  ...reading,
  cards: reading.cards.map((card, i) => {
    const shown = written[i];
    return shown ? { ...card, body: shown.body } : card;
  }),
});

/**
 * `written`: the teaser's first and second card, as its seal hands them back (lib/security/teaserSeal.ts). The model
 * then writes card 3 onward and every other field reading on from them, and code puts their bodies in.
 */
export async function generateTarotReading(
  provider: ReadingProvider, ctx: TarotContext, hooks?: GenerationHooks, written: readonly Section[] = [],
): Promise<Result<TarotReading>> {
  const { data, usage } = await generateValidated(provider, {
    name: "tarot-reading",
    system: TAROT_SYSTEM,
    user: tarotReadingPrompt(ctx, written),
    schema: TarotReadingSchema,
    ...generationSetting("tarot-reading"),
    mock: () => mockTarotReading(ctx, written.length),
  }, (reading) => validateTarotReading(withWrittenCards(reading, written), ctx, { written: written.length }), hooks);
  const h = tarotHeadings(ctx);
  return {
    data: {
      ...data,
      cards: withWrittenCards(data, written).cards.map((section, i) => ({ ...section, position: ctx.cards[i]!.position, cardId: ctx.cards[i]!.cardId })),
      connection: { ...data.connection, heading: h.connection },
      timing: { ...data.timing, heading: h.timing },
      scenarios: { ...data.scenarios, heading: h.scenarios },
      messages: { ...data.messages, heading: h.messages },
      avoid: { ...data.avoid, heading: h.avoid },
      alternatives: { ...data.alternatives, heading: h.alternatives },
      action: { ...data.action, heading: h.action },
      observation: { ...data.observation, heading: h.observation },
    },
    usage,
  };
}

export async function generateDaily(provider: ReadingProvider, ctx: TarotContext, hooks?: GenerationHooks): Promise<Result<DailyDraft>> {
  return generateValidated(provider, {
    name: "tarot-daily",
    system: TAROT_SYSTEM,
    user: dailyPrompt(ctx),
    schema: DailyDraftSchema,
    ...generationSetting("tarot-daily"),
    mock: () => mockDaily(ctx),
  }, (draft) => validateDaily(draft, ctx), hooks);
}

export async function generateTarotFollowUp(
  provider: ReadingProvider, ctx: TarotContext, reading: StoredTarotReading, turns: FollowUpTurn[], question: string, hooks?: GenerationHooks,
): Promise<Result<FollowUpAnswer>> {
  return generateValidated(provider, {
    name: "followup",
    system: TAROT_SYSTEM,
    user: tarotFollowUpPrompt(ctx, reading, turns, question),
    schema: FollowUpAnswerSchema,
    ...generationSetting("followup"),
    mock: () => mockTarotFollowUp(ctx, question),
  }, (answer) => validateTarotFollowUp(answer, ctx, question), hooks);
}

// ---- saju ----

export async function generateSajuTeaser(provider: ReadingProvider, facts: SajuFactSet, hooks?: GenerationHooks): Promise<Result<SajuTeaser>> {
  const { data, usage } = await generateValidated(provider, {
    name: "saju-teaser",
    system: SAJU_SYSTEM,
    user: sajuTeaserPrompt(facts),
    schema: SajuTeaserDraftSchema,
    ...generationSetting("saju-teaser"),
    mock: () => mockSajuTeaser(facts),
  }, (draft) => validateSajuTeaser(draft, facts), hooks);
  return { data: { title: data.title.trim(), summary: data.summary.trim(), lockedToc: [...SAJU_LOCKED_TOC] }, usage };
}

/** 7절·8절's own call: cut at this budget and replaced by the code-built text (review 2026-10-08, B). */
export const ENRICHMENT_BUDGET_MS = 90_000;

interface Enrichment {
  data: SajuEnrichment;
  usage: Usage[];
  source: "model" | "fallback";
}

/**
 * 7절·8절 in a call of their own (review 2026-10-08, B): its own budget (ENRICHMENT_BUDGET_MS) and cost reservation
 * (hooks.concurrent), aborted with the route's signal or by `stop` (the main call failed), never the main call's text or
 * attempt events. `result` never rejects: a failure, a timeout or a draft still invalid after its one retry gives the
 * code-built text, so a paid reading never fails because of it.
 */
function startSajuEnrichment(provider: ReadingProvider, facts: SajuFactSet, hooks: GenerationHooks): { result: Promise<Enrichment>; stop: () => void } {
  const controller = new AbortController();
  // why the call was cut, for the fallback log: its own 90 s, the main call failing, or the route (review of v2, LOW)
  let cut: "timeout" | "stopped" | "aborted" | null = null;
  const abort = (why: NonNullable<typeof cut>, reason: unknown) => {
    cut ??= why;
    controller.abort(reason);
  };
  const timer = setTimeout(() => abort("timeout", new Error("enrichment budget spent")), ENRICHMENT_BUDGET_MS);
  const route = hooks.signal;
  const follow = () => abort("aborted", route?.reason);
  if (route?.aborted) follow();
  else route?.addEventListener("abort", follow, { once: true });
  const own = hooks.concurrent?.() ?? {};
  const billed: Usage[] = [];
  const enrichmentHooks: GenerationHooks = {
    signal: controller.signal,
    deadline: Math.min(hooks.deadline ?? Number.POSITIVE_INFINITY, Date.now() + ENRICHMENT_BUDGET_MS),
    onReserve: own.onReserve,
    onRelease: own.onRelease,
    onUsage: (usage) => {
      billed.push(...usage);
      own.onUsage?.(usage);
    },
  };
  const result = generateValidated(provider, {
    name: "saju-enrichment",
    system: SAJU_ENRICHMENT_SYSTEM,
    user: sajuEnrichmentPrompt(facts),
    schema: SajuEnrichmentSchema,
    ...generationSetting("saju-enrichment"),
    mock: () => mockSajuEnrichment(facts),
  }, (draft) => validateSajuEnrichment(draft, facts), enrichmentHooks)
    .then((generated): Enrichment => ({ data: generated.data, usage: generated.usage, source: "model" }))
    .catch((error: unknown): Enrichment => {
      // ids and codes only, as logGeneration does
      console.info(JSON.stringify({ evt: "ai.enrichment", status: "fallback", reason: cut ?? (error instanceof GenerationError ? error.code : "error") }));
      return { data: sajuEnrichmentFallback(facts), usage: billed, source: "fallback" };
    })
    .finally(() => {
      clearTimeout(timer);
      route?.removeEventListener("abort", follow);
    });
  return { result, stop: () => abort("stopped", new Error("the main reading failed")) };
}

const NAMES_AT = SAJU_PROLOGUE_SECTIONS.indexOf(SAJU_NAMES_HEADING);
const GAEUN_AT = SAJU_PROLOGUE_SECTIONS.indexOf(SAJU_GAEUN_HEADING);

/**
 * The main call's progress in reading order (hooks.onSection): its sections where they stand among the nine (계산 기준 is the
 * ninth), and 7절·8절 just before 계산 기준 when their call is done by then, else at the merge (`done`). Without onSection the
 * hooks pass through.
 */
function readingProgress(hooks: GenerationHooks, enrichment: Promise<unknown>): { hooks: GenerationHooks; done: () => void } {
  const onSection = hooks.onSection;
  const main: GenerationHooks = { ...hooks, concurrent: undefined };
  if (!onSection) return { hooks: main, done: () => {} };
  const scanner = new SectionScanner();
  let ready = false;
  void enrichment.then(() => {
    ready = true;
  });
  let named = false;
  const nameTwo = () => {
    if (named) return;
    named = true;
    onSection("sections", NAMES_AT);
    onSection("sections", GAEUN_AT);
  };
  return {
    hooks: {
      ...main,
      onText: (snapshot) => {
        for (const event of scanner.push(snapshot)) {
          if (event.key !== "sections") {
            onSection(event.key, event.index);
            continue;
          }
          const at = SAJU_PROLOGUE_SECTIONS.indexOf(SAJU_MAIN_SECTIONS[event.index] ?? "");
          if (at < 0) continue;
          if (at > GAEUN_AT && ready) nameTwo();
          onSection("sections", at);
        }
      },
      onAttempt: (attempt) => {
        if (attempt >= 2) scanner.reset();
        hooks.onAttempt?.(attempt);
      },
    },
    done: nameTwo,
  };
}

/**
 * 정통 사주 in two calls started together (review 2026-10-08, B): the main one writes sections 1–6, 계산 기준, the card, the
 * observation and the follow-up questions; 7절·8절 come from their own call or its code-built fallback. The main call failing
 * fails the reading as before (and stops the other one); the merge puts the nine sections in reading order under code-owned
 * headings, and the usage holds both calls.
 */
export async function generateSajuReading(
  provider: ReadingProvider, facts: SajuFactSet, hooks: GenerationHooks = {},
): Promise<Result<SajuReading> & { enrichment: Enrichment["source"] }> {
  const enrichment = startSajuEnrichment(provider, facts, hooks);
  const progress = readingProgress(hooks, enrichment.result);
  const main = generateValidated(provider, {
    name: "saju-reading",
    system: SAJU_SYSTEM,
    user: sajuReadingPrompt(facts),
    schema: SajuReadingSchema,
    ...generationSetting("saju-reading"),
    mock: () => mockSajuMainReading(facts),
  }, (reading) => validateSajuMainReading(reading, facts), progress.hooks);
  // a failed reading stops paying for its 7절·8절
  main.catch(() => enrichment.stop());
  const [first, second] = await Promise.allSettled([main, enrichment.result]);
  if (first.status === "rejected") throw first.reason;
  const extra: Enrichment = second.status === "fulfilled" ? second.value : { data: sajuEnrichmentFallback(facts), usage: [], source: "fallback" };
  progress.done();
  const data = mergeSajuReading(first.value.data, extra.data);
  return {
    data: { ...data, observation: { heading: SAJU_OBSERVATION_HEADING, body: data.observation.body.trim() }, glance: trimGlance(data.glance) },
    usage: [...first.value.usage, ...extra.usage],
    enrichment: extra.source,
  };
}

/** The 한눈에 보기 sentences as written, without stray whitespace (the card's labels are code-owned on screen). */
const trimGlance = (g: SajuGlance): SajuGlance => ({
  goesWell: g.goesWell.trim(), watchOut: g.watchOut.trim(), remedy: g.remedy.trim(), thisYear: g.thisYear.trim(), thisYearAction: g.thisYearAction.trim(),
});

export async function generateSajuFollowUp(
  provider: ReadingProvider, facts: SajuFactSet, reading: StoredSajuReading, turns: FollowUpTurn[], question: string, hooks?: GenerationHooks,
): Promise<Result<FollowUpAnswer>> {
  return generateValidated(provider, {
    name: "followup",
    system: SAJU_SYSTEM,
    user: sajuFollowUpPrompt(facts, reading, turns, question),
    schema: FollowUpAnswerSchema,
    ...generationSetting("followup"),
    mock: () => mockSajuFollowUp(facts, question),
  }, (answer) => validateSajuFollowUp(answer, facts, question), hooks);
}

// ---- 주제별 사주 (saju-topics spec §7.6) ----

/** A topic teaser as the API returns it: the model's title and summary, then what code owns (spec §6.5). */
export interface SajuTopicTeaser extends SajuTeaser {
  topic: SajuTopicId;
  freshUntil: string;
}

export async function generateSajuTopicTeaser(provider: ReadingProvider, facts: SajuTopicFactSet, hooks?: GenerationHooks): Promise<Result<SajuTopicTeaser>> {
  const { data, usage } = await generateValidated(provider, {
    name: "saju-topic-teaser",
    system: SAJU_TOPIC_SYSTEM,
    user: sajuTopicTeaserPrompt(facts),
    schema: SajuTeaserDraftSchema,
    ...generationSetting("saju-topic-teaser"),
    mock: () => mockSajuTopicTeaser(facts),
  }, (draft) => validateSajuTopicTeaser(draft, facts), hooks);
  return {
    data: { title: data.title.trim(), summary: data.summary.trim(), lockedToc: topicLockedToc(facts.topic), topic: facts.topic, freshUntil: facts.freshUntil },
    usage,
  };
}

export async function generateSajuTopicReading(provider: ReadingProvider, facts: SajuTopicFactSet, hooks?: GenerationHooks): Promise<Result<SajuReading>> {
  const { data, usage } = await generateValidated(provider, {
    name: "saju-topic-reading",
    system: SAJU_TOPIC_SYSTEM,
    user: sajuTopicReadingPrompt(facts),
    schema: SajuReadingSchema,
    ...generationSetting("saju-topic-reading"),
    mock: () => mockSajuTopicReading(facts),
  }, (reading) => validateSajuTopicReading(reading, facts), hooks);
  // Headings are code-owned so the locked list stays 1:1 with the paid sections.
  const headings = TOPIC_SECTIONS[facts.topic];
  return {
    data: {
      ...data,
      sections: data.sections.map((section, i) => ({ heading: headings[i] ?? section.heading, body: section.body.trim() })),
      observation: { heading: TOPIC_OBSERVATION_HEADING, body: data.observation.body.trim() },
      glance: trimGlance(data.glance),
    },
    usage,
  };
}

export async function generateSajuTopicFollowUp(
  provider: ReadingProvider, facts: SajuTopicFactSet, reading: StoredSajuReading, turns: FollowUpTurn[], question: string, hooks?: GenerationHooks,
): Promise<Result<FollowUpAnswer>> {
  return generateValidated(provider, {
    name: "followup",
    system: SAJU_TOPIC_SYSTEM,
    user: sajuTopicFollowUpPrompt(facts, reading, turns, question),
    schema: FollowUpAnswerSchema,
    ...generationSetting("followup"),
    mock: () => mockSajuTopicFollowUp(facts, question),
  }, (answer) => validateSajuTopicFollowUp(answer, facts, question), hooks);
}
