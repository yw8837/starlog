import type { Orientation } from "@starlog/core";
import { FRONT_DECKS, type FrontDeck } from "@/lib/deck";
import { SITE } from "@/lib/config";
import { kstDate, kstDaysBetween, kstMonthDay } from "@/lib/kst";
import { PREMIUM, PREMIUM_CHAPTER_TTL_MS, isPremiumId, type PremiumId } from "@/lib/premium/products";
import {
  CHECKIN_ANSWERS, type CheckinAnswer, type DeepTarotReadingData, type HistoryItem, type NewYearReadingData, type SajuContext, type StoredMatchReadingData,
  type SajuReadingData, type SajuTopic, type SajuTopicId, type TarotReadingData,
} from "@/lib/reading/types";
import { isCardId, isDeepTarotReading, isLegacyMatchReading, isMatchReading, isNewYearReading } from "@/lib/reading/validate";
import { sanitizeSajuContext } from "@/lib/sajuFlow";
import { formatBirthDate, sanitizeSajuForm, type SajuForm } from "@/lib/sajuForm";
import { isSajuTopicId, topicLabel } from "@/lib/sajuTopics";
import { createLocalStore } from "@/lib/sessionStore";
import { stopKnownShareLink } from "@/lib/share/client";
import { clearMatchSeals, dropMatchSeal, keepMatchSeals, pruneMatchSeals } from "./matchSeals";

/**
 * Opened readings (내 기록), kept on this device only (localStorage), oldest first. A saved reading
 * never calls the API again; its follow-ups carry the latest chapter token. Readings are stored
 * exactly as the server returned them, because follow-ups send them back for a digest check.
 */

export const CHAPTERS_KEY = "starlog.chapters";

export interface ChapterCard {
  position: string;
  cardId: string;
  orientation: Orientation;
  keyword?: string;
}

export interface FollowUpTurn {
  question: string;
  answer: string;
}

/** 돌아보기: the user's answer to the reading's observation, and when it was given. */
export interface Checkin {
  answer: CheckinAnswer;
  at: number;
}

interface ChapterBase {
  id: string;
  /** Epoch ms. */
  createdAt: number;
  chapterToken: string;
  turns: FollowUpTurn[];
  /** Follow-up questions still allowed (the server's count after the last answer). */
  followUpsLeft: number;
  checkin?: Checkin;
  /** The account copy's id (Tasks 10–11): follow-ups update it there too. */
  serverId?: string;
  /**
   * The card design the reading was written for (its picture is the one it quotes); the record and
   * its share show the cards in it. Absent on readings opened before 2026-10-14: those were written for the 1909 scans.
   */
  deck?: FrontDeck;
  /**
   * Opened with 오픈 기념 무료: read and kept on this device only (owner 2026-10-14 evening), so the record
   * shows no follow-up box (the server refuses follow-ups for its chapter token); it is shared like any other (owner 2026-10-23).
   */
  opening?: true;
  /** Account sync: moved into the account from a device (the server marks its copy too); who opened it is not known, so it takes no review. */
  moved?: true;
}

export interface TarotChapter extends ChapterBase {
  kind: "tarot";
  question: string;
  conditions: Array<{ label: string; value: string }>;
  note: string;
  cards: ChapterCard[];
  reading: TarotReadingData;
}

export interface SajuChapter extends ChapterBase {
  kind: "saju";
  birth: SajuForm;
  /** The free teaser's title and summary. */
  title: string;
  summary: string;
  /** 주제별 사주: the 운 it was opened for (absent: 전체 흐름, or an older version). */
  topic?: SajuTopicId;
  /** The status chips and concern it was written with (so the same input is not opened twice). */
  context?: SajuContext;
  reading: SajuReadingData;
}

/** P5 심층 타로: the question flow's fields and the ten cards as dealt. */
export interface DeepTarotChapter extends ChapterBase {
  kind: "tarot-deep";
  question: string;
  conditions: Array<{ label: string; value: string }>;
  note: string;
  cards: ChapterCard[];
  reading: DeepTarotReadingData;
}

/**
 * P5 프리미엄 궁합: the user's birth, the relation and label. The partner's birth is never kept as text (owner
 * 2026-10-16): it lives only sealed inside `chapterToken`, for the 30 follow-up days, on the device that wrote it; a
 * copy from the account has no token ("") and takes no follow-up. Saju only since 2026-10-17 (owner): a 궁합 written
 * before keeps its five cards (and their `deck`) and its reading's card part, and still opens.
 */
export interface MatchChapter extends ChapterBase {
  kind: "match";
  relation: string;
  /** "친구" */
  relationLabel: string;
  /** What the user calls the other person, when given. */
  partnerLabel?: string;
  me: { birth: SajuForm };
  concern?: string;
  /** the five cards of a 궁합 written before it became saju only */
  cards?: ChapterCard[];
  reading: StoredMatchReadingData;
}

/** P5 2027 신년운세. */
export interface NewYearChapter extends ChapterBase {
  kind: "newyear-2027";
  birth: SajuForm;
  /** The reading's theme ("차근차근 쌓아 가는 해"). */
  title: string;
  context?: SajuContext;
  reading: NewYearReadingData;
}

export type PremiumChapter = DeepTarotChapter | MatchChapter | NewYearChapter;
export type StoredChapter = TarotChapter | SajuChapter | PremiumChapter;

export const isPremiumChapter = (chapter: { kind: string }): chapter is PremiumChapter => isPremiumId(chapter.kind);

/**
 * 풀이 후기 can be written on this record: it is kept in an account (spec §2), and was not opened with 오픈 기념 무료 or moved
 * in from a device (account sync: lib/reviews/store.ts refuses both).
 */
export const reviewable = (chapter: StoredChapter): boolean => Boolean(chapter.serverId) && !chapter.opening && !chapter.moved;

type Fresh<T> = T extends StoredChapter ? Omit<T, "id" | "createdAt" | "turns" | "followUpsLeft" | "checkin"> : never;
export type NewChapter = Fresh<StoredChapter>;

// ---- reading storage back ----

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const isSection = (value: unknown) => isRecord(value) && isString(value.heading) && isString(value.body);

function parseCard(value: unknown): ChapterCard | null {
  if (!isRecord(value) || !isString(value.position) || !isString(value.cardId)) return null;
  if (value.orientation !== "upright" && value.orientation !== "reversed") return null;
  return { position: value.position, cardId: value.cardId, orientation: value.orientation, ...(isString(value.keyword) ? { keyword: value.keyword } : {}) };
}

function parseTurns(value: unknown): FollowUpTurn[] {
  if (!Array.isArray(value)) return [];
  return value.filter((t): t is FollowUpTurn => isRecord(t) && isString(t.question) && isString(t.answer)).map(({ question, answer }) => ({ question, answer }));
}

function parseCheckin(value: unknown): Checkin | undefined {
  if (!isRecord(value) || typeof value.at !== "number") return undefined;
  const answer = CHECKIN_ANSWERS.find((a) => a === value.answer);
  return answer ? { answer, at: value.at } : undefined;
}

/** One stored chapter, or null when anything the pages need is missing (then it is skipped). */
export function parseChapter(value: unknown): StoredChapter | null {
  if (!isRecord(value) || !isString(value.id) || !/^[a-z0-9]{6,32}$/.test(value.id)) return null;
  if (typeof value.createdAt !== "number" || !isString(value.chapterToken) || !isRecord(value.reading)) return null;
  const base: ChapterBase = {
    id: value.id,
    createdAt: value.createdAt,
    chapterToken: value.chapterToken,
    turns: parseTurns(value.turns),
    followUpsLeft: typeof value.followUpsLeft === "number" ? Math.max(0, Math.floor(value.followUpsLeft)) : 0,
  };
  const checkin = parseCheckin(value.checkin);
  if (checkin) base.checkin = checkin;
  if (isString(value.serverId) && /^[a-z0-9]{20}$/.test(value.serverId)) base.serverId = value.serverId;
  const deck = FRONT_DECKS.find((option) => option === value.deck);
  if (deck) base.deck = deck;
  if (value.opening === true) base.opening = true;
  if (value.moved === true) base.moved = true;
  const reading = value.reading;

  if (value.kind === "tarot") {
    const cards = Array.isArray(value.cards) ? value.cards.map(parseCard) : [];
    if (cards.length === 0 || cards.some((c) => c === null)) return null;
    if (!isString(reading.verdict) || !Array.isArray(reading.cards) || !isSection(reading.action)) return null;
    const conditions = Array.isArray(value.conditions)
      ? value.conditions.filter((c): c is { label: string; value: string } => isRecord(c) && isString(c.label) && isString(c.value))
      : [];
    return {
      ...base,
      kind: "tarot",
      question: isString(value.question) ? value.question : "",
      conditions: conditions.map(({ label, value: v }) => ({ label, value: v })),
      note: isString(value.note) ? value.note : "",
      cards: cards as ChapterCard[],
      reading: reading as unknown as TarotReadingData,
    };
  }
  // A premium record is read whole or not at all: its page reads every block (and draws every card), so a
  // damaged one goes to the 이 기록을 읽지 못했어요 screen instead of breaking it.
  if (value.kind === "tarot-deep" || value.kind === "match") {
    const cards = Array.isArray(value.cards) ? value.cards.map(parseCard) : [];
    const cardsWhole = cards.length > 0 && cards.every((c) => c !== null && isCardId(c.cardId));
    if (value.kind === "tarot-deep") {
      if (!cardsWhole) return null;
      if (!isDeepTarotReading(reading)) return null;
      const conditions = Array.isArray(value.conditions)
        ? value.conditions.filter((c): c is { label: string; value: string } => isRecord(c) && isString(c.label) && isString(c.value))
        : [];
      return {
        ...base,
        kind: "tarot-deep",
        question: isString(value.question) ? value.question : "",
        conditions: conditions.map(({ label, value: v }) => ({ label, value: v })),
        note: isString(value.note) ? value.note : "",
        cards: cards as ChapterCard[],
        reading: reading as unknown as DeepTarotReadingData,
      };
    }
    // An older shape's partner birth (text) is read past and dropped (owner 2026-10-16).
    const me = isRecord(value.me) ? sanitizeSajuForm(value.me.birth) : null;
    if (!me || !isString(value.relation)) return null;
    // Saju only now; one written with five cards still opens, whole with its cards (owner 2026-10-17).
    const legacy = isLegacyMatchReading(reading);
    if (legacy ? !cardsWhole : !isMatchReading(reading)) return null;
    return {
      ...base,
      kind: "match",
      relation: value.relation,
      relationLabel: isString(value.relationLabel) ? value.relationLabel : "",
      ...(isString(value.partnerLabel) && value.partnerLabel ? { partnerLabel: value.partnerLabel } : {}),
      me: { birth: me },
      ...(isString(value.concern) && value.concern ? { concern: value.concern } : {}),
      ...(legacy ? { cards: cards as ChapterCard[] } : {}),
      reading: reading as unknown as StoredMatchReadingData,
    };
  }
  if (value.kind === "newyear-2027") {
    const birth = sanitizeSajuForm(value.birth);
    if (!birth || !isNewYearReading(reading)) return null;
    const context = sanitizeSajuContext(value.context);
    return {
      ...base,
      kind: "newyear-2027",
      birth,
      title: isString(value.title) ? value.title : isString(reading.title) ? reading.title : "",
      ...(context ? { context } : {}),
      reading: reading as unknown as NewYearReadingData,
    };
  }
  if (value.kind === "saju") {
    const birth = sanitizeSajuForm(value.birth);
    if (!birth || !Array.isArray(reading.sections) || !reading.sections.every(isSection)) return null;
    const context = sanitizeSajuContext(value.context);
    // An unknown topic (a newer version's) reads as 전체 흐름; the record itself stays (spec §7.2).
    const topic = isSajuTopicId(value.topic) ? value.topic : undefined;
    return {
      ...base,
      kind: "saju",
      birth,
      ...(topic ? { topic } : {}),
      ...(context ? { context } : {}),
      title: isString(value.title) ? value.title : "",
      summary: isString(value.summary) ? value.summary : "",
      reading: reading as unknown as SajuReadingData,
    };
  }
  return null;
}

/**
 * What localStorage holds: `{v: 1, chapters: [...]}`. The entries stay as stored (raw), so a
 * save, update or delete touches only its own entry and never drops one this version cannot read
 * (a reading's only copy). The first versions stored a bare array; it reads as v1.
 */
interface Envelope {
  v: 1;
  chapters: unknown[];
}

const parseEnvelope = (value: unknown): Envelope | null => {
  if (Array.isArray(value)) return { v: 1, chapters: value };
  if (isRecord(value) && value.v === 1 && Array.isArray(value.chapters)) return { v: 1, chapters: value.chapters };
  return null;
};

const store = createLocalStore<Envelope>(CHAPTERS_KEY, parseEnvelope);

/** The readable chapters of an envelope, computed once per stored value. */
const readable = new WeakMap<Envelope, StoredChapter[]>();
function chaptersOf(envelope: Envelope | null): StoredChapter[] {
  if (!envelope) return [];
  let parsed = readable.get(envelope);
  if (!parsed) {
    parsed = envelope.chapters.map(parseChapter).filter((c): c is StoredChapter => c !== null);
    readable.set(envelope, parsed);
  }
  return parsed;
}

const rawEntries = (): unknown[] => store.read()?.chapters ?? [];
const idOf = (entry: unknown) => (isRecord(entry) && typeof entry.id === "string" ? entry.id : undefined);

function newId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 36).toString(36)).join("");
}

export function listChapters(): StoredChapter[] {
  return chaptersOf(store.read());
}

export function getChapter(id: string): StoredChapter | undefined {
  return listChapters().find((chapter) => chapter.id === id);
}

/**
 * Stores a freshly opened reading with its follow-up allowance. `persisted` is false when the
 * browser would not keep it (storage full or blocked): it then lives only until the tab closes.
 */
export function saveChapter(input: NewChapter, now: number = Date.now()): { chapter: StoredChapter; persisted: boolean } {
  // a premium reading includes its own follow-ups (PREMIUM[kind].followUps, 3); the standard ones SITE's
  const followUpsLeft = isPremiumId(input.kind) ? PREMIUM[input.kind as PremiumId].followUps : SITE.reading.followUps;
  const chapter = { ...input, id: newId(), createdAt: now, turns: [], followUpsLeft } as StoredChapter;
  const persisted = store.save({ v: 1, chapters: [...rawEntries(), chapter] });
  return { chapter, persisted };
}

/**
 * Changes one readable chapter; every other stored entry stays exactly as it was. A change that
 * would leave the chapter unreadable (a missing token, say) is not written: the reading stays.
 */
export function updateChapter(id: string, update: (chapter: StoredChapter) => StoredChapter) {
  store.save({
    v: 1,
    chapters: rawEntries().map((entry) => {
      if (idOf(entry) !== id) return entry;
      const chapter = parseChapter(entry);
      if (!chapter) return entry;
      const next = update(chapter);
      return parseChapter(next) ? next : entry;
    }),
  });
}

/**
 * 궁합 (owner 2026-10-16): what this device may still hold of the partner. A birth kept as text by an older version goes,
 * with the token of that version (it carried the birth too, review 2026-10-17 L1); past the 30 follow-up days the token,
 * with its sealed partner, goes too. Null when the entry is fine as it is.
 */
function tidiedMatch(entry: unknown, now: number): Record<string, unknown> | null {
  if (!isRecord(entry) || entry.kind !== "match") return null;
  const expired = typeof entry.createdAt === "number" && now - entry.createdAt >= PREMIUM_CHAPTER_TTL_MS;
  const sealed = isString(entry.chapterToken) && entry.chapterToken !== "";
  const legacy = "partner" in entry;
  if (!legacy && !(expired && sealed)) return null;
  const { partner: _partner, ...rest } = entry;
  return { ...rest, chapterToken: "" };
}

/** Put right when the record is opened. */
export function tidyMatchChapter(id: string, now: number = Date.now()): void {
  const entries = rawEntries();
  if (!entries.some((e) => idOf(e) === id && tidiedMatch(e, now))) return;
  store.save({ v: 1, chapters: entries.map((e) => (idOf(e) === id ? (tidiedMatch(e, now) ?? e) : e)) });
}

/**
 * Whenever the app opens (RouteTracker), every 궁합 is put right, opened or not, and the seals kept across a logout past
 * their days go (review 2026-10-17 M2): the policy says the partner is gone after the 30 days. Writes nothing otherwise.
 */
export function pruneMatchPartners(now: number = Date.now()): void {
  const entries = rawEntries();
  if (entries.some((e) => tidiedMatch(e, now))) store.save({ v: 1, chapters: entries.map((e) => tidiedMatch(e, now) ?? e) });
  pruneMatchSeals(now);
}

/** True when this device holds an entry with this id, readable or not (a broken one can be erased). */
export const hasChapterEntry = (id: string) => rawEntries().some((entry) => idOf(entry) === id);

export function deleteChapter(id: string) {
  const chapter = getChapter(id);
  store.save({ v: 1, chapters: rawEntries().filter((entry) => idOf(entry) !== id) });
  // A 궁합's seal kept across a logout goes with it (review 2026-10-17 #5).
  if (chapter?.kind === "match" && chapter.serverId) dropMatchSeal(chapter.serverId);
  // Its share link goes too, best effort: the delete never waits for it.
  if (chapter) stopKnownShareLink(chapter);
}

type AccountReading = { id: string; createdAt: number; chapter: unknown };

const fromAccount = (remote: AccountReading, id: string) =>
  isRecord(remote.chapter) ? parseChapter({ ...remote.chapter, id, serverId: remote.id, createdAt: remote.createdAt }) : null;

/**
 * Brings readings saved in the account onto this device (a reading opened elsewhere, a delivery
 * this page lost, follow-ups answered on another device). A new one keeps its account id as its local
 * id. A known one only takes newer follow-up turns. Returns how many chapters were added.
 */
export function mergeServerReadings(readings: readonly AccountReading[]): number {
  const entries = rawEntries();
  const byServerId = new Map(readings.map((remote) => [remote.id, remote]));
  let changed = false;
  const updated = entries.map((entry) => {
    const chapter = parseChapter(entry);
    const remote = chapter?.serverId ? byServerId.get(chapter.serverId) : undefined;
    const parsed = chapter && remote ? fromAccount(remote, chapter.id) : null;
    if (!chapter || !parsed || parsed.turns.length <= chapter.turns.length) return entry;
    changed = true;
    return { ...chapter, turns: parsed.turns, chapterToken: parsed.chapterToken, followUpsLeft: parsed.followUpsLeft };
  });
  const known = new Set<string>();
  for (const entry of entries) {
    const id = idOf(entry);
    if (id) known.add(id);
    const serverId = isRecord(entry) && isString(entry.serverId) ? entry.serverId : null;
    if (serverId) known.add(serverId);
  }
  const fresh: StoredChapter[] = [];
  for (const remote of readings) {
    if (known.has(remote.id)) continue;
    const parsed = fromAccount(remote, remote.id);
    if (!parsed) continue;
    fresh.push(parsed);
    known.add(remote.id);
  }
  if (changed || fresh.length) store.save({ v: 1, chapters: [...updated, ...fresh] });
  return fresh.length;
}

/**
 * Account sync: a chapter moved into the account takes its account id and the server's `moved` mark (lib/storage/move.ts).
 * A copy of it pulled from the account before (a move that landed but whose answer was lost) leaves, so 내 기록 holds the
 * reading once.
 */
export function linkServerId(id: string, serverId: string): void {
  const entries = rawEntries();
  if (!entries.some((entry) => idOf(entry) === id)) return;
  store.save({
    v: 1,
    chapters: entries.flatMap((entry) => {
      if (!isRecord(entry)) return [entry];
      if (entry.id === id) return [{ ...entry, serverId, moved: true }];
      return entry.id === serverId || entry.serverId === serverId ? [] : [entry];
    }),
  });
}

/** 내 기록: each reading once, whether it came from this device or the account (by its own id and its account id); the first stays. */
export function uniqueChapters(chapters: readonly StoredChapter[]): StoredChapter[] {
  const seen = new Set<string>();
  return chapters.filter((chapter) => {
    const keys = chapter.serverId ? [chapter.id, chapter.serverId] : [chapter.id];
    if (keys.some((key) => seen.has(key))) return false;
    keys.forEach((key) => seen.add(key));
    return true;
  });
}

/** After the account's copies were deleted: this device's chapters stand alone again. */
export function forgetServerIds() {
  store.save({
    v: 1,
    chapters: rawEntries().map((entry) => {
      if (!isRecord(entry) || !("serverId" in entry)) return entry;
      const { serverId: _serverId, ...rest } = entry;
      return rest;
    }),
  });
}

/**
 * After a logout or the account's deletion: every chapter that came from or went to the account
 * (it has a serverId) leaves this device, so the next person on a shared phone does not see its
 * birth data or questions. Chapters opened here without the account stay. Returns how many left.
 * A 궁합's sealed partner stays behind on its own after a logout (matchSeals.ts), so this device can ask follow-ups
 * again; after the account's deletion (`keepSeals: false`) nothing stays (review 2026-10-17 #5).
 */
export function removeServerChapters({ keepSeals = true }: { keepSeals?: boolean } = {}): number {
  const entries = rawEntries();
  if (keepSeals) keepMatchSeals(entries);
  else clearMatchSeals();
  const kept = entries.filter((entry) => !(isRecord(entry) && "serverId" in entry));
  if (kept.length !== entries.length) store.save({ v: 1, chapters: kept });
  return entries.length - kept.length;
}

export function clearChapters() {
  const chapters = listChapters();
  store.clear();
  clearMatchSeals();
  // Their share links go too, best effort (the clear never waits): the tokens that stop them leave with the readings.
  chapters.forEach((chapter) => stopKnownShareLink(chapter));
}

/** False while saved readings live only in memory (the browser refused to store them). */
export const chaptersPersisted = () => store.persisted();

/** Every readable stored chapter, oldest first: undefined before hydration. */
export function useChapters(): StoredChapter[] | undefined {
  const value = store.useValue();
  return value === undefined ? undefined : chaptersOf(value);
}

/** Newest first, for 내 기록 and the home. */
export const newestFirst = (chapters: readonly StoredChapter[]) => [...chapters].sort((a, b) => b.createdAt - a.createdAt);

// ---- 돌아보기 ----

/** Days after a reading before its observation is asked about (and again after 아직이에요). */
export const CHECKIN_AFTER_DAYS = 3;

/** The observation to look back on, when the reading has one (newer readings only). */
export const observationOf = (chapter: StoredChapter): string | undefined => {
  const body: unknown = chapter.reading.observation?.body;
  return typeof body === "string" ? body.trim() || undefined : undefined;
};

/** True when this reading's observation should be asked about now. */
export function checkinDue(chapter: StoredChapter, now: number): boolean {
  if (!observationOf(chapter)) return false;
  if (!chapter.checkin) return kstDaysBetween(chapter.createdAt, now) >= CHECKIN_AFTER_DAYS;
  return chapter.checkin.answer === "아직이에요" && kstDaysBetween(chapter.checkin.at, now) >= CHECKIN_AFTER_DAYS;
}

/** The newest reading whose observation is due, if any (the home shows one at a time). */
export function dueCheckin(chapters: readonly StoredChapter[], now: number): StoredChapter | undefined {
  return newestFirst(chapters).find((chapter) => checkinDue(chapter, now));
}

export function answerCheckin(id: string, answer: CheckinAnswer, now: number = Date.now()) {
  updateChapter(id, (chapter) => ({ ...chapter, checkin: { answer, at: now } }));
}

// ---- history sent with a new reading ----

const HISTORY_MAX = 3;
const CAP = { question: 60, verdict: 80, observation: 120 } as const;

const clip = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
};

/** What a record says in one line: the question and the short answer ("사주 재물운 · <맛보기 제목>" for a topic). */
export function recordLine(chapter: StoredChapter): { question: string; verdict: string } {
  if (chapter.kind === "tarot" || chapter.kind === "tarot-deep") return { question: chapter.question, verdict: chapter.reading.verdict };
  if (chapter.kind === "match") return { question: `${PREMIUM.match.name} · ${chapter.relationLabel}`, verdict: chapter.reading.verdict };
  if (chapter.kind === "newyear-2027") return { question: PREMIUM["newyear-2027"].name, verdict: chapter.title };
  const label = chapter.topic ? `사주 ${topicLabel(chapter.topic)}` : "사주";
  return { question: chapter.title ? `${label} · ${chapter.title}` : label, verdict: chapter.summary };
}

/**
 * 내 기록's title for a saju record (saju-topics spec §5.3): "<운> · <생일>" ("재물운 · 1992년 8월 3일";
 * a record without a topic is "사주팔자 · …"). While the topics are closed, a record without a topic
 * keeps its teaser title as before.
 */
export function sajuRecordTitle(chapter: SajuChapter, topicsOpen: boolean): string {
  if (!chapter.topic && !topicsOpen) return chapter.title || "나의 사주";
  return `${topicLabel(chapter.topic ?? "overall")} · ${formatBirthDate(chapter.birth)}`;
}

/** The chapter screen's eyebrow: "사주 재물운 · 10월 2일"; 전체 흐름 and older records "사주 기록 · 10월 2일". */
export function sajuChapterEyebrow(chapter: SajuChapter): string {
  const date = kstMonthDay(chapter.createdAt);
  return chapter.topic ? `사주 ${topicLabel(chapter.topic)} · ${date}` : `사주 기록 · ${date}`;
}

/** Where a 돌아보기 comes from, on the home: "10월 2일 사주 · 재물운" ("10월 2일 타로", "10월 2일 사주"). */
export function checkinSource(chapter: StoredChapter): string {
  const date = kstMonthDay(chapter.createdAt);
  if (chapter.kind === "tarot") return `${date} 타로`;
  if (isPremiumChapter(chapter)) return `${date} ${PREMIUM[chapter.kind].name}`;
  return chapter.topic ? `${date} 사주 · ${topicLabel(chapter.topic)}` : `${date} 사주`;
}

/**
 * Up to 3 recent readings as the `history` field (server caps: question 60, verdict 80, observation 120).
 * A saju request passes its topic (spec §7.8): a topic gets only its own topic's saju records, 전체 흐름
 * gets tarot and the saju records without a topic; a tarot request passes nothing and gets every record.
 * Premium readings are never sent (P5 spec default 17).
 */
export function historyFor(chapters: readonly StoredChapter[], opts: { topic?: SajuTopic } = {}): HistoryItem[] {
  const { topic } = opts;
  const fits = (chapter: StoredChapter): chapter is TarotChapter | SajuChapter => {
    if (isPremiumChapter(chapter)) return false;
    if (topic === undefined) return true;
    if (topic === "overall") return chapter.kind === "tarot" || !chapter.topic;
    return chapter.kind === "saju" && chapter.topic === topic;
  };
  return newestFirst(chapters)
    .filter(fits)
    .slice(0, HISTORY_MAX)
    .map((chapter) => {
      const line = recordLine(chapter);
      const observation = observationOf(chapter);
      return {
        date: kstDate(chapter.createdAt),
        kind: chapter.kind,
        question: clip(line.question, CAP.question),
        verdict: clip(line.verdict, CAP.verdict),
        ...(observation ? { observation: clip(observation, CAP.observation) } : {}),
        ...(chapter.checkin ? { checkin: chapter.checkin.answer } : {}),
        ...(chapter.kind === "saju" && chapter.topic ? { topic: chapter.topic } : {}),
      };
    })
    .filter((item) => item.question && item.verdict);
}
