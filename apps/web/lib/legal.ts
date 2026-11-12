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

/**
 * The terms' revision on the same date (owner 2026-10-23: the AI notice stays in the terms only, and results are always
 * shareable, 오픈 기념 무료 too): before this KST midnight the terms keep their old lines and show the new ones as 개정 예정;
 * from it, in the text, with no deploy. The refund policy keeps legalEffectiveDate.
 */
export const termsEffectiveDate = (now: number = Date.now()): string => (syncRevisionInForce(now) ? SYNC_REVISION_DATE : legalEffectiveDate(now));

/**
 * 오픈 기념 무료 per account (owner 2026-10-27 "계정 위주로", "이벤트 기간 11월 한 달로 해"): from this day it opens for a
 * logged-in account once (and once per device), until 2026-11-30, where it was once per device until 10/31. A less
 * favourable change made before the 30 days' notice the terms promise (the owner accepted it), so the terms say what
 * changed, dated, at their top while the event runs (app/terms); so does the privacy policy for the claim record it adds
 * as a member item (app/privacy). The day this went live, for both: move it if the deploy goes out on another day.
 */
export const OPENING_ACCOUNT_DATE = "2026-10-27";

/** The claim record kept through an account deletion until the event ends (owner 2026-10-28), said with the notice above. */
export const OPENING_RETENTION_DATE = "2026-10-28";

/**
 * Every AI reading result needs a login (owner 2026-11-04, final): the tarot and saju 맛보기 and 오늘의 한 장 are no longer
 * open to a visitor, the 맛보기 are counted per account on the server, and 오늘의 한 장 is kept per account. Less favourable
 * to a visitor and in force from the deploy, before the 30 days' notice the terms promise (제3조) and the 7 days the privacy
 * policy promises, so, as with OPENING_ACCOUNT_DATE, both say what changed, dated, at their top: for 30 days from this day.
 * The day this went live: move it (and the end with it) if the deploy goes out on another day. The 시행일 shown stays.
 */
export const LOGIN_RULE_DATE = "2026-11-05";
const LOGIN_RULE_NOTICE_UNTIL_AT = Date.parse(`${LOGIN_RULE_DATE}T00:00:00+09:00`) + 30 * 24 * 60 * 60 * 1000;

export const loginRuleNoticeShown = (now: number = Date.now()): boolean => now < LOGIN_RULE_NOTICE_UNTIL_AT;

/**
 * What a device keeps of AI readings, and a friend's 별자리 인연 result after its own screen, shows only with a session (owner
 * 2026-11-05: hidden, not deleted). Said on top of the terms and the privacy policy for 30 days from this day, as with
 * LOGIN_RULE_DATE. The day this goes live: move it (and the end with it) if the deploy goes out on another day.
 */
export const KEPT_RULE_DATE = "2026-11-06";
const KEPT_RULE_NOTICE_UNTIL_AT = Date.parse(`${KEPT_RULE_DATE}T00:00:00+09:00`) + 30 * 24 * 60 * 60 * 1000;

export const keptRuleNoticeShown = (now: number = Date.now()): boolean => now < KEPT_RULE_NOTICE_UNTIL_AT;

/**
 * A friend logs in to join 별자리 인연 (owner 2026-11-10): an invited friend joined without one until now. The star is then
 * kept under a value made from the account, not the device. Less favourable to a visitor and in force from the deploy, before
 * the 30 days' notice the terms promise and the 7 days the privacy policy promises, so, as with LOGIN_RULE_DATE, both say
 * what changed, dated, at their top for 30 days from this day. The day this goes live: move it (and the end with it) if the
 * deploy goes out on another day.
 */
export const BOND_LOGIN_DATE = "2026-11-11";
const BOND_LOGIN_NOTICE_UNTIL_AT = Date.parse(`${BOND_LOGIN_DATE}T00:00:00+09:00`) + 30 * 24 * 60 * 60 * 1000;

export const bondLoginNoticeShown = (now: number = Date.now()): boolean => now < BOND_LOGIN_NOTICE_UNTIL_AT;

/**
 * The Android app (owner 2026-11-13, apps/android/store/wording-proposals.md items 1–15 as written): Google Play 결제와 환불 in
 * the terms and the refund policy, how a set paid with Google Play has its part refunded (문의), and in the privacy policy Google
 * Play and AdMob as processors, the app's ads and 풀이 신고 (kept 1 year). In force from the deploy, before the notice the terms
 * and the privacy policy promise, so, as with LOGIN_RULE_DATE, the three say what changed, dated, at their top for 30 days from
 * this day. The 시행일 shown stays. The day this goes live: move it (and the end with it) if the deploy goes out on another day.
 */
export const APP_REVISION_DATE = "2026-11-13";
const APP_REVISION_NOTICE_UNTIL_AT = Date.parse(`${APP_REVISION_DATE}T00:00:00+09:00`) + 30 * 24 * 60 * 60 * 1000;

export const appRevisionNoticeShown = (now: number = Date.now()): boolean => now < APP_REVISION_NOTICE_UNTIL_AT;

/**
 * The 개인정보처리방침 revision that adds the Meta pixel (owner 2026-11-10 "동의한 방문자만"): the consent banner names Meta
 * and the pixel loads for a visitor who allowed it from this KST midnight, 7 days after the notice the policy promises
 * (as GA_REVISION_DATE). Before it the policy shows it as 바뀌는 내용; from it, as 바뀐 내용 for 30 days. Only where a pixel
 * id is built in (lib/metaPixel.ts): without one nothing here shows. A later deploy moves this date.
 */
export const META_REVISION_DATE = "2026-11-17";
const META_REVISION_AT = Date.parse(`${META_REVISION_DATE}T00:00:00+09:00`);
const META_NOTICE_UNTIL_AT = META_REVISION_AT + 30 * 24 * 60 * 60 * 1000;

export const metaRevisionInForce = (now: number = Date.now()): boolean => now >= META_REVISION_AT;
export const metaNoticeShown = (now: number = Date.now()): boolean => now < META_NOTICE_UNTIL_AT;

/**
 * The 2027 신년운세 + 프리미엄 궁합 set (owner 2026-11-10): on sale from this KST midnight (it takes 오픈 기념 무료's place),
 * refunded whole within REFUND_DAYS only while neither reading was opened, and not at all once either was. It concerns the
 * new set only (each reading bought apart keeps its rule). The terms and the refund policy say so on top from the deploy
 * until 30 days after this day (바뀌는 내용 before it, 바뀐 내용 from it), and from it in their premium part, with no deploy.
 * The 시행일 shown stays.
 */
export const SET_RULE_DATE = "2026-12-01";
const SET_RULE_AT = Date.parse(`${SET_RULE_DATE}T00:00:00+09:00`);
const SET_RULE_NOTICE_UNTIL_AT = SET_RULE_AT + 30 * 24 * 60 * 60 * 1000;

export const setRuleInForce = (now: number = Date.now()): boolean => now >= SET_RULE_AT;
export const setRuleNoticeShown = (now: number = Date.now()): boolean => now < SET_RULE_NOTICE_UNTIL_AT;

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
