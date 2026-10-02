import { CRISIS_CONTACTS, CRISIS_LEAD } from "@/lib/crisis";
import type { Locale } from "./locales";

/**
 * Crisis words in every language, checked on every user text whatever the UI language (spec §7.7),
 * and the helplines shown per UI language, each with Korea's 109 for readers in Korea. Numbers outside
 * the Korean list carry their official source and the date someone checked it; re-check before launch.
 */

export const CRISIS_PATTERNS: Readonly<Record<Locale, RegExp>> = {
  ko: /죽고\s?싶|자살|자해|극단적\s?(인\s?)?선택|살기\s?싫|사라지고\s?싶/,
  en: /\b(kill(?:ing)? myself|suicid(?:e|al)|end(?:ing)? my life|want(?:ed)? to die|wanna die|self[-\s]?harm|hurt(?:ing)? myself|don'?t want to (?:live|be alive)|no reason to live)\b/i,
  ja: /死にたい|自殺|自死|自傷|リスカ|消えたい|生きていたくない|生きるのがつらい|命を絶/,
  "zh-hant": /想死|自殺|自杀|自殘|自残|輕生|轻生|不想活|活不下去|結束(?:自己的)?生命|结束(?:自己的)?生命/,
};

export const isCrisisAnyLanguage = (text: string): boolean => Object.values(CRISIS_PATTERNS).some((pattern) => pattern.test(text));

export interface Hotline {
  name: string;
  /** as dialled and shown; empty for a web directory */
  number: string;
  note?: string;
  url?: string;
  source: string;
  /** YYYY-MM-DD the source was last checked */
  checked: string;
}

/**
 * The official page for each line of lib/crisis.ts CRISIS_CONTACTS, in the same order (checked 2026-10-02).
 * The Korean numbers live only in lib/crisis.ts (owner rule); crisis.test.ts pins which page goes with which line.
 */
const KR_SOURCES: readonly string[] = [
  "https://www.129.go.kr/109",
  "https://www.mohw.go.kr/menu.es?mid=a10706040100",
  "https://www.mogef.go.kr/cc/ccy/cc_ccy_f001.do",
  "https://www.lifeline.or.kr/business/phone.php",
];
/** Korea's 24-hour suicide-prevention line (the first line of lib/crisis.ts), offered in every locale to readers in Korea. */
const KR_LINE = { number: CRISIS_CONTACTS[0]!.number, source: KR_SOURCES[0]! };
const MHLW_TEL = "https://www.mhlw.go.jp/mamorouyokokoro/soudan/tel/";

export const HOTLINES: Readonly<Record<Locale, readonly Hotline[]>> = {
  ko: CRISIS_CONTACTS.map((c, i) => ({ name: c.name, number: c.number, ...(c.note ? { note: c.note } : {}), source: KR_SOURCES[i] ?? "", checked: "2026-10-02" })),
  ja: [
    { name: "よりそいホットライン", number: "0120-279-338", note: "24時間・無料", source: MHLW_TEL, checked: "2026-10-02" },
    { name: "いのちの電話", number: "0570-783-556", note: "10時〜22時", source: MHLW_TEL, checked: "2026-10-02" },
    { name: "こころの健康相談統一ダイヤル", number: "0570-064-556", note: "受付時間は地域により異なります", source: "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/hukushi_kaigo/seikatsuhogo/jisatsu/kokoro_dial.html", checked: "2026-10-02" },
    { name: "韓国にいる場合：自殺予防相談電話", number: KR_LINE.number, note: "24時間", source: KR_LINE.source, checked: "2026-10-02" },
  ],
  "zh-hant": [
    { name: "安心專線（台灣）", number: "1925", note: "24小時", source: "https://www.mohw.gov.tw/cp-23-135-1.html", checked: "2026-10-02" },
    { name: "生命線（台灣）", number: "1995", source: "https://www.life1995.org.tw/", checked: "2026-10-02" },
    { name: "張老師（台灣）", number: "1980", source: "https://www.1980.org.tw/", checked: "2026-10-02" },
    { name: "情緒通（香港）", number: "18111", note: "24小時", source: "https://www.info.gov.hk/gia/general/202312/27/P2023122700235.htm", checked: "2026-10-02" },
    { name: "撒瑪利亞防止自殺會（香港）", number: "2389 2222", note: "24小時", source: "https://www.sbhk.org.hk/", checked: "2026-10-02" },
    { name: "在韓國時：自殺預防諮詢專線", number: KR_LINE.number, note: "24小時", source: KR_LINE.source, checked: "2026-10-02" },
  ],
  en: [
    { name: "988 Suicide & Crisis Lifeline (US)", number: "988", note: "call or text, 24/7", source: "https://988lifeline.org/", checked: "2026-10-02" },
    { name: "Samaritans (UK and Ireland)", number: "116 123", note: "24/7", source: "https://www.samaritans.org/", checked: "2026-10-02" },
    { name: "Find a helpline in your country", number: "", url: "https://findahelpline.com/", source: "https://findahelpline.com/", checked: "2026-10-02" },
    { name: "In Korea: suicide prevention line", number: KR_LINE.number, note: "24/7", source: KR_LINE.source, checked: "2026-10-02" },
  ],
};

const LEADS: Readonly<Record<Locale, string>> = {
  ko: CRISIS_LEAD,
  en: "If things feel very hard right now, please talk to a person before any reading.",
  ja: "とてもつらいときは、占いより先に、人と話してください。",
  "zh-hant": "如果現在真的很難受，請先找人聊聊，再來看解讀。",
};

export const crisisLead = (locale: Locale): string => LEADS[locale];

/**
 * "988 Suicide & Crisis Lifeline (US) 988 · call or text, 24/7": what the FAQ and structured data
 * repeat. Korean comes out exactly as lib/crisis.ts contactLine writes it.
 */
export const hotlineLines = (locale: Locale): string[] =>
  HOTLINES[locale].map((h) => `${h.name} ${h.number || h.url}${h.note ? ` · ${h.note}` : ""}`);
