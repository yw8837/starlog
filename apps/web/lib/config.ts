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
} as const;

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
