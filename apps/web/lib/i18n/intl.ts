import { won } from "@/lib/config";
import { kstMonthDay } from "@/lib/kst";
import { koreanDate } from "@/lib/legal";
import { LOCALE_INFO, type Locale } from "./locales";

/**
 * Numbers, KRW, dates and the KST business clock per locale (spec §8). Korean goes through the
 * existing helpers, so its output stays byte for byte. Prices are KRW in every locale: no conversion.
 */

const KST_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const intl = (locale: Locale) => LOCALE_INFO[locale].intl;

export const formatNumber = (locale: Locale, n: number): string => new Intl.NumberFormat(intl(locale)).format(n);

export function formatKrw(locale: Locale, krw: number): string {
  return locale === "ko" ? won(krw) : new Intl.NumberFormat(intl(locale), { style: "currency", currency: "KRW" }).format(krw);
}

/** A calendar date ("2026-10-01"): 시행일, published and updated dates. */
export function formatIsoDate(locale: Locale, iso: string): string {
  if (locale === "ko") return koreanDate(iso);
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat(intl(locale), { dateStyle: "long", timeZone: "UTC" }).format(new Date(Date.UTC(year!, month! - 1, day!)));
}

/** The KST calendar day that contains `ms`, as month and day ("10월 1일", "Oct 1", "10月1日"). */
export function formatKstMonthDay(locale: Locale, ms: number): string {
  if (locale === "ko") return kstMonthDay(ms);
  return new Intl.DateTimeFormat(intl(locale), { month: locale === "en" ? "short" : "long", day: "numeric", timeZone: "Asia/Seoul" }).format(new Date(ms));
}

/** The next 00:00 KST after `ms` (quotas and 오늘의 한 장 reset then). */
export function nextKstMidnight(ms: number): number {
  return (Math.floor((ms + KST_MS) / DAY_MS) + 1) * DAY_MS - KST_MS;
}

/** "HH:mm" (24 h) on `timeZone`'s clock. */
export function clockIn(timeZone: string, ms: number): string {
  const parts = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("hour")}:${get("minute")}`;
}
