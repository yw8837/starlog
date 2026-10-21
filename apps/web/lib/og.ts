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

/** The site's link preview (app/opengraph-image.tsx): what the brand picture shows. */
export const OG_ALT = `${SITE.name} · ${SITE.nameKo} — 타로와 사주로 내 고민을 풀어 주는 곳. 타로 카드를 든 고양이 타로로와 사주표를 든 토끼 사주주`;
