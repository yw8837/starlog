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
  business: {
    name: "열매스튜디오",
    ceo: "최용우",
    regNo: "665-38-01736",
    mailOrderNo: "2026-부산영도-0153",
    address: "부산광역시 영도구 동삼서로 51-7, 3층 302호(동삼동, 금관빌리지)",
    email: "studioyeolmae.com@gmail.com",
    phone: "010-8282-8837",
  },
  currency: { paid: "달빛", free: "별조각" },
  price: {
    tarotStandardKrw: 2900,
    sajuStandardKrw: 2900,
    unitsPerReading: 10,
    signupGiftFree: 10,
    /**
     * Premium readings (P5). Sales open with STARLOG_PREMIUM (lib/premium/flags.ts) and, for a dated
     * product, inside [opensAt, closesAt) (KST ISO, "" when undated). The 10-card spread is never
     * named after its tradition in the UI.
     */
    premium: [
      { id: "tarot-deep", slug: "deep-tarot", name: "심층 타로", sub: "카드 10장으로 깊게 보는 흐름", krw: 7900, opens: "", opensAt: "", closesAt: "" },
      { id: "match", slug: "match", name: "우리 사이 궁합", sub: "사주와 타로로 함께 보는 두 사람", krw: 7900, opens: "", opensAt: "", closesAt: "" },
      {
        id: "newyear-2027", slug: "newyear-2027", name: "2027 신년운세", sub: "사주로 미리 보는 2027년 한 해", krw: 7900,
        opens: "11월 중순 오픈 예정", opensAt: "2026-11-15T00:00:00+09:00", closesAt: "2027-12-01T00:00:00+09:00",
      },
    ],
  },
  reading: {
    /** Follow-up questions included with every opened reading. */
    followUps: 3,
    /**
     * Approximate length of a full reading in characters, shown before it is opened. Measured on
     * real outputs (smoke runs, 2026-09-30): tarot about 2,000, saju about 3,000.
     */
    approxChars: { tarot: 2000, saju: 3000 },
  },
  /** Public beta: every reading is free within a daily count (the server's BETA_FULL_PER_DAY). */
  beta: {
    fullPerDay: 1,
    teaserPerDay: 5,
  },
  features: {
    /** 달빛/별조각 balances and packs. Off in the beta (no payments yet); the wallet UI stays hidden. */
    payments: false,
    /**
     * 별자리 인연 (/bonds, /ranking, /b, /api/bonds and the home row). On in dev and tests; a production
     * build turns it on with NEXT_PUBLIC_FEATURE_BONDS=1 at build time, after the D1 migration is applied.
     */
    bonds: process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_FEATURE_BONDS === "1",
    /** 주제별 사주 (NEXT_PUBLIC_SAJU_TOPICS): this build's mode; screens and the server call sajuTopicsMode(). */
    sajuTopics: sajuTopicsMode(),
  },
  /**
   * 달빛 top-up packs. Provisional: every pack must make one reading (unitsPerReading 달빛)
   * cheaper than direct pay, per spec §5 (checked in fixtures.test.ts). Real prices are set
   * after measuring generation cost and conversion.
   */
  moonPacks: [
    { units: 30, bonus: 0, krw: 8500 },
    { units: 60, bonus: 6, krw: 16900 },
    { units: 100, bonus: 20, krw: 27000 },
  ],
} as const;

export type MoonPack = (typeof SITE)["moonPacks"][number];

/** "2,900원" */
export const won = (krw: number) => `${new Intl.NumberFormat("ko-KR").format(krw)}원`;

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
