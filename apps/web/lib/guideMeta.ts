/**
 * The light half of the guide: types, categories, labels and paths, no article data. UI that only
 * links to the guide imports this; lib/guide.ts holds the articles and re-exports all of it. A client
 * component that reached lib/guide.ts would ship every article body to the browser
 * (guide.client.test.ts).
 */

export type GuideCategory = "tarot" | "saju";

export const GUIDE_CATEGORY_LABEL: Record<GuideCategory, string> = { tarot: "타로", saju: "사주" };

/**
 * The guide index is one tab per category, in this order, each a static route `/guide/<category>`.
 * A static segment wins over `/guide/[slug]`, so no article slug may equal a category.
 */
export const GUIDE_CATEGORIES: readonly GuideCategory[] = ["tarot", "saju"];

export const guideIndexPath = (category: GuideCategory): string => `/guide/${category}`;

export interface GuideSection {
  heading: string;
  body: string;
}

/** schema.org HowTo for a step-by-step article; each step's text is quoted from the article body. */
export interface GuideHowTo {
  name: string;
  steps: ReadonlyArray<{ name: string; text: string }>;
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
  /** First published and last content change, YYYY-MM-DD (lib/guide-articles/answers.ts). */
  published?: string;
  updated?: string;
  howTo?: GuideHowTo;
}
