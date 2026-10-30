import { kstDate, kstMonthDay } from "./kst";

/**
 * 주제별 사주 (saju-topics spec §13, owner cut §0): `off` hides the row "다른 운도 볼 수 있어요" and the
 * server refuses topic requests; `owner` shows the row only on the owner pass's device and the server
 * serves only the owner pass; `on` is everyone. Korean screens only.
 */
export type SajuTopicsMode = "off" | "owner" | "on";

/**
 * NEXT_PUBLIC_SAJU_TOPICS: inlined into the screens at build time; the server reads the same value on
 * every request. Empty or unknown: on in dev and tests, off in production (like 별자리 인연).
 */
export function sajuTopicsMode(raw: string | undefined = process.env.NEXT_PUBLIC_SAJU_TOPICS, production = process.env.NODE_ENV === "production"): SajuTopicsMode {
  const value = raw?.trim().toLowerCase();
  if (value === "off" || value === "owner" || value === "on") return value;
  return production ? "off" : "on";
}

export const SITE = {
  name: "Starlog",
  nameKo: "스타로그",
  url: "https://starlog.yeolmaeapps.kr",
  /** The guides (/guide/*) live on the root domain, where AdSense is approved (lib/hosts.ts, lib/hostRoutes.ts). */
  guideUrl: "https://yeolmaeapps.kr",
  business: {
    name: "열매스튜디오",
    ceo: "최용우",
    regNo: "665-38-01736",
    mailOrderNo: "2026-부산영도-0153",
    address: "부산광역시 영도구 동삼서로 51-7, 3층 302호(동삼동, 금관빌리지)",
    email: "studioyeolmae.com@gmail.com",
    phone: "010-8282-8837",
    /** 전자상거래법 제10조 제1항, 시행령 제11조의4: who hosts the site (the Worker runs on Cloudflare). */
    hosting: "Cloudflare, Inc.",
  },
  /** One payment opens one reading. New accounts get no signup gift any more (owner 2026-10-14 evening). */
  price: {
    tarotStandardKrw: 2900,
    sajuStandardKrw: 4900,
    /**
     * Premium readings (P5). Sales open with STARLOG_PREMIUM (lib/premium/flags.ts) and, for a dated
     * product, inside [opensAt, closesAt) (KST ISO, "" when undated; all three on sale from 2026-10-20 with no opening date,
     * owner 2026-10-20 "전부 오픈해, 2027 신년운세도 바로 되게"; 2027 신년운세 still closes at 2027-12-01). One name per product on every screen,
     * checkout and receipt (owner 2026-10-17); the model never sees it (lib/premium/promptNames.test.ts), and the
     * reading names the 10-card spread's positions only (validatePremium.ts).
     */
    premium: [
      { id: "tarot-deep", slug: "deep-tarot", name: "켈틱 크로스 10장", sub: "카드 10장으로 깊게 보는 흐름", krw: 7900, opens: "", opensAt: "", closesAt: "" },
      { id: "match", slug: "match", name: "프리미엄 궁합", sub: "두 사람의 사주로 보는 관계와 앞으로 1년", krw: 7900, opens: "", opensAt: "", closesAt: "" },
      {
        id: "newyear-2027", slug: "newyear-2027", name: "2027 신년운세", sub: "사주로 미리 보는 2027년 한 해", krw: 14900,
        opens: "", opensAt: "", closesAt: "2027-12-01T00:00:00+09:00",
      },
    ],
  },
  reading: {
    /** Follow-up questions included with every opened reading. */
    followUps: 3,
    /**
     * Approximate length of a full reading in characters (without spaces), shown before it is opened as one number or a
     * range (approxCharsText). Tarot: the readings fell to 1,400–1,600 (a tester's 1,418 read as short, 2026-10-30); the prompt
     * now asks 2,000–2,600 and real outputs measured 1,700–1,950 (5 smoke runs, 2026-10-30), so 2,000 holds. Saju is the owner's
     * range: measured 2026-10-08 on the new reading voice, 2,545 for a whole chapter (the old voice wrote 3,220).
     */
    approxChars: { tarot: { min: 2000, max: 2000 }, saju: { min: 2500, max: 3000 } },
  },
  /**
   * Free use. 오픈 기념 무료 (owner 2026-10-14 evening; per account from owner 2026-10-27): one tarot full reading free per
   * logged-in Kakao or Google account, and once per device (the server's BETA_FULL_PER_DAY, named before the rule changed),
   * until `openingEndsAt` (KST ISO, exclusive: the last free moment is 2026-11-30 23:59:59 KST, owner 2026-10-27 "이벤트 기간
   * 11월 한 달로 해"); no follow-ups, shareable since owner 2026-10-23. Saju full readings are never free. Teasers: a daily count (BETA_TEASER_PER_DAY).
   */
  beta: {
    firstFreeTarot: 1,
    openingEndsAt: "2026-12-01T00:00:00+09:00",
    teaserPerDay: 5,
  },
  features: {
    /**
     * 별자리 인연 (/bonds, /ranking, /b, /api/bonds and the home row). On in dev and tests; a production
     * build turns it on with NEXT_PUBLIC_FEATURE_BONDS=1 at build time, after the D1 migration is applied.
     */
    bonds: process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_FEATURE_BONDS === "1",
    /** 주제별 사주 (NEXT_PUBLIC_SAJU_TOPICS): this build's mode; screens and the server call sajuTopicsMode(). */
    sajuTopics: sajuTopicsMode(),
  },
} as const;

/** "2,900원" */
export const won = (krw: number) => `${new Intl.NumberFormat("ko-KR").format(krw)}원`;

/** 오픈 기념 무료 is still on at `now` (epoch ms; the server passes its request time). */
export const openingFreeOn = (now: number = Date.now()) => now < Date.parse(SITE.beta.openingEndsAt);

const OPENING_LAST_MS = Date.parse(SITE.beta.openingEndsAt) - 1;

/** The last day of 오픈 기념 무료 as screens say it: "11월 30일" (KST). */
export const OPENING_LAST_DAY = kstMonthDay(OPENING_LAST_MS);

/** The same day with its year, for the legal pages: "2026년 11월 30일". */
export const OPENING_LAST_DATE = `${kstDate(OPENING_LAST_MS).slice(0, 4)}년 ${OPENING_LAST_DAY}`;

type Business = Readonly<Record<keyof (typeof SITE)["business"], string>>;

/**
 * Footer business notice, in display order (전자상거래법 사업자 정보). The owner chose to show the
 * address on the business registration once it is filled in SITE.business.address.
 */
const FOOTER_FIELDS = [
  ["상호", "name"],
  ["대표", "ceo"],
  ["사업자등록번호", "regNo"],
  ["통신판매업 신고번호", "mailOrderNo"],
  ["사업장 주소", "address"],
  ["이메일", "email"],
  ["전화", "phone"],
  ["호스팅서비스 제공자", "hosting"],
] as const satisfies ReadonlyArray<readonly [string, keyof Business]>;

/** [label, value] for every non-empty business field, in display order. */
export function businessFields(business: Business = SITE.business): Array<readonly [string, string]> {
  return FOOTER_FIELDS.flatMap(([label, key]) => {
    const value = business[key].trim();
    return value ? [[label, value] as const] : [];
  });
}

/** "상호 열매스튜디오" style entries for every non-empty footer field. */
export function footerNotice(business: Business = SITE.business): string[] {
  return businessFields(business).map(([label, value]) => `${label} ${value}`);
}
