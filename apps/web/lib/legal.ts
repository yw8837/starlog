import { SITE } from "./config";

/** 시행일 shared by the terms, privacy and refund pages. */
export const LEGAL_EFFECTIVE_DATE = "2026-10-15";

/**
 * The premium clauses: in force from 2026-10-20 00:00 KST, when every premium reading went on sale (owner 2026-10-20 "전부
 * 오픈해"). Before this KST midnight a policy keeps its old text and 시행일 and shows the clauses as 개정 예정 under a
 * notice; from it the pages (rendered per request) put them in the text and show this 시행일, with no deploy (owner
 * 2026-10-17's mechanism, premiumSchedule.test.tsx).
 */
export const PREMIUM_LEGAL_EFFECTIVE_DATE = "2026-10-20";
const PREMIUM_LEGAL_EFFECTIVE_AT = Date.parse(`${PREMIUM_LEGAL_EFFECTIVE_DATE}T00:00:00+09:00`);

export const premiumLegalInForce = (now: number = Date.now()): boolean => now >= PREMIUM_LEGAL_EFFECTIVE_AT;

/**
 * Sales opened the day the premium clauses came in force, before a 7-day notice could run (review 2026-10-20 A1): each
 * policy shows what changed on 2026-10-20 on top for 7 days, until this KST midnight (exclusive), by code.
 */
export const PREMIUM_CHANGE_NOTICE_UNTIL = "2026-10-27";
const PREMIUM_CHANGE_NOTICE_UNTIL_AT = Date.parse(`${PREMIUM_CHANGE_NOTICE_UNTIL}T00:00:00+09:00`);

export const premiumChangeNoticeShown = (now: number = Date.now()): boolean => premiumLegalInForce(now) && now < PREMIUM_CHANGE_NOTICE_UNTIL_AT;

/** The 시행일 a policy shows at `now`. */
export const legalEffectiveDate = (now: number = Date.now()): string => (premiumLegalInForce(now) ? PREMIUM_LEGAL_EFFECTIVE_DATE : LEGAL_EFFECTIVE_DATE);

/** "2026년 10월 1일" */
export function koreanDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return `${year}년 ${month}월 ${day}일`;
}

/** Footer's second row, in order. 개인정보처리방침 is set apart visually, as Korean sites customarily do. */
export const LEGAL_LINKS = [
  { href: "/pricing", label: "가격 안내" },
  { href: "/terms", label: "이용약관" },
  { href: "/privacy", label: "개인정보처리방침", emphasis: true },
  { href: "/refund", label: "환불 정책" },
] as const;

type Business = Readonly<Record<keyof (typeof SITE)["business"], string>>;

/** Filled contact channels only, as [label, value]; empty until the owner sets them in SITE. */
export function contactChannels(business: Business = SITE.business): Array<readonly [string, string]> {
  const channels: Array<readonly [string, string]> = [];
  const email = business.email.trim();
  const phone = business.phone.trim();
  if (email) channels.push(["이메일", email]);
  if (phone) channels.push(["전화", phone]);
  return channels;
}
