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
     * Premium readings, listed on /pricing as 준비 중 until each opens (`open: true`). The 10-card
     * spread is never named after its tradition in the UI.
     */
    premium: [
      { id: "tarot-deep", name: "심층 타로", sub: "카드 10장으로 깊게 보는 흐름", krw: 5900, open: false, opens: "" },
      { id: "match", name: "우리 사이 궁합", sub: "사주와 타로로 함께 보는 두 사람", krw: 9900, open: false, opens: "" },
      { id: "newyear-2027", name: "2027 신년운세", sub: "사주로 미리 보는 2027년 한 해", krw: 9900, open: false, opens: "11월 중순 오픈 예정" },
    ],
  },
  reading: {
    /** Follow-up questions included with every opened reading. */
    followUps: 3,
    /**
     * Approximate length of a full reading in characters, shown before it is opened. Measured on
     * real outputs (Opus 5.5 smoke runs, 2026-09-30): tarot about 2,000, saju about 3,000.
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
