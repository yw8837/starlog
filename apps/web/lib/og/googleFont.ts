import "server-only";

/**
 * Korean glyphs for next/og share images, fetched from Google Fonts as a subset of exactly the
 * characters drawn (the `text` parameter), so a whole Korean font never has to be bundled into the
 * Worker. Workers have no file system; the subset is kept in the Workers Cache API for 7 days.
 */

export type OgFontFamily = "Gowun Batang" | "Noto Sans KR";
export type OgFontWeight = 400 | 500 | 700;

const CACHE_SECONDS = 7 * 24 * 60 * 60;
const FONT_URL = /src:\s*url\(([^)]+)\)\s*format\(['"]?(?:opentype|truetype)['"]?\)/;

/** The characters of `text`, each once, in a stable order (so equal texts share one cache entry). */
export function uniqueChars(text: string): string {
  return [...new Set(Array.from(text.replace(/\s+/g, "")))].sort().join("");
}

export function fontCssUrl(family: OgFontFamily, weight: OgFontWeight, text: string): string {
  return `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${weight}&text=${encodeURIComponent(uniqueChars(text))}`;
}

/** The Workers default cache, or null in Node (tests, `next dev`). */
function edgeCache(): Cache | null {
  const store = (globalThis as { caches?: CacheStorage & { default?: Cache } }).caches;
  return store?.default ?? null;
}

async function fetchOk(url: string): Promise<Response> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google Fonts ${res.status}`);
  return res;
}

export async function loadGoogleFont(family: OgFontFamily, weight: OgFontWeight, text: string): Promise<ArrayBuffer> {
  const cssUrl = fontCssUrl(family, weight, text);
  const cache = edgeCache();
  const hit = cache ? await cache.match(cssUrl).catch(() => undefined) : undefined;
  if (hit) return hit.arrayBuffer();

  const css = await (await fetchOk(cssUrl)).text();
  const src = FONT_URL.exec(css)?.[1]?.replace(/^['"]|['"]$/g, "");
  if (!src) throw new Error("Google Fonts: no font url");
  const font = await (await fetchOk(src)).arrayBuffer();

  if (cache) {
    const stored = new Response(font, { headers: { "Content-Type": "font/ttf", "Cache-Control": `public, max-age=${CACHE_SECONDS}` } });
    await cache.put(cssUrl, stored).catch(() => undefined);
  }
  return font;
}

export interface OgFont {
  name: string;
  data: ArrayBuffer;
  weight: OgFontWeight;
  style: "normal";
}

/**
 * The fonts for one image: Serif (Gowun Batang 700) for titles and numbers, Sans (Noto Sans KR 700)
 * for everything else, each subset to the text it draws. An empty list when Google Fonts cannot be
 * reached: next/og then fetches missing glyphs on its own.
 */
export async function ogFonts(serifText: string, sansText: string): Promise<OgFont[]> {
  try {
    const [serif, sans] = await Promise.all([
      loadGoogleFont("Gowun Batang", 700, serifText),
      loadGoogleFont("Noto Sans KR", 700, sansText),
    ]);
    return [
      { name: "Serif", data: serif, weight: 700, style: "normal" },
      { name: "Sans", data: sans, weight: 700, style: "normal" },
    ];
  } catch {
    console.warn(JSON.stringify({ evt: "og.font_unavailable" }));
    return [];
  }
}
