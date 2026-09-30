import type { Orientation } from "@starlog/core";
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

/** Follow-up questions a fresh reading comes with (SITE.reading.followUps; the server enforces it). */
const FOLLOW_UPS = 3;

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

const parseChapters = (value: unknown): StoredChapter[] | null =>
  Array.isArray(value) ? value.map(parseChapter).filter((c): c is StoredChapter => c !== null) : null;

const store = createLocalStore<StoredChapter[]>(CHAPTERS_KEY, parseChapters);

function newId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 36).toString(36)).join("");
}

export function listChapters(): StoredChapter[] {
  return store.read() ?? [];
}

export function getChapter(id: string): StoredChapter | undefined {
  return listChapters().find((chapter) => chapter.id === id);
}

/** Stores a freshly opened reading with the day's follow-up allowance; returns it with its new id. */
export function saveChapter(input: NewChapter, now: number = Date.now()): StoredChapter {
  const chapter = { ...input, id: newId(), createdAt: now, turns: [], followUpsLeft: FOLLOW_UPS } as StoredChapter;
  store.save([...listChapters(), chapter]);
  return chapter;
}

export function updateChapter(id: string, update: (chapter: StoredChapter) => StoredChapter) {
  store.save(listChapters().map((chapter) => (chapter.id === id ? update(chapter) : chapter)));
}

export function deleteChapter(id: string) {
  store.save(listChapters().filter((chapter) => chapter.id !== id));
}

export function clearChapters() {
  store.clear();
}

/** Every stored chapter, oldest first: undefined before hydration. */
export function useChapters(): StoredChapter[] | undefined {
  const value = store.useValue();
  return value === undefined ? undefined : (value ?? []);
}

/** Newest first, for 내 기록 and the home. */
export const newestFirst = (chapters: readonly StoredChapter[]) => [...chapters].sort((a, b) => b.createdAt - a.createdAt);

// ---- 돌아보기 ----

/** Days after a reading before its observation is asked about (and again after 아직이에요). */
export const CHECKIN_AFTER_DAYS = 3;

/** The observation to look back on, when the reading has one (newer readings only). */
export const observationOf = (chapter: StoredChapter): string | undefined => chapter.reading.observation?.body.trim() || undefined;

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
