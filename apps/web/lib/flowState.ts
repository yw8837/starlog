import { useCallback, useSyncExternalStore } from "react";
import { TOPICS_BY_WHO, composeQuestion, type TemplateId, type TopicDef, type When, type Who } from "@starlog/core";

/**
 * Tarot question flow (builder → situation → draw → result), kept in sessionStorage.
 * The question, chosen conditions and note never go into a URL (spec §4.4); URLs only carry
 * the display flags handled by `withFlags`.
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

export const NOTE_MAX = 100;
export const FLOW_KEY = "starlog.tarot-flow";

export interface FlowState {
  who?: Who;
  topicId?: string;
  when?: When;
  /** condition id → chosen option */
  conditions: Record<string, string>;
  note: string;
}

export const EMPTY_FLOW: FlowState = Object.freeze({ conditions: Object.freeze({}), note: "" }) as FlowState;

export function findTopic(who: Who | undefined, topicId: string | undefined): TopicDef | undefined {
  if (!who || !topicId) return undefined;
  return TOPICS_BY_WHO[who].find((topic) => topic.id === topicId);
}

export function allowedWhens(topic: TopicDef | undefined): When[] {
  return topic?.whens ?? WHEN_OPTIONS.map((option) => option.value);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Keeps only values the catalog still knows, so stale or edited storage can never break a page. */
export function sanitizeFlow(value: unknown): FlowState {
  if (!isRecord(value)) return EMPTY_FLOW;
  const who = WHO_OPTIONS.find((option) => option.value === value.who)?.value;
  const topic = findTopic(who, typeof value.topicId === "string" ? value.topicId : undefined);
  // A `when` may be picked before the topic; once a topic is set it must allow it.
  const when = allowedWhens(topic).find((w) => w === value.when);

  const conditions: Record<string, string> = {};
  const rawConditions = isRecord(value.conditions) ? value.conditions : {};
  for (const condition of topic?.conditions ?? []) {
    const chosen = rawConditions[condition.id];
    if (typeof chosen === "string" && condition.options.includes(chosen)) conditions[condition.id] = chosen;
  }

  const note = typeof value.note === "string" ? value.note.slice(0, NOTE_MAX) : "";
  return {
    ...(who ? { who } : {}),
    ...(topic ? { topicId: topic.id } : {}),
    ...(when ? { when } : {}),
    conditions,
    note,
  };
}

export interface FlowSummary {
  question: string;
  template: TemplateId;
  /** Only the conditions the user chose, in the topic's order. */
  conditions: Array<{ label: string; value: string }>;
  note: string;
  /** True when the flow was empty and the fixture's own input is shown instead. */
  fromFixture: boolean;
}

export interface FlowFallback {
  question: string;
  template: TemplateId;
  input: { conditions: Array<{ label: string; value: string }>; note: string };
}

/** What the result and chapter screens show: the user's own question, or the fixture's on a direct visit. */
export function summarizeFlow(flow: FlowState | null, fallback: FlowFallback): FlowSummary {
  const topic = findTopic(flow?.who, flow?.topicId);
  if (!flow?.who || !topic || !flow.when) {
    return {
      question: fallback.question,
      template: fallback.template,
      conditions: fallback.input.conditions,
      note: fallback.input.note,
      fromFixture: true,
    };
  }
  return {
    question: composeQuestion(flow.who, topic, flow.when),
    template: topic.template,
    conditions: topic.conditions.flatMap((condition) => {
      const value = flow.conditions[condition.id];
      return value ? [{ label: condition.label, value }] : [];
    }),
    note: flow.note,
    fromFixture: false,
  };
}

export interface FlowFlags {
  /** Skip shuffle, reveal and generating delays (tests). */
  instant?: boolean;
  /** Show the returning-visitor unlock sheet. */
  visit?: "returning";
}

/** Appends the allowed display flags to an app path. Nothing else ever goes into flow URLs. */
export function withFlags(path: string, flags: FlowFlags): string {
  const params: string[] = [];
  if (flags.instant) params.push("instant=1");
  if (flags.visit === "returning") params.push("visit=returning");
  if (params.length === 0) return path;
  return `${path}${path.includes("?") ? "&" : "?"}${params.join("&")}`;
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
  const raw = JSON.stringify(sanitizeFlow(next));
  try {
    window.sessionStorage.setItem(FLOW_KEY, raw);
    memoryRaw = null;
  } catch {
    memoryRaw = raw;
  }
  listeners.forEach((listener) => listener());
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
