import { BRANCHES, BRANCHES_KO, STEMS, STEMS_KO } from "@starlog/core";
import { checkSajuForm, todayInKorea, type Calendar, type CivilDay } from "./sajuForm";

/**
 * 2027년 나의 키워드 (free test ②): a birth date gives the 일주 (the day pillar, one of 60), and each 일주 has one
 * page at /2027-keyword/<slug>. The date is used in the browser only: it never reaches a URL, a query, the server's
 * storage or analytics; the form navigates by the slug. Client-safe and light: the words and the 2027 mapping table
 * live in keyword2027Content.ts, which only the server pages and the share image read.
 */

export const KEYWORD_PATH = "/2027-keyword";
export const KEYWORD_TITLE = "2027년 나의 키워드";

export type Stem = (typeof STEMS)[number];
export type Branch = (typeof BRANCHES)[number];

export interface Ilju {
  /** "甲子" */
  hanja: string;
  /** "갑자" */
  ko: string;
  /** "gap-ja": the stem and the branch in the Revised Romanization, joined by a hyphen */
  slug: string;
  stem: Stem;
  branch: Branch;
}

const STEM_ROMAN = ["gap", "eul", "byeong", "jeong", "mu", "gi", "gyeong", "sin", "im", "gye"] as const;
const BRANCH_ROMAN = ["ja", "chuk", "in", "myo", "jin", "sa", "o", "mi", "sin", "yu", "sul", "hae"] as const;

/** The 60 일주 in the order of the cycle, 甲子 first. 辛 and 申 are both "sin", but no 일주 pairs them (辛申 is not one). */
export const ILJU: readonly Ilju[] = Object.freeze(
  Array.from({ length: 60 }, (_, n): Ilju => {
    const s = n % 10;
    const b = n % 12;
    return { hanja: STEMS[s]! + BRANCHES[b]!, ko: STEMS_KO[s]! + BRANCHES_KO[b]!, slug: `${STEM_ROMAN[s]}-${BRANCH_ROMAN[b]}`, stem: STEMS[s]!, branch: BRANCHES[b]! };
  }),
);

export const iljuBySlug = (slug: string): Ilju | null => ILJU.find((ilju) => ilju.slug === slug) ?? null;
export const iljuByHanja = (hanja: string): Ilju | null => ILJU.find((ilju) => ilju.hanja === hanja) ?? null;
export const keywordPath = (ilju: Ilju): string => `${KEYWORD_PATH}/${ilju.slug}`;
/** The 일주's share image (app/api/og/keyword/[ilju]/route.tsx), 1200×630. */
export const keywordImagePath = (ilju: Ilju): string => `/api/og/keyword/${ilju.slug}`;

/** A birth date as the form holds it once every part is picked (components/bonds/BirthFields). */
export interface KeywordBirth {
  calendar: Calendar;
  year: number;
  month: number;
  day: number;
  isLeapMonth: boolean;
}

/**
 * The 일주 of a birth date, by the saju form's own check and engine with the time unknown, born in 서울 (the date-only
 * basis of 별자리 인연, lib/bonds): the 일주 is the civil date's (P6), whatever the hour. A birth in the first half hour
 * after midnight reads as the day before on the corrected clock; the form page says so, and the saju chart names it.
 */
export function iljuOfBirth(birth: KeywordBirth, today: CivilDay = todayInKorea()): { ilju: Ilju } | { error: string } {
  const checked = checkSajuForm(
    {
      calendar: birth.calendar, year: birth.year, month: birth.month, day: birth.day, isLeapMonth: birth.calendar === "lunar" && birth.isLeapMonth,
      timeKnown: false, hour: null, minute: null, gender: "female", placeId: "seoul",
    },
    today,
  );
  if ("error" in checked) return { error: checked.error.message };
  const { stem, branch } = checked.chart.pillars.day;
  const ilju = iljuByHanja(stem + branch);
  return ilju ? { ilju } : { error: "생년월일을 다시 확인해 주세요." };
}
