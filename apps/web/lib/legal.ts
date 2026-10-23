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

/**
 * 개인정보처리방침 revision announced 2026-10-21, in force 7 days later (the policy promises 7 days' notice; owner
 * 2026-10-17's 지금 공지, 7일 뒤 시행): a share's copy and link are deleted 180 days after the share (SHARE-3), and the
 * follow-up count is kept 8 days for a standard reading, 31 for a premium one (it was written as 8 for all). Before this KST
 * midnight the policy keeps its old lines and shows the new ones as 개정 예정 on top; from it, in the text, with no deploy.
 * Nothing is deleted for age before 2027-04-11 anyway (180 days after the first share, 2026-10-13).
 */
export const PRIVACY_REVISION_DATE = "2026-10-28";
const PRIVACY_REVISION_AT = Date.parse(`${PRIVACY_REVISION_DATE}T00:00:00+09:00`);

export const privacyRevisionInForce = (now: number = Date.now()): boolean => now >= PRIVACY_REVISION_AT;

/**
 * A second 개인정보처리방침 revision, apart from the one above: Google Analytics for visitors who allow it (owner's call
 * "동의 받고 켜기"), announced 2026-10-22, in force 7 days after the notice (review: the 10/28 date left the GA notice
 * short of 7 days). Before this KST midnight there is no consent banner and no GA, and the policy shows the addition as
 * 개정 예정; from it, the text has it and the browser asks (components/seo/ConsentBanner.tsx), by the browser's clock.
 */
export const GA_REVISION_DATE = "2026-10-30";
const GA_REVISION_AT = Date.parse(`${GA_REVISION_DATE}T00:00:00+09:00`);

export const gaRevisionInForce = (now: number = Date.now()): boolean => now >= GA_REVISION_AT;

/**
 * A third 개인정보처리방침 revision, account sync (owner 2026-10-23 "웹이랑 모바일에서 각각 로그인하면 내결과가 공유안됨"):
 * a reading opened while logged in is kept in the account whatever opened it (오픈 기념 무료 too), and a reading a device kept
 * moves into the account when its user asks. Both widen what the account keeps, and the policy promises 7 days' notice
 * (as GA, consent-based too, waited for its date): before this KST midnight neither happens (the reading route and
 * /api/readings/move check it, and the screens offer nothing) and the policy shows both as 개정 예정; from it, in the
 * text, with no deploy. 7 days from a deploy on 10/24 at the latest; a later deploy moves this date.
 */
export const SYNC_REVISION_DATE = "2026-10-31";
const SYNC_REVISION_AT = Date.parse(`${SYNC_REVISION_DATE}T00:00:00+09:00`);

export const syncRevisionInForce = (now: number = Date.now()): boolean => now >= SYNC_REVISION_AT;

/** The 시행일 the privacy policy shows at `now` (the terms and the refund policy keep legalEffectiveDate). */
export const privacyEffectiveDate = (now: number = Date.now()): string =>
  syncRevisionInForce(now)
    ? SYNC_REVISION_DATE
    : gaRevisionInForce(now)
      ? GA_REVISION_DATE
      : privacyRevisionInForce(now)
        ? PRIVACY_REVISION_DATE
        : legalEffectiveDate(now);

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
