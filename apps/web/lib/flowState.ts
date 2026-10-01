import { useCallback, useSyncExternalStore } from "react";
import { TOPICS_BY_WHO, type TopicDef, type When, type Who } from "@starlog/core";
import { isStale } from "./freshStart";
import { useFlowVisit } from "./useFlowVisit";
import { CUSTOM_MAX, WHO_MAX, cleanPart, composeFlowQuestion, flowQuote } from "./question";
import type { DrawTemplateId, DrawnCardData, TarotInput } from "./reading/types";

/**
 * Tarot question flow (builder → situation → draw → result), kept in sessionStorage.
 * The question, chosen conditions, typed parts, note and the signed draw never go into a URL
 * (spec §4.4); URLs only carry the display flag handled by `withFlags`.
 */

export const WHO_OPTIONS: ReadonlyArray<{ value: Who; label: string }> = [
  { value: "me", label: "나" },
  { value: "us", label: "나와 그 사람" },
  { value: "work", label: "나의 일" },
  { value: "group", label: "우리 모임" },
];

export const WHEN_OPTIONS: ReadonlyArray<{ value: When; label: string }> = [
  { value: "today", label: "오늘" },
  { value: "week", label: "이번 주" },
  { value: "month", label: "이번 달" },
  { value: "year", label: "올해" },
];

/** The spread a typed 무엇 is read with: the 누구 chip decides. */
export const CUSTOM_TEMPLATE: Readonly<Record<Who, DrawTemplateId>> = {
  me: "self-flow",
  us: "relationship",
  work: "work",
  group: "group",
};

export const NOTE_MAX = 100;
export const FLOW_KEY = "starlog.tarot-flow";

/** The cards the server dealt for this question, with the signed token the readings need. */
export interface FlowDraw {
  templateId: DrawTemplateId;
  drawToken: string;
  cards: DrawnCardData[];
  /** Set once the full reading was opened and saved, so the same draw is never opened twice. */
  chapterId?: string;
}

export interface FlowState {
  who?: Who;
  /** Detail on 누구 (not with 나), e.g. "엄마". */
  whoText?: string;
  topicId?: string;
  /** The user's own 무엇; replaces the topic chip. */
  topicText?: string;
  when?: When;
  /** The user's own 언제; replaces the time chip. */
  whenText?: string;
  /** condition id → chosen option */
  conditions: Record<string, string>;
  note: string;
  draw?: FlowDraw;
  /** When the flow was last saved (ms); the builder starts clean once it is 30 minutes old. */
  savedAt?: number;
}

export const EMPTY_FLOW: FlowState = Object.freeze({ conditions: Object.freeze({}), note: "" }) as FlowState;

/** Topics the builder offers under 누구. 오늘의 운 (one card) lives on /today now. */
export function builderTopics(who: Who): TopicDef[] {
  return TOPICS_BY_WHO[who].filter((topic) => topic.template !== "daily");
}

export function findTopic(who: Who | undefined, topicId: string | undefined): TopicDef | undefined {
  if (!who || !topicId) return undefined;
  return TOPICS_BY_WHO[who].find((topic) => topic.id === topicId);
}

export function allowedWhens(topic: TopicDef | undefined): When[] {
  return topic?.whens ?? WHEN_OPTIONS.map((option) => option.value);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A typed part as the user typed it (capped), or undefined when there is nothing but spaces. */
function typedPart(value: unknown, max = CUSTOM_MAX): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.slice(0, max);
  return text.trim() ? text : undefined;
}

const DRAW_TEMPLATES: readonly DrawTemplateId[] = ["relationship-contact", "relationship", "work", "choice", "self-flow", "group"];

function sanitizeDraw(value: unknown): FlowDraw | undefined {
  if (!isRecord(value) || typeof value.drawToken !== "string" || !value.drawToken || value.drawToken.length > 4096) return undefined;
  const templateId = DRAW_TEMPLATES.find((t) => t === value.templateId);
  if (!templateId || !Array.isArray(value.cards) || value.cards.length === 0) return undefined;
  const cards: DrawnCardData[] = [];
  for (const card of value.cards) {
    if (!isRecord(card) || typeof card.position !== "string" || typeof card.cardId !== "string") return undefined;
    if (card.orientation !== "upright" && card.orientation !== "reversed") return undefined;
    cards.push({ position: card.position, cardId: card.cardId, orientation: card.orientation });
  }
  const chapterId = typeof value.chapterId === "string" ? value.chapterId : undefined;
  return { templateId, drawToken: value.drawToken, cards, ...(chapterId ? { chapterId } : {}) };
}

/** Keeps only values the catalog still knows, so stale or edited storage can never break a page. */
export function sanitizeFlow(value: unknown): FlowState {
  if (!isRecord(value)) return EMPTY_FLOW;
  const who = WHO_OPTIONS.find((option) => option.value === value.who)?.value;
  const whoText = who && who !== "me" ? typedPart(value.whoText, WHO_MAX) : undefined;
  // A typed 무엇 replaces the chip (and its situation chips); a typed 언제 replaces the time chip.
  const topicText = who ? typedPart(value.topicText) : undefined;
  const topic = topicText ? undefined : findTopic(who, typeof value.topicId === "string" ? value.topicId : undefined);
  const whenText = typedPart(value.whenText);
  // A `when` may be picked before the topic; once a topic is set it must allow it.
  const when = whenText ? undefined : allowedWhens(topic).find((w) => w === value.when);

  const conditions: Record<string, string> = {};
  const rawConditions = isRecord(value.conditions) ? value.conditions : {};
  for (const condition of topic?.conditions ?? []) {
    const chosen = rawConditions[condition.id];
    if (typeof chosen === "string" && condition.options.includes(chosen)) conditions[condition.id] = chosen;
  }

  const note = typeof value.note === "string" ? value.note.slice(0, NOTE_MAX) : "";
  const draw = sanitizeDraw(value.draw);
  const savedAt = typeof value.savedAt === "number" && Number.isFinite(value.savedAt) ? value.savedAt : undefined;
  return {
    ...(who ? { who } : {}),
    ...(whoText ? { whoText } : {}),
    ...(topic ? { topicId: topic.id } : {}),
    ...(topicText ? { topicText } : {}),
    ...(when ? { when } : {}),
    ...(whenText ? { whenText } : {}),
    conditions,
    note,
    ...(draw ? { draw } : {}),
    ...(savedAt !== undefined ? { savedAt } : {}),
  };
}

export interface FlowSummary {
  question: string;
  template: DrawTemplateId;
  /** Only the conditions the user chose, in the topic's order. */
  conditions: Array<{ label: string; value: string }>;
  note: string;
  /** A typed 무엇: no situation chips, a topic-neutral note example. */
  custom: boolean;
  /** A typed 무엇 said rather than named (a wish, an exclamation): shown under the question, not in it. */
  quote?: string;
  /** The chip topic (absent for a typed 무엇). */
  topic?: TopicDef;
}

/** The question as built so far, or null until 누구 · 무엇 · 언제 are all given. */
export function summarizeFlow(flow: FlowState | null): FlowSummary | null {
  if (!flow?.who) return null;
  const custom = Boolean(flow.topicText);
  const topic = custom ? undefined : findTopic(flow.who, flow.topicId);
  if (!custom && (!topic || topic.template === "daily")) return null;
  const question = composeFlowQuestion({ who: flow.who, whoText: flow.whoText, topic, topicText: flow.topicText, when: flow.when, whenText: flow.whenText });
  if (!question) return null;
  return {
    question,
    template: topic ? (topic.template as DrawTemplateId) : CUSTOM_TEMPLATE[flow.who],
    conditions: (topic?.conditions ?? []).flatMap((condition) => {
      const value = flow.conditions[condition.id];
      return value ? [{ label: condition.label, value }] : [];
    }),
    note: flow.note,
    custom,
    ...(topic ? { topic } : {}),
    ...(custom && flowQuote({ topicText: flow.topicText }) ? { quote: flowQuote({ topicText: flow.topicText })! } : {}),
  };
}

/** Where the result screen sends a flow it cannot read yet: no question, or no draw for it. */
export function resultGate(flow: FlowState): "builder" | "draw" | "ready" {
  const summary = summarizeFlow(flow);
  if (!summary) return "builder";
  // Sessions from before the server dealt the cards have no draw: they restart the draw cleanly.
  if (!flow.draw || flow.draw.templateId !== summary.template) return "draw";
  return "ready";
}

/** The `input` for /api/tarot/teaser and /api/tarot/reading (history is added by the caller). */
export function tarotInput(flow: FlowState, summary: FlowSummary): TarotInput {
  const topicText = cleanPart(flow.topicText);
  const whoText = cleanPart(flow.whoText);
  const whenText = cleanPart(flow.whenText);
  const note = flow.note.trim();
  return {
    topicId: summary.topic ? summary.topic.id : "custom",
    ...(flow.who ? { whoId: flow.who } : {}),
    ...(flow.when && !whenText ? { whenId: flow.when } : {}),
    question: summary.question.slice(0, 120),
    conditions: summary.conditions,
    ...(note ? { note } : {}),
    ...(summary.custom && topicText ? { topicText } : {}),
    ...(whoText ? { whoText } : {}),
    ...(whenText ? { whenText } : {}),
  };
}

export interface FlowFlags {
  /** Skip shuffle, reveal and generating delays (tests). */
  instant?: boolean;
}

/** Appends the allowed display flag to an app path. Nothing else ever goes into flow URLs. */
export function withFlags(path: string, flags: FlowFlags): string {
  if (!flags.instant) return path;
  return `${path}${path.includes("?") ? "&" : "?"}instant=1`;
}

// ---- sessionStorage-backed store ----

const listeners = new Set<() => void>();
/** Used only when sessionStorage is unavailable (private mode, blocked storage). */
let memoryRaw: string | null = null;
let cachedRaw: string | null | undefined;
let cachedFlow: FlowState = EMPTY_FLOW;

function readRaw(): string | null {
  if (memoryRaw !== null) return memoryRaw;
  try {
    return window.sessionStorage.getItem(FLOW_KEY);
  } catch {
    return null;
  }
}

function parse(raw: string | null): FlowState {
  if (!raw) return EMPTY_FLOW;
  try {
    return sanitizeFlow(JSON.parse(raw));
  } catch {
    return EMPTY_FLOW;
  }
}

function getSnapshot(): FlowState {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedFlow = parse(raw);
  }
  return cachedFlow;
}

const getServerSnapshot = (): FlowState | null => null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function saveFlow(next: FlowState) {
  const raw = JSON.stringify({ ...sanitizeFlow(next), savedAt: Date.now() });
  try {
    window.sessionStorage.setItem(FLOW_KEY, raw);
    memoryRaw = null;
  } catch {
    memoryRaw = raw;
  }
  listeners.forEach((listener) => listener());
}

/** Forgets the question in progress (내 정보 → 기록 모두 지우기). */
export function clearFlow() {
  saveFlow(EMPTY_FLOW);
}

/**
 * On entering the builder or the situation step: unless it was reached from inside the flow
 * (lib/freshStart.ts), or when the answers are 30 minutes old, start clean.
 */
export function freshFlowOnEntry(newQuestion: boolean, now = Date.now()) {
  if (readRaw() === null) return;
  if (newQuestion || isStale(getSnapshot().savedAt, now)) clearFlow();
}

/** The builder's and the situation step's entry rule (freshFlowOnEntry), before the first paint. */
export function useFreshFlowOnEntry() {
  useFlowVisit("tarot", (inFlow) => freshFlowOnEntry(!inFlow));
}

/** `flow` is null until the browser snapshot is read (server render and hydration). */
export function useFlowState(): {
  flow: FlowState | null;
  setFlow: (next: FlowState | ((prev: FlowState) => FlowState)) => void;
} {
  const flow = useSyncExternalStore<FlowState | null>(subscribe, getSnapshot, getServerSnapshot);
  const setFlow = useCallback((next: FlowState | ((prev: FlowState) => FlowState)) => {
    saveFlow(typeof next === "function" ? next(getSnapshot()) : next);
  }, []);
  return { flow, setFlow };
}
