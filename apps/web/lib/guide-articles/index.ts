import type { GuideArticle } from "../guide";
import { GUIDE_DATES, GUIDE_HOWTO, GUIDE_SUMMARIES } from "./answers";
import { DAY_MASTER_ARTICLES } from "./day-masters";
import { MAJOR_ARCANA_ARTICLES } from "./tarot";
import { TAROT_BASICS_ARTICLES } from "./tarot-basics";
import { SAJU_ARTICLES } from "./saju";
import { SAJU_CONCEPT_ARTICLES } from "./saju-concepts";
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

/** The 요약 lead, dates and HowTo steps kept in answers.ts, attached by slug. */
function withAnswers(article: GuideArticle): GuideArticle {
  const summary = article.summary ?? GUIDE_SUMMARIES[article.slug];
  const dates = GUIDE_DATES[article.slug];
  const howTo = article.howTo ?? GUIDE_HOWTO[article.slug];
  return {
    ...article,
    ...(summary ? { summary } : {}),
    ...(dates ? { published: article.published ?? dates.published, updated: article.updated ?? dates.updated } : {}),
    ...(howTo ? { howTo } : {}),
  };
}

/**
 * Base articles first (their order is the tab and home order), then spreads, the tarot basics (two
 * arcana, four suits, the 22 in order), cards 0–21, saju, the saju concepts and the ten day masters.
 */
export function withGuideLibrary(base: readonly GuideArticle[]): GuideArticle[] {
  return [
    ...base.map((article) => {
      const related = article.related ?? BASE_RELATED[article.slug];
      return related ? { ...article, related } : article;
    }),
    ...SPREAD_ARTICLES,
    ...TAROT_BASICS_ARTICLES,
    ...MAJOR_ARCANA_ARTICLES,
    ...SAJU_ARTICLES,
    ...SAJU_CONCEPT_ARTICLES,
    ...DAY_MASTER_ARTICLES,
  ].map(withAnswers);
}
