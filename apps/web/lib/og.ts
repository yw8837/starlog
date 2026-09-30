import { SITE } from "./config";

/**
 * Text drawn on the Open Graph image. Every character must be in the offline font subsets
 * (assets/og/glyphs.json, built by scripts/build-og-fonts.py); og.test.ts checks it, because
 * next/og fetches a missing glyph from Google Fonts at render time.
 */
export const OG_TEXT = {
  name: SITE.name,
  nameKo: SITE.nameKo,
  tagline: "카드와 사주로 쌓는 나의 이야기",
  host: new URL(SITE.url).host,
} as const;

export const OG_ALT = `${SITE.name} · ${SITE.nameKo} — ${OG_TEXT.tagline}`;
