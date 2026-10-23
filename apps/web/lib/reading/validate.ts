import { CARDS } from "@starlog/core";
import { isSajuTopic } from "@/lib/sajuTopics";
import type {
  ChartViewData,
  DailyData,
  DailyDeal,
  DeepTarotPreviewData,
  DeepTarotReadingData,
  FollowUpData,
  LegacyMatchReadingData,
  MatchPreviewData,
  MatchReadingData,
  NewYearPreviewData,
  NewYearReadingData,
  SajuGlance,
  SajuReadingData,
  SajuReadingResponse,
  SajuTeaserData,
  Section,
  TarotReadingData,
  TarotReadingResponse,
  TarotTeaserData,
} from "./types";

/**
 * Shape checks for what the reading API hands back, before anything is shown, cached or saved
 * (QA Q-02/Q-03: a malformed `done` must never reach a page or this device's storage). A response
 * that fails is treated like a failed generation: nothing is kept and the screen offers a retry.
 * `partialTarotReading` is the tolerant reader for readings already saved on this device.
 */

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
/** Tokens and answers must say something; the reading text itself is checked by the server. */
const isText = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isStrings = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");
const optional = <T>(value: unknown, check: (v: unknown) => v is T) => value === undefined || check(value);

const CARD_IDS = new Set(CARDS.map((card) => card.id));
export const isCardId = (value: unknown): value is string => typeof value === "string" && CARD_IDS.has(value);
const isOrientation = (value: unknown) => value === "upright" || value === "reversed";

export const isSection = (value: unknown): value is Section => isRecord(value) && isString(value.heading) && isString(value.body);

export function isTarotTeaser(value: unknown): value is TarotTeaserData {
  if (!isRecord(value) || !isSection(value.firstCard) || !isStrings(value.lockedToc) || !Array.isArray(value.cards)) return false;
  if (!optional(value.secondCard, isSection) || !optional(value.seal, isString) || !optional(value.share, isString)) return false;
  return value.cards.length > 0 && value.cards.every((c) => isRecord(c) && typeof c.position === "string" && isCardId(c.cardId) && typeof c.keyword === "string");
}

export function isSajuTeaser(value: unknown): value is SajuTeaserData {
  if (!isRecord(value) || !isString(value.title) || !isString(value.summary) || !isStrings(value.lockedToc)) return false;
  return optional(value.topic, isSajuTopic) && optional(value.freshUntil, isString) && optional(value.share, isString);
}

const isReadingCard = (c: unknown) => isRecord(c) && isString(c.position) && isCardId(c.cardId) && isString(c.heading) && isString(c.body);
const isList = (value: unknown, item: (v: unknown) => boolean) => isRecord(value) && isString(value.heading) && Array.isArray(value.items) && value.items.every(item);
const isScenario = (v: unknown) => isRecord(v) && typeof v.label === "string" && typeof v.body === "string";

/** A full tarot reading as the server writes it: every block present. */
export function isTarotReading(value: unknown): value is TarotReadingData {
  if (!isRecord(value) || !isString(value.verdict) || !Array.isArray(value.cards) || value.cards.length === 0 || !value.cards.every(isReadingCard)) return false;
  if (![value.connection, value.timing, value.alternatives, value.action].every(isSection) || !optional(value.observation, isSection)) return false;
  if (!isList(value.scenarios, isScenario) || !isList(value.avoid, (v) => typeof v === "string")) return false;
  if (!isList(value.messages, (v) => typeof v === "string") || typeof (value.messages as Record<string, unknown>).hint !== "string") return false;
  return optional(value.followUps, isStrings);
}

/** The 한눈에 보기 card: five sentences (a reading saved before it has no card at all, which is fine). */
export const isSajuGlance = (value: unknown): value is SajuGlance =>
  isRecord(value) && [value.goesWell, value.watchOut, value.remedy, value.thisYear, value.thisYearAction].every(isString);

export function isSajuReading(value: unknown): value is SajuReadingData {
  if (!isRecord(value) || !Array.isArray(value.sections) || value.sections.length === 0 || !value.sections.every(isSection)) return false;
  return optional(value.observation, isSection) && optional(value.glance, isSajuGlance) && optional(value.followUps, isStrings);
}

// ---- premium readings (P5): every block their pages read, so a damaged record never breaks its page ----

const isCardSection = (c: unknown) => isRecord(c) && isString(c.position) && isCardId(c.cardId) && isString(c.heading) && isString(c.body);

export function isDeepTarotReading(value: unknown): value is DeepTarotReadingData {
  if (!isRecord(value) || !isString(value.verdict) || !Array.isArray(value.positions) || !value.positions.every(isCardSection)) return false;
  if (![value.crossing, value.staff, value.timing, value.action, value.observation].every(isSection)) return false;
  const axes = value.axes;
  return isRecord(axes) && isString(axes.heading) && isSection(axes.vertical) && isSection(axes.horizontal) && optional(value.followUps, isStrings);
}

const isMatchSaju = (saju: unknown) => isRecord(saju) && [saju.dayMasters, saju.elements, saju.pillars, saju.luck].every(isSection);

/** A 궁합 as it is written now (saju only, owner 2026-10-17): the saju part, the year in bands, how to treat each other. */
export function isMatchReading(value: unknown): value is MatchReadingData {
  if (!isRecord(value) || !isString(value.verdict) || !isMatchSaju(value.saju)) return false;
  if (!Array.isArray(value.periods) || value.periods.length === 0 || !value.periods.every(isSection)) return false;
  return [value.together, value.avoid, value.action, value.observation].every(isSection) && optional(value.followUps, isStrings);
}

/** A 궁합 written with five cards, before it became saju only: still read whole, so its record opens. */
export function isLegacyMatchReading(value: unknown): value is LegacyMatchReadingData {
  if (!isRecord(value) || !isString(value.verdict) || !Array.isArray(value.cards) || !value.cards.every(isCardSection)) return false;
  if (!isMatchSaju(value.saju)) return false;
  return [value.connection, value.bridge, value.action, value.observation].every(isSection) && optional(value.followUps, isStrings);
}

/** Either shape, as a record on this device or in the account keeps it. */
export const isStoredMatchReading = (value: unknown): value is MatchReadingData | LegacyMatchReadingData => isMatchReading(value) || isLegacyMatchReading(value);

const isMonth = (m: unknown) => isRecord(m) && typeof m.month === "number" && isString(m.heading) && isString(m.body);

export function isNewYearReading(value: unknown): value is NewYearReadingData {
  if (!isRecord(value) || !isString(value.title) || ![value.overview, value.luck, value.lucky, value.closing, value.observation].every(isSection)) return false;
  const areas = value.areas;
  if (!isRecord(areas) || !isString(areas.heading) || ![areas.work, areas.money, areas.relations, areas.health].every(isSection)) return false;
  return Array.isArray(value.months) && value.months.every(isMonth) && optional(value.followUps, isStrings);
}

const isPreviewCard = (c: unknown) => isRecord(c) && isString(c.position) && isCardId(c.cardId) && isOrientation(c.orientation) && isString(c.keyword);
const isPreviewCards = (value: unknown) => Array.isArray(value) && value.length > 0 && value.every(isPreviewCard);

/** A computed chart as a preview shows it (PairCharts, ChartCard): no birth date. */
export function isChartView(value: unknown): value is ChartViewData {
  if (!isRecord(value) || !Array.isArray(value.pillars) || !isRecord(value.elements) || !isRecord(value.dayMaster)) return false;
  if (!value.pillars.every((p) => isRecord(p) && isString(p.label) && isString(p.gz) && isString(p.ko))) return false;
  return Object.values(value.elements).every((n) => typeof n === "number") && isString(value.dayMaster.display) && isString(value.dayMaster.image);
}

export const isDeepTarotPreview = (value: unknown): value is DeepTarotPreviewData =>
  isRecord(value) && isPreviewCards(value.cards) && isSection(value.now) && isStrings(value.lockedToc);

export const isMatchPreview = (value: unknown): value is MatchPreviewData =>
  isRecord(value) && isStrings(value.facts) && isRecord(value.charts) && isChartView(value.charts.me) && isChartView(value.charts.partner) &&
  isSection(value.summary) && isStrings(value.lockedToc);

export const isNewYearPreview = (value: unknown): value is NewYearPreviewData =>
  isRecord(value) && isString(value.title) && isStrings(value.facts) && isSection(value.summary) && isStrings(value.lockedToc);

/**
 * A saju reading saved on this device that can be shown whole: the 한눈에 보기 card aside, which the page leaves out on its
 * own when it cannot read it, so a card alone never makes a reading partial (review 2026-10-08).
 */
export const isWholeSajuReading = (value: unknown): boolean => isRecord(value) && isSajuReading({ ...value, glance: undefined });

export const isTarotReadingResponse = (value: unknown): value is TarotReadingResponse =>
  isRecord(value) && isText(value.chapterToken) && isTarotReading(value.reading);

export const isSajuReadingResponse = (value: unknown): value is SajuReadingResponse =>
  isRecord(value) && isText(value.chapterToken) && isSajuReading(value.reading);

export const isFollowUpData = (value: unknown): value is FollowUpData =>
  isRecord(value) && isText(value.answer) && isText(value.chapterToken) && typeof value.remaining === "number" && Number.isFinite(value.remaining);

export function isDailyData(value: unknown): value is DailyData {
  if (!isRecord(value) || !isRecord(value.card) || !isCardId(value.card.cardId) || !isOrientation(value.card.orientation)) return false;
  if (!isString(value.summary) || !isString(value.body) || !isString(value.tip)) return false;
  const { areas, lucky } = value;
  if (!isRecord(areas) || ![areas.love, areas.money, areas.work].every((a) => typeof a === "string")) return false;
  return isRecord(lucky) && typeof lucky.color === "string" && typeof lucky.number === "number";
}

export const isDailyDeal = (value: unknown): value is DailyDeal =>
  isRecord(value) && Array.isArray(value.deal) && value.deal.length > 0 && value.deal.every((d) => isRecord(d) && typeof d.index === "number");

/** A saved tarot reading's parts that can be shown; `complete` is false when any part is missing. */
export interface TarotReadingParts {
  verdict?: string;
  cards: TarotReadingData["cards"];
  sections: Section[];
  scenarios?: TarotReadingData["scenarios"];
  messages?: TarotReadingData["messages"];
  avoid?: TarotReadingData["avoid"];
  alternatives?: Section;
  action?: Section;
  complete: boolean;
}

/** The 첫 문장 block of a saved reading, with an empty hint when it has none. */
const messagesOf = (m: Record<string, unknown>): TarotReadingData["messages"] => ({
  heading: m.heading as string,
  items: m.items as string[],
  hint: isString(m.hint) ? m.hint : "",
});

/** Reads what it can of a saved tarot reading (an older version, or storage edited by hand). */
export function partialTarotReading(value: unknown): TarotReadingParts {
  const r = isRecord(value) ? value : {};
  const cards = Array.isArray(r.cards) ? (r.cards.filter(isReadingCard) as TarotReadingData["cards"]) : [];
  const sections = [r.connection, r.timing, r.observation].filter(isSection);
  const parts: TarotReadingParts = {
    ...(isString(r.verdict) ? { verdict: r.verdict } : {}),
    cards,
    sections,
    ...(isList(r.scenarios, isScenario) ? { scenarios: r.scenarios as TarotReadingData["scenarios"] } : {}),
    ...(isList(r.messages, (v) => typeof v === "string") ? { messages: messagesOf(r.messages as Record<string, unknown>) } : {}),
    ...(isList(r.avoid, (v) => typeof v === "string") ? { avoid: r.avoid as TarotReadingData["avoid"] } : {}),
    ...(isSection(r.alternatives) ? { alternatives: r.alternatives } : {}),
    ...(isSection(r.action) ? { action: r.action } : {}),
    complete: isTarotReading(value),
  };
  return parts;
}
