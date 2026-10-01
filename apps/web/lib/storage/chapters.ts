import type { Orientation } from "@starlog/core";
import { SITE } from "@/lib/config";
import { kstDate, kstDaysBetween } from "@/lib/kst";
import { CHECKIN_ANSWERS, type CheckinAnswer, type HistoryItem, type SajuContext, type SajuReadingData, type TarotReadingData } from "@/lib/reading/types";
import { sanitizeSajuContext } from "@/lib/sajuFlow";
import { sanitizeSajuForm, type SajuForm } from "@/lib/sajuForm";
import { createLocalStore } from "@/lib/sessionStore";

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
  /** The status chips and concern it was written with (so the same input is not opened twice). */
  context?: SajuContext;
  reading: SajuReadingData;
}

export type StoredChapter = TarotChapter | SajuChapter;

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
  if (value.kind === "saju") {
    const birth = sanitizeSajuForm(value.birth);
    if (!birth || !Array.isArray(reading.sections) || !reading.sections.every(isSection)) return null;
    const context = sanitizeSajuContext(value.context);
    return {
      ...base,
      kind: "saju",
      birth,
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
  const chapter = { ...input, id: newId(), createdAt: now, turns: [], followUpsLeft: SITE.reading.followUps } as StoredChapter;
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

/** True when this device holds an entry with this id, readable or not (a broken one can be erased). */
export const hasChapterEntry = (id: string) => rawEntries().some((entry) => idOf(entry) === id);

export function deleteChapter(id: string) {
  store.save({ v: 1, chapters: rawEntries().filter((entry) => idOf(entry) !== id) });
}

export function clearChapters() {
  store.clear();
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

/** What a record says in one line: the question and the short answer. */
export function recordLine(chapter: StoredChapter): { question: string; verdict: string } {
  if (chapter.kind === "tarot") return { question: chapter.question, verdict: chapter.reading.verdict };
  return { question: chapter.title ? `사주 · ${chapter.title}` : "사주", verdict: chapter.summary };
}

/** Up to 3 recent readings as the `history` field (server caps: question 60, verdict 80, observation 120). */
export function historyFor(chapters: readonly StoredChapter[]): HistoryItem[] {
  return newestFirst(chapters)
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
      };
    })
    .filter((item) => item.question && item.verdict);
}
