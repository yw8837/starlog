import type { Orientation, TemplateId } from "@starlog/core";

/**
 * The reading API's bodies as the browser reads them (route handlers under app/api). Fields the
 * server has added or dropped over time are optional here, so readings saved on this device by an
 * older version still open: `observation` is new, `story` is no longer written.
 */

export interface Section {
  heading: string;
  body: string;
}

export interface DrawnCardData {
  position: string;
  cardId: string;
  orientation: Orientation;
}

export interface DrawResponse {
  cards: DrawnCardData[];
  drawToken: string;
}

export interface TarotTeaserData {
  cards: Array<{ position: string; cardId: string; keyword: string }>;
  firstCard: Section;
  lockedToc: string[];
}

export interface TarotReadingData {
  verdict: string;
  cards: Array<{ position: string; cardId: string; heading: string; body: string }>;
  connection: Section;
  timing: Section;
  /** Something the user can check in the next days (돌아보기). */
  observation?: Section;
  scenarios: { heading: string; items: Array<{ label: string; body: string }> };
  messages: { heading: string; items: string[]; hint: string };
  avoid: { heading: string; items: string[] };
  alternatives: Section;
  action: Section;
  /** Only in readings saved before the story block was dropped; never shown. */
  story?: { title: string; body: string };
  followUps?: string[];
}

export interface TarotReadingResponse {
  reading: TarotReadingData;
  chapterToken: string;
  /** The account copy's id, when the reading was saved to the account. */
  readingId?: string;
}

export interface SajuTeaserData {
  title: string;
  summary: string;
  lockedToc: string[];
}

export interface SajuReadingData {
  sections: Section[];
  observation?: Section;
  story?: { title: string; body: string };
  followUps?: string[];
}

export interface SajuReadingResponse {
  reading: SajuReadingData;
  chapterToken: string;
  /** The account copy's id, when the reading was saved to the account. */
  readingId?: string;
}

export interface DailyData {
  card: { cardId: string; orientation: Orientation; keyword: string };
  /** The fortune-cookie line (30 characters or fewer). */
  summary: string;
  body: string;
  areas: { love: string; money: string; work: string };
  lucky: { color: string; number: number };
  tip: string;
  /** Which of the three face-down cards was picked (null for a fortune stored before the pick). */
  pick?: number | null;
}

/** GET /api/tarot/daily before today's pick: three face-down cards, nothing about their faces. */
export interface DailyDeal {
  deal: Array<{ index: number }>;
}

export interface FollowUpData {
  kind: string;
  answer: string;
  chapterToken: string;
  remaining: number;
}

/** 돌아보기 answers, sent back as they are shown. */
export const CHECKIN_ANSWERS = ["맞았어요", "아직이에요", "다르게 흘렀어요"] as const;
export type CheckinAnswer = (typeof CHECKIN_ANSWERS)[number];

/** A short summary of a past reading on this device, sent with a new one (`history`). */
export interface HistoryItem {
  /** KST date, YYYY-MM-DD */
  date: string;
  kind: "tarot" | "saju";
  question: string;
  verdict: string;
  observation?: string;
  checkin?: CheckinAnswer;
}

/** `input` of /api/tarot/teaser and /api/tarot/reading. */
export interface TarotInput {
  /** A chip topic id, or "custom" with `topicText`. */
  topicId: string;
  whoId?: string;
  whenId?: string;
  question: string;
  conditions: Array<{ label: string; value: string }>;
  note?: string;
  topicText?: string;
  whoText?: string;
  whenText?: string;
  history?: HistoryItem[];
}

export interface TarotRequest {
  drawToken: string;
  input: TarotInput;
}

/** Spreads the draw endpoint deals (오늘의 한 장 has its own route). */
export type DrawTemplateId = Exclude<TemplateId, "daily">;

export type LoveStatus = "single" | "dating" | "engaged" | "married" | "fresh-start" | "unsure";
export type WorkStatus = "student" | "employee" | "self-employed" | "between-jobs" | "unsure";

/** 주제별 사주 (saju-topics spec §6.1): 전체 흐름 is today's reading; the other four read one area. */
export type SajuTopic = "overall" | "love" | "reunion" | "money" | "career";
export type SajuTopicId = Exclude<SajuTopic, "overall">;
/** Situation chip ids; each belongs to one topic (lib/sajuTopics.ts SITUATIONS). */
export type SajuSituationId =
  | "long-single" | "some" | "cooling" | "marriage"
  | "missing" | "no-contact" | "torn" | "fresh-breakup"
  | "leaking" | "worry" | "side-income"
  | "job-hunt" | "move" | "people" | "exam";

/** What the saju form adds beside the birth data (all optional). The saju side takes no free text. */
export interface SajuContext {
  loveStatus?: LoveStatus;
  workStatus?: WorkStatus;
}
