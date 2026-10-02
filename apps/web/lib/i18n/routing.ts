import { DEFAULT_LOCALE, LOCALES } from "./locales";

/**
 * Locale routing for next.config.ts (spec §4.2). Relative imports only: the config is compiled
 * without the "@/" alias. Korean pages live at app/[lang]/… with lang = "ko", reached by rewriting
 * every path that is not a locale prefix (ko included, so /ko/… reaches its redirect), not the API,
 * not Next's own files and not a file (a dot in the last segment).
 */
export const KO_REWRITE_PATTERN = `(?!(?:${LOCALES.join("|")})(?:/|$)|api/|_next/|.*\\.[^/]*$).+`;

export function localeRewrites() {
  return {
    beforeFiles: [
      { source: "/", destination: `/${DEFAULT_LOCALE}` },
      { source: `/:path(${KO_REWRITE_PATTERN})`, destination: `/${DEFAULT_LOCALE}/:path` },
    ],
    afterFiles: [],
    fallback: [],
  };
}

/** /ko and /ko/… are never canonical: 308 to the unprefixed URL. Each prefixed /guide goes to its first tab, like /guide. */
export function localeRedirects() {
  return [
    { source: `/${DEFAULT_LOCALE}`, destination: "/", permanent: true },
    { source: `/${DEFAULT_LOCALE}/:path*`, destination: "/:path*", permanent: true },
    ...LOCALES.filter((locale) => locale !== DEFAULT_LOCALE).map((locale) => ({ source: `/${locale}/guide`, destination: `/${locale}/guide/tarot`, permanent: true })),
  ];
}
