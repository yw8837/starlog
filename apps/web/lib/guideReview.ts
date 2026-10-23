import { SITE } from "./config";

/**
 * 편집 책임: the owner, 대표 of the business, answers for every guide article as its editor (owner decision 2026-10-23).
 * The byline, the 이 글에 대해 box, the editorial page's 책임 편집, the Article JSON-LD's author and og:article:author.
 */
export const GUIDE_EDITOR = { name: SITE.business.ceo, title: `${SITE.business.name} 대표` } as const;

/** 검토: who read the article and approved it, and on which day (YYYY-MM-DD, Korean time). */
export interface GuideReview {
  by: string;
  on: string;
}

/**
 * Articles the owner has read and approved himself, by slug. Add an entry only when the owner reports having read that
 * article, with the day he did; never for a bulk edit or a passing automated check. Only these articles show
 * "검토 최용우" and carry reviewedBy/lastReviewed in their JSON-LD.
 */
export const GUIDE_REVIEWS: Readonly<Record<string, GuideReview>> = {};

export const guideReview = (slug: string): GuideReview | undefined => (Object.hasOwn(GUIDE_REVIEWS, slug) ? GUIDE_REVIEWS[slug] : undefined);
