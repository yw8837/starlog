import { DEFAULT_LOCALE, LOCALES, type Locale } from "./locales";

const PREFIXED = LOCALES.filter((locale) => locale !== DEFAULT_LOCALE);

/** "/tarot/new" in `locale`: Korean as it is, the others under their prefix ("/" → "/en"). */
export function localePath(locale: Locale, path: string): string {
  if (!path.startsWith("/")) throw new Error(`localePath needs an absolute path, got "${path}"`);
  if (locale === DEFAULT_LOCALE) return path;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

/** The locale of a browser pathname and the path without its prefix. */
export function splitLocale(pathname: string): { locale: Locale; path: string } {
  for (const locale of PREFIXED) {
    if (pathname === `/${locale}`) return { locale, path: "/" };
    if (pathname.startsWith(`/${locale}/`)) return { locale, path: pathname.slice(locale.length + 1) };
  }
  return { locale: DEFAULT_LOCALE, path: pathname || "/" };
}

/** An internal page link that takes the locale prefix (not the API, not a file, not already prefixed). */
export function isLocalizable(href: string): boolean {
  if (!href.startsWith("/") || href.startsWith("//")) return false;
  const path = href.split(/[?#]/)[0] ?? "";
  if (path.startsWith("/api/") || path.startsWith("/_next/")) return false;
  if ((path.split("/").at(-1) ?? "").includes(".")) return false;
  if (/^\/ko(?:\/|$)/.test(path)) return false;
  return splitLocale(path).locale === DEFAULT_LOCALE;
}

export function localizeHref(locale: Locale, href: string): string {
  if (locale === DEFAULT_LOCALE || !isLocalizable(href)) return href;
  const cut = href.search(/[?#]/);
  const path = cut < 0 ? href : href.slice(0, cut);
  const rest = cut < 0 ? "" : href.slice(cut);
  return localePath(locale, path) + rest;
}

/** The same page in another locale (the language switch). Whether it exists there: availability.ts (Task 23). */
export function switchPath(pathname: string, to: Locale): string {
  return localePath(to, splitLocale(pathname).path);
}
