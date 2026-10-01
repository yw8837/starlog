import type { GuideArticle } from "../guide";
import { MAJOR_ARCANA_ARTICLES } from "./tarot";
import { SAJU_ARTICLES } from "./saju";
import { SPREAD_ARTICLES } from "./spreads";

/**
 * The guide library: card, spread and saju articles kept outside lib/guide.ts so they can grow
 * without touching it. Card articles describe only what the KB (content/kb/cards) records for the
 * RWS 1909 scans; saju articles follow saju-policy@1 and the chart engine in @starlog/core.
 */

/** "같이 읽어 볼 글" for the six articles in lib/guide.ts. */
const BASE_RELATED: Readonly<Record<string, readonly string[]>> = {
  "how-to-read-tarot": ["upright-and-reversed", "three-card-spread", "minor-arcana-suits", "one-card-yes-no"],
  "upright-and-reversed": ["how-to-read-tarot", "the-star", "three-card-spread"],
  "saju-without-birth-time": ["manseryeok", "daewoon", "day-master"],
  "five-elements": ["heavenly-stems", "earthly-branches", "ten-gods"],
  "the-hermit": ["the-high-priestess", "the-hanged-man", "the-star"],
  "the-star": ["the-tower", "the-moon", "the-hermit"],
};

/** Base articles first (their order is the tab and home order), then spreads, cards 0–21 and saju. */
export function withGuideLibrary(base: readonly GuideArticle[]): GuideArticle[] {
  return [
    ...base.map((article) => {
      const related = article.related ?? BASE_RELATED[article.slug];
      return related ? { ...article, related } : article;
    }),
    ...SPREAD_ARTICLES,
    ...MAJOR_ARCANA_ARTICLES,
    ...SAJU_ARTICLES,
  ];
}
