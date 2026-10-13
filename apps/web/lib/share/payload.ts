import { TEMPLATES, type Orientation, type TemplateId } from "@starlog/core";
import type { ReadingBody } from "@/components/tarot/ReadingArticle";
import type { FrontDeck } from "@/lib/deck";
import type { Section, SajuGlance, SajuTopicId } from "@/lib/reading/types";
import { isSajuGlance, isSection } from "@/lib/reading/validate";
import { isSajuTopicId } from "@/lib/sajuTopics";
import type { BirthInput } from "@/lib/api/inputs";
import type { ChapterContext } from "@/lib/security/chapterToken";

/**
 * 결과 공유 (owner 2026-10-13): what a shared link shows is the result screen itself, the cards and
 * the whole reading, without the question, the user's own words, the follow-ups and the birth data.
 * The payload is built on the server from a chapter the server signed, so its text is always the
 * reading the server wrote; the only thing the sharer picks is the card design it was read with.
 */

export interface SharedTarot {
  kind: "tarot";
  v: 1;
  deck: FrontDeck;
  cards: Array<{ cardId: string; orientation: Orientation; position: string }>;
  reading: ReadingBody;
}

export interface SharedSaju {
  kind: "saju";
  v: 1;
  /** 주제별 사주; absent for 사주팔자 (전체 흐름) */
  topic?: SajuTopicId;
  reading: { glance?: SajuGlance; sections: Section[]; observation?: Section };
}

export type SharePayload = SharedTarot | SharedSaju;

/** What stands in for the user's own words, wherever the reading quotes them. */
export const HIDDEN = "○○";

/** The saju section that states the birth data the chart was computed from: never shared. */
const BASIS_HEADING = "계산 기준";

const QUOTES = /(["“”'‘’「」『』])([^"“”'‘’「」『』\n]{4,200}?)(["“”'‘’「」『』])/g;

/** The user's own free text in a tarot input: the question, the note and the typed 무엇·누구·언제. */
function ownWords(input: Extract<ChapterContext, { kind: "tarot" }>["input"]): string[] {
  const words = [input.question, input.note, input.topicText, input.whoText, input.whenText]
    .map((text) => (typeof text === "string" ? text.trim() : ""))
    .filter((text) => text.length >= 2);
  // Longer first, so a whole note is replaced before a shorter word inside it.
  return [...new Set(words)].sort((a, b) => b.length - a.length);
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The text with every occurrence of the user's own words, and every quotation that is part of
 * them, replaced by ○○. The preset chips stay: they are the service's words, not the user's.
 */
export function hideOwnWords(text: string, words: readonly string[]): string {
  let out = text.replace(QUOTES, (whole, open: string, inner: string, close: string) =>
    words.some((word) => word.includes(inner.trim())) ? `${open}${HIDDEN}${close}` : whole,
  );
  for (const word of words) out = out.replace(new RegExp(escapeRegExp(word), "g"), HIDDEN);
  return out;
}

/**
 * The text without the birth's date and clock time, in the ways a reading writes them ("1990년 1월
 * 1일", "1990-01-01", "1월 1일", "오후 12시 30분"). Other dates stay: a reading's 2027년 3월 is not
 * the user's birth.
 */
export function hideBirth(text: string, birth: BirthInput): string {
  const { year, month, day } = birth;
  const m = `0?${month}`;
  const d = `0?${day}`;
  const patterns = [
    String.raw`${year}\s?년\s?${m}\s?월(?:\s?${d}\s?일)?`,
    String.raw`${year}[-./]${m}[-./]${d}`,
    String.raw`(?<!\d)${m}\s?월\s?${d}\s?일`,
    String.raw`(?<!\d)${year}\s?년생?`,
  ];
  if (birth.timeKnown && birth.hour !== null) {
    const hours = [...new Set([birth.hour, birth.hour % 12 || 12])].join("|");
    const minute = birth.minute === null ? "" : String.raw`(?:\s?0?${birth.minute}\s?분)?`;
    patterns.push(String.raw`(?:(?:오전|오후|새벽|아침|낮|저녁|밤)\s?)?(?<!\d)(?:${hours})\s?시(?!간)${minute}`);
  }
  return patterns.reduce((out, pattern) => out.replace(new RegExp(pattern, "g"), HIDDEN), text);
}

/** Every string in a JSON value, rewritten by `edit` (objects and arrays keep their shape). */
function mapStrings<T>(value: T, edit: (text: string) => string): T {
  if (typeof value === "string") return edit(value) as T;
  if (Array.isArray(value)) return value.map((item) => mapStrings(item, edit)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapStrings(item, edit)])) as T;
  }
  return value;
}

const READING_KEYS = ["verdict", "cards", "connection", "timing", "observation", "scenarios", "messages", "avoid", "alternatives", "action"] as const;

export function buildSharePayload(ctx: ChapterContext, reading: unknown, deck: FrontDeck = "starlog"): SharePayload {
  const r = (reading ?? {}) as Record<string, unknown>;
  if (ctx.kind === "tarot") {
    const words = ownWords(ctx.input);
    const positions = TEMPLATES[ctx.templateId as TemplateId].positions;
    // Only the reading's own blocks: never the follow-up suggestions or an old story block.
    const body = Object.fromEntries(READING_KEYS.filter((key) => r[key] !== undefined).map((key) => [key, r[key]]));
    return {
      kind: "tarot",
      v: 1,
      deck,
      cards: ctx.cards.map(([cardId, orientation], slot) => ({ cardId, orientation, position: positions[slot] ?? "" })),
      reading: mapStrings(body, (text) => hideOwnWords(text, words)) as unknown as ReadingBody,
    };
  }
  if (ctx.kind === "saju") {
    const sections = (Array.isArray(r.sections) ? r.sections : []).filter(isSection).filter((section) => !section.heading.startsWith(BASIS_HEADING));
    const shared: SharedSaju["reading"] = {
      ...(isSajuGlance(r.glance) ? { glance: r.glance } : {}),
      sections,
      ...(isSection(r.observation) ? { observation: r.observation } : {}),
    };
    return { kind: "saju", v: 1, ...(ctx.topic ? { topic: ctx.topic } : {}), reading: mapStrings(shared, (text) => hideBirth(text, ctx.birth)) };
  }
  throw new Error(`a ${ctx.kind} reading is not shared yet`);
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** A stored payload, or null when it is not one this version wrote. */
export function parseSharePayload(text: string): SharePayload | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(value) || value.v !== 1 || !isRecord(value.reading)) return null;
  if (value.kind === "tarot") {
    if (!Array.isArray(value.cards) || value.cards.length === 0 || (value.deck !== "starlog" && value.deck !== "rws1909")) return null;
    return value as unknown as SharedTarot;
  }
  if (value.kind === "saju") {
    if (!Array.isArray(value.reading.sections) || (value.topic !== undefined && !isSajuTopicId(value.topic))) return null;
    return value as unknown as SharedSaju;
  }
  return null;
}
