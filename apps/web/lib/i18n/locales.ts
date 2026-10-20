/**
 * The locales of P6 (spec §3). Korean is the default and the source of truth, served at the root with
 * no prefix; the others live under /en, /ja and /zh-hant. Pure and import-free: next.config.ts reaches
 * it through ./routing.ts, so it must not use the "@/" alias.
 */

export const LOCALES = ["ko", "en", "ja", "zh-hant"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ko";

export interface LocaleInfo {
  /** <html lang>, hreflang and JSON-LD inLanguage (BCP 47) */
  tag: string;
  /** og:locale */
  og: string;
  /** Intl.* locale */
  intl: string;
  /** the header chip and the /me row (owner's reference row: KO · EN · JA · 繁中) */
  chip: string;
  /** the language's own name */
  endonym: string;
}

export const LOCALE_INFO: Readonly<Record<Locale, LocaleInfo>> = {
  ko: { tag: "ko", og: "ko_KR", intl: "ko-KR", chip: "KO", endonym: "한국어" },
  en: { tag: "en", og: "en_US", intl: "en-US", chip: "EN", endonym: "English" },
  ja: { tag: "ja", og: "ja_JP", intl: "ja-JP", chip: "JA", endonym: "日本語" },
  "zh-hant": { tag: "zh-Hant", og: "zh_TW", intl: "zh-Hant-TW", chip: "繁中", endonym: "繁體中文" },
};

export const isLocale = (value: unknown): value is Locale => typeof value === "string" && (LOCALES as readonly string[]).includes(value);

function parseList(raw: string | undefined): Locale[] {
  return (raw ?? "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(isLocale);
}

const ordered = (set: ReadonlySet<Locale>): Locale[] => LOCALES.filter((locale) => set.has(locale));

/**
 * Public locales (NEXT_PUBLIC_LOCALES, read at build time): indexed, in the switch, the sitemap and
 * hreflang. Korean always.
 */
export function publicLocales(raw: string | undefined = process.env.NEXT_PUBLIC_LOCALES): Locale[] {
  return ordered(new Set<Locale>(["ko", ...parseList(raw)]));
}

/**
 * Preview locales (NEXT_PUBLIC_LOCALES_PREVIEW): routes exist, but they are noindex and stay out of
 * the switch, the sitemap and hreflang. For the owner's and native reviewers' checks.
 */
export function previewLocales(raw: string | undefined = process.env.NEXT_PUBLIC_LOCALES_PREVIEW, pub: readonly Locale[] = publicLocales()): Locale[] {
  return ordered(new Set(parseList(raw).filter((locale) => !pub.includes(locale))));
}

/** Every locale that gets routes in this build. */
export function routedLocales(pub: readonly Locale[] = publicLocales(), preview: readonly Locale[] = previewLocales(undefined, pub)): Locale[] {
  return ordered(new Set<Locale>([...pub, ...preview]));
}

