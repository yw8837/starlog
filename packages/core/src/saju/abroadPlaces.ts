import type { CoreLocale } from "../i18n";

export const ABROAD_ZONES = ["Asia/Tokyo", "Asia/Taipei", "Asia/Hong_Kong"] as const;

export interface AbroadPlace {
  id: string;
  country: "JP" | "TW" | "HK";
  timeZone: (typeof ABROAD_ZONES)[number];
  /** degrees east, city centre */
  longitude: number;
  names: Record<CoreLocale, string>;
}

const p = (id: string, country: AbroadPlace["country"], timeZone: AbroadPlace["timeZone"], longitude: number, ko: string, en: string, ja: string, zh: string): AbroadPlace =>
  ({ id, country, timeZone, longitude, names: { ko, en, ja, "zh-hant": zh } });

/** Birthplaces abroad in P6 Phase A (spec §8); solar dates only. */
export const ABROAD_PLACES: readonly AbroadPlace[] = Object.freeze([
  p("jp-tokyo", "JP", "Asia/Tokyo", 139.692, "도쿄", "Tokyo", "東京", "東京"),
  p("jp-osaka", "JP", "Asia/Tokyo", 135.502, "오사카", "Osaka", "大阪", "大阪"),
  p("jp-nagoya", "JP", "Asia/Tokyo", 136.907, "나고야", "Nagoya", "名古屋", "名古屋"),
  p("jp-sapporo", "JP", "Asia/Tokyo", 141.354, "삿포로", "Sapporo", "札幌", "札幌"),
  p("jp-sendai", "JP", "Asia/Tokyo", 140.872, "센다이", "Sendai", "仙台", "仙台"),
  p("jp-hiroshima", "JP", "Asia/Tokyo", 132.455, "히로시마", "Hiroshima", "広島", "廣島"),
  p("jp-fukuoka", "JP", "Asia/Tokyo", 130.402, "후쿠오카", "Fukuoka", "福岡", "福岡"),
  p("jp-naha", "JP", "Asia/Tokyo", 127.681, "나하", "Naha", "那覇", "那霸"),
  p("tw-taipei", "TW", "Asia/Taipei", 121.565, "타이베이", "Taipei", "台北", "臺北"),
  p("tw-taichung", "TW", "Asia/Taipei", 120.674, "타이중", "Taichung", "台中", "臺中"),
  p("tw-tainan", "TW", "Asia/Taipei", 120.227, "타이난", "Tainan", "台南", "臺南"),
  p("tw-kaohsiung", "TW", "Asia/Taipei", 120.302, "가오슝", "Kaohsiung", "高雄", "高雄"),
  p("hk-hong-kong", "HK", "Asia/Hong_Kong", 114.169, "홍콩", "Hong Kong", "香港", "香港"),
]);
