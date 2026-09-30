export const SITE = {
  name: "Starlog",
  nameKo: "스타로그",
  url: "https://taro.yeolmaeapps.kr",
  business: {
    name: "열매스튜디오",
    ceo: "최용우",
    regNo: "665-38-01736",
    mailOrderNo: "",
    address: "",
    email: "",
    phone: "",
  },
  currency: { paid: "달빛", free: "별조각" },
  price: {
    tarotStandardKrw: 2900,
    sajuStandardKrw: 2900,
    unitsPerReading: 10,
    signupGiftFree: 10,
  },
  reading: {
    /** Follow-up questions included with every opened reading. */
    followUps: 3,
  },
  /** 달빛 top-up packs (placeholder values; set with real pricing before launch). */
  moonPacks: [
    { units: 30, bonus: 0, krw: 9900 },
    { units: 60, bonus: 6, krw: 19800 },
    { units: 90, bonus: 12, krw: 29700 },
  ],
} as const;

export type MoonPack = (typeof SITE)["moonPacks"][number];

/** "2,900원" */
export const won = (krw: number) => `${new Intl.NumberFormat("ko-KR").format(krw)}원`;

type Business = Readonly<Record<keyof (typeof SITE)["business"], string>>;

/**
 * Footer business notice, in display order. The postal address is deliberately
 * absent: the footer must never render one, whatever the config holds.
 */
const FOOTER_FIELDS = [
  ["상호", "name"],
  ["대표", "ceo"],
  ["사업자등록번호", "regNo"],
  ["통신판매업 신고번호", "mailOrderNo"],
  ["이메일", "email"],
  ["전화", "phone"],
] as const satisfies ReadonlyArray<readonly [string, keyof Business]>;

/** "상호 열매스튜디오" style entries for every non-empty footer field. */
export function footerNotice(business: Business = SITE.business): string[] {
  return FOOTER_FIELDS.flatMap(([label, key]) => {
    const value = business[key].trim();
    return value ? [`${label} ${value}`] : [];
  });
}
