// Client-safe: no article data, so GuideBlocks and the tests can read it without the whole guide.
import { SITE } from "./config";

/**
 * Links inside a guide article's text, written [텍스트](주소) in a section body, a paragraph, a list item, a step's text or
 * a callout's text (app/guide/GuideText.tsx renders them). Only three kinds of address are allowed: a guide page by its
 * path (/guide/<slug>, optional #anchor), the app host over https, and a source site on GUIDE_SOURCE_HOSTS over https.
 * Anything else is refused and shows as its words, so an article can never carry a script URL or an unknown host.
 */

/** Source sites an article may link (the books and data the evidence page names), https only. */
export const GUIDE_SOURCE_HOSTS = [
  "en.wikisource.org",
  "www.gutenberg.org",
  "commons.wikimedia.org",
  "aleistercrowleytimeline.com",
  "astro.kasi.re.kr",
  "ssd.jpl.nasa.gov",
  "www.openstreetmap.org",
] as const;

export type GuideLinkTarget = { kind: "guide"; path: string } | { kind: "app"; path: string } | { kind: "external"; url: string };

export type InlinePart = string | { text: string; url: string };

const LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
const GUIDE_PATH = /^\/guide\/[a-z0-9]+(?:-[a-z0-9]+)*(?:#[a-z0-9-]+)?$/;
const APP_HOST = new URL(SITE.url).hostname;

/** Where a link may go, or null when the address is not one an article may link. */
export function guideLinkTarget(url: string): GuideLinkTarget | null {
  if (url.startsWith("/")) return GUIDE_PATH.test(url) ? { kind: "guide", path: url } : null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) return null;
  if (parsed.hostname === APP_HOST) return { kind: "app", path: `${parsed.pathname}${parsed.search}${parsed.hash}` };
  if ((GUIDE_SOURCE_HOSTS as readonly string[]).includes(parsed.hostname)) return { kind: "external", url: parsed.toString() };
  return null;
}

/** A text split around its [text](url) links; everything else stays as written. */
export function inlineParts(text: string): InlinePart[] {
  const parts: InlinePart[] = [];
  let at = 0;
  for (const match of text.matchAll(LINK)) {
    const index = match.index ?? 0;
    if (index > at) parts.push(text.slice(at, index));
    parts.push({ text: match[1] as string, url: match[2] as string });
    at = index + match[0].length;
  }
  if (at < text.length) parts.push(text.slice(at));
  return parts.length ? parts : [text];
}

/** The text as a reader sees it: each link's words without its address (llms-full, FAQ answers, length and style checks). */
export const guidePlainText = (text: string): string => text.replace(LINK, "$1");
