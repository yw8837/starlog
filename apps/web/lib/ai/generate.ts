import "server-only";
import type { SajuTopicId } from "@/lib/reading/types";
import { SectionScanner } from "@/lib/api/sections";
import { SAJU_GAEUN_HEADING, SAJU_NAMES_HEADING, SAJU_PART_A_SECTIONS, SAJU_PART_B_SECTIONS, SAJU_PROLOGUE_SECTIONS } from "@/lib/sajuPrologue";
import { TOPIC_OBSERVATION_HEADING, TOPIC_SECTIONS, topicLockedToc } from "@/lib/sajuTopics";
import {
  mockDaily, mockSajuEnrichment, mockSajuFollowUp, mockSajuReadingPartA, mockSajuReadingPartB, mockSajuTeaser, mockTarotFollowUp, mockTarotReading, mockTarotTeaser,
} from "./mock";
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
import { joinSajuHalves, mergeSajuReading, sajuEnrichmentFallback } from "./sajuParts";
import {
  DailyDraftSchema, FollowUpAnswerSchema, OneCardTeaserDraftSchema, SajuEnrichmentSchema, SajuReadingPartASchema, SajuReadingPartBSchema, SajuReadingSchema,
  SajuTeaserDraftSchema, TarotReadingSchema, TarotTeaserDraftSchema,
  type DailyDraft, type FollowUpAnswer, type SajuEnrichment, type SajuGlance, type SajuReading, type SajuTeaser, type Section, type StoredSajuReading,
  type StoredTarotReading, type TarotReading, type TarotTeaser, type TarotTeaserDraft,
} from "./schemas";
import { VOICE_PREFIX, isSoftViolation } from "./style";
import {
  validateDaily, validateSajuEnrichment, validateSajuFollowUp, validateSajuMainReading, validateSajuReadingPartA, validateSajuReadingPartB, validateSajuTeaser,
  validateTarotFollowUp, validateTarotReading, validateTarotTeaser,
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
    ...(hooks.care ? { care: true } : {}),
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

/** A section's stage on the waiting screen: where it stands among the nine (계산 기준 is the ninth). */
const stageOf = (heading: string) => `sections#${SAJU_PROLOGUE_SECTIONS.indexOf(heading)}`;
/** The waiting screen's stages in reading order (lib/reading/progress.ts): the nine sections, the observation, the card, the questions. */
const READING_ORDER = [...SAJU_PROLOGUE_SECTIONS.map(stageOf), "observation#0", "glance#0", "followUps#0"];
/** Each call's stages (owner 2026-10-16): the first half, the second half, 7절·8절. */
const FIRST_HALF_STAGES = [...SAJU_PART_A_SECTIONS.map(stageOf), "followUps#0"];
const SECOND_HALF_STAGES = [...SAJU_PART_B_SECTIONS.map(stageOf), "observation#0", "glance#0"];
const ENRICHMENT_STAGES = [stageOf(SAJU_NAMES_HEADING), stageOf(SAJU_GAEUN_HEADING)];

interface CallProgress {
  /** onText and onAttempt for the call (the route's onAttempt alone without onSection) */
  hooks: GenerationHooks;
  /** the call is done: every stage of it is written */
  finish: () => void;
}

/**
 * The reading's progress (hooks.onSection) from its three calls at once (owner 2026-10-16): each half's streamed sections where
 * they stand among the nine, the observation, the card and the questions, and 7절·8절 when their call is done. A stage is told
 * once it has started and the stage before it is done (its call wrote past it or finished), so the stages arrive in reading
 * order and the waiting screen, which keeps the furthest one, never shows 4절 or the card while the first half still writes
 * 1–3절. The returned function gives one call its hooks: `stages` are its own, `headings` its sections in its order.
 */
function readingProgress(hooks: GenerationHooks): (stages: readonly string[], headings?: readonly string[]) => CallProgress {
  const onSection = hooks.onSection;
  const started = new Set<string>();
  const finished = new Set<string>();
  let next = 0;
  const flush = () => {
    if (!onSection) return;
    for (; next < READING_ORDER.length; next++) {
      const stage = READING_ORDER[next]!;
      if (!started.has(stage) || (next > 0 && !finished.has(READING_ORDER[next - 1]!))) return;
      const [key, index] = stage.split("#");
      onSection(key!, Number(index));
    }
  };
  return (stages, headings = []) => {
    const finish = () => {
      for (const stage of stages) {
        started.add(stage);
        finished.add(stage);
      }
      flush();
    };
    if (!onSection) return { hooks: { onAttempt: hooks.onAttempt }, finish };
    const scanner = new SectionScanner();
    let last: string | null = null;
    return {
      hooks: {
        onText: (snapshot) => {
          for (const event of scanner.push(snapshot)) {
            const stage = event.key === "sections" ? stageOf(headings[event.index] ?? "") : `${event.key}#${event.index}`;
            if (!stages.includes(stage)) continue;
            if (last) finished.add(last);
            started.add(stage);
            last = stage;
          }
          flush();
        },
        onAttempt: (attempt) => {
          // the regeneration writes from the start again; what was told stays told
          if (attempt >= 2) {
            scanner.reset();
            last = null;
          }
          hooks.onAttempt?.(attempt);
        },
      },
      finish,
    };
  };
}

/**
 * 정통 사주 in three calls started together. The main reading is written in two halves (owner 2026-10-16: as one call it ran
 * 110–150 s, and calls past about 150 s are cut upstream): "saju-reading" writes 1–3절, 계산 기준 and the follow-up questions,
 * "saju-reading-b" 4–6절, the observation and the card, each told the other's headings so they do not overlap; 7절·8절 come from
 * their own call or its code-built fallback (review 2026-10-08, B). Each half is validated and regenerated on its own; either
 * failing fails the reading as before and stops the other calls. The second half reserves and bills on a ledger of its own
 * (hooks.concurrent), as 7절·8절 do. The halves passing implies every hard rule of the whole (validate.ts MainShare); what only
 * the merged reading can show (the voice's caps, repeated acts, the AI-tell count, all soft) is logged as counts, never
 * regenerated. The merge puts the nine sections in reading order under code-owned headings, and the usage holds every call.
 */
export async function generateSajuReading(
  provider: ReadingProvider, facts: SajuFactSet, hooks: GenerationHooks = {},
): Promise<Result<SajuReading> & { enrichment: Enrichment["source"] }> {
  const enrichment = startSajuEnrichment(provider, facts, hooks);
  // one stop for both halves: the route's signal, or the other half failing
  const halves = new AbortController();
  const route = hooks.signal;
  const follow = () => halves.abort(route?.reason);
  if (route?.aborted) follow();
  else route?.addEventListener("abort", follow, { once: true });
  const part = readingProgress(hooks);
  const [first, second] = [part(FIRST_HALF_STAGES, SAJU_PART_A_SECTIONS), part(SECOND_HALF_STAGES, SAJU_PART_B_SECTIONS)];
  void enrichment.result.then(part(ENRICHMENT_STAGES).finish);
  const failures: unknown[] = [];
  // a failed half fails the reading with its own error, and stops paying for the others
  const settle = <T>(half: Promise<T>, done: () => void) => half.then(
    (value) => {
      done();
      return value;
    },
    (error: unknown) => {
      failures.push(error);
      halves.abort(error);
      enrichment.stop();
      throw error;
    },
  );
  const own = hooks.concurrent?.() ?? {};
  const a = settle(generateValidated(provider, {
    name: "saju-reading",
    system: SAJU_SYSTEM,
    user: sajuReadingPrompt(facts, "a"),
    schema: SajuReadingPartASchema,
    ...generationSetting("saju-reading"),
    mock: () => mockSajuReadingPartA(facts),
  }, (draft) => validateSajuReadingPartA(draft, facts), { ...hooks, concurrent: undefined, signal: halves.signal, ...first.hooks }), first.finish);
  const b = settle(generateValidated(provider, {
    name: "saju-reading-b",
    system: SAJU_SYSTEM,
    user: sajuReadingPrompt(facts, "b"),
    schema: SajuReadingPartBSchema,
    ...generationSetting("saju-reading-b"),
    mock: () => mockSajuReadingPartB(facts),
  }, (draft) => validateSajuReadingPartB(draft, facts), {
    signal: halves.signal, deadline: hooks.deadline, ...(hooks.care ? { care: true } : {}), onReserve: own.onReserve, onRelease: own.onRelease, onUsage: own.onUsage, ...second.hooks,
  }), second.finish);
  const [one, two, three] = await Promise.allSettled([a, b, enrichment.result]);
  route?.removeEventListener("abort", follow);
  if (one.status === "rejected" || two.status === "rejected") throw failures[0];
  const extra: Enrichment = three.status === "fulfilled" ? three.value : { data: sajuEnrichmentFallback(facts), usage: [], source: "fallback" };
  const main = joinSajuHalves(one.value.data, two.value.data);
  logMergedFindings(validateSajuMainReading(main, facts));
  const data = mergeSajuReading(main, extra.data);
  return {
    data: { ...data, observation: { heading: SAJU_OBSERVATION_HEADING, body: data.observation.body.trim() }, glance: trimGlance(data.glance) },
    usage: [...one.value.usage, ...two.value.usage, ...extra.usage],
    enrichment: extra.source,
  };
}

/** What only the merged main reading shows, as counts (never the findings' words, which quote the reading). */
function logMergedFindings(findings: readonly string[]): void {
  if (!findings.length) return;
  const voice = findings.filter((f) => f.startsWith(VOICE_PREFIX)).length;
  const soft = findings.filter(isSoftViolation).length - voice;
  console.info(JSON.stringify({ evt: "ai.merged", task: "saju-reading", hard: findings.length - voice - soft, soft, voice }));
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
