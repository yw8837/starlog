/**
 * The light half of the guide: types, categories, labels and paths, no article data. UI that only
 * links to the guide imports this; lib/guide.ts holds the articles and re-exports all of it. A client
 * component that reached lib/guide.ts would ship every article body to the browser
 * (guide.client.test.ts).
 */

import type { TemplateId } from "@starlog/core";

export type GuideCategory = "tarot" | "saju";

export const GUIDE_CATEGORY_LABEL: Record<GuideCategory, string> = { tarot: "타로", saju: "사주" };

/**
 * The guide index is one tab per category, in this order, each a static route `/guide/<category>`.
 * A static segment wins over `/guide/[slug]`, so no article slug may equal a category.
 */
export const GUIDE_CATEGORIES: readonly GuideCategory[] = ["tarot", "saju"];

export const guideIndexPath = (category: GuideCategory): string => `/guide/${category}`;

/**
 * 가이드 소개와 편집 원칙 (app/guide/about): who makes the guide, how an article is written and checked, how to
 * report an error. A static route next to [slug], so no article slug may be "about" either.
 */
export const GUIDE_ABOUT_PATH = "/guide/about";

/** The three-card spreads of the app (TEMPLATES in @starlog/core) a three-card diagram can label. */
export type GuideThreeCardSpread = Exclude<TemplateId, "daily" | "deep-tarot" | "match">;

/** Callout tones: 도움말, 참고, 주의. */
export type GuideCalloutTone = "tip" | "note" | "caution";

/**
 * One rich block after a section's body paragraph. Every text is a plain string (no markup), so the
 * page, llms-full, the FAQ answers and the translations read the same words.
 */
export type GuideBlock =
  | { kind: "p"; text: string }
  | { kind: "list"; items: readonly string[]; ordered?: boolean }
  /** Rows have one cell per head cell; the first cell of a row is its header (th scope="row"). */
  | { kind: "table"; caption: string; head: readonly string[]; rows: ReadonlyArray<readonly string[]> }
  /** A static image under apps/web/public, with its real pixel size (no layout shift). */
  | { kind: "figure"; src: string; alt: string; width: number; height: number; caption?: string }
  | { kind: "callout"; tone: GuideCalloutTone; title: string; text: string }
  | { kind: "steps"; items: ReadonlyArray<{ title: string; text: string }> }
  /** 2-5 card ids (content/kb/cards), shown small with their names. */
  | { kind: "cardRow"; cards: readonly string[]; caption?: string }
  | { kind: "diagram"; name: "five-elements" | "celtic-cross" | "daewoon"; caption?: string }
  | { kind: "diagram"; name: "three-card"; spread: GuideThreeCardSpread; caption?: string };

export interface GuideSection {
  heading: string;
  /** The first paragraph, in 해요체; blocks follow it. A section without blocks is this paragraph alone. */
  body: string;
  blocks?: readonly GuideBlock[];
}

export interface GuideArticle {
  slug: string;
  title: string;
  category: GuideCategory;
  /** Meta description and the one-line teaser on the guide index. */
  description: string;
  /** Card shown with a card article. */
  cardId?: string;
  sections: GuideSection[];
  /** Slugs listed under "같이 읽어 볼 글" on the article page, in this order. */
  related?: readonly string[];
  /**
   * 요약: 2-3 sentences that answer the title's question, shown first on the page (search snippets
   * and AI answers quote it). Filled from lib/guide-articles/answers.ts.
   */
  summary?: string;
  /** 한눈에 보기: three short points under the 요약, restating the article. */
  keyPoints?: readonly string[];
  /** First published and last content change, YYYY-MM-DD (lib/guide-articles/answers.ts). */
  published?: string;
  updated?: string;
}

/**
 * 마지막 검토: the article's last content change (`updated`, made when it was checked against its sources again), or
 * its first publication when it has none. The byline, the trust box, the Article JSON-LD's dateModified, the
 * sitemap and the hub's recently checked list all read this one date.
 */
export const lastReviewed = (article: Pick<GuideArticle, "published" | "updated">): string | undefined => article.updated ?? article.published;
