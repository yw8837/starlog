import { CARDS } from "@starlog/core";
import { cardQuote } from "./evidence";
import type { GuideArticle } from "./guideMeta";
import { guideLinkTarget, inlineParts } from "./guideLinks";
import { kbCard } from "./kb";

/**
 * 만든 방법 per article (AdSense audit 2026-11-06: 69 of 70 pages opened on the same "글 AI 도구로 초안" line). Every line
 * keeps the AI disclosure and names only what the repository shows for that page: the sources it was set against, and the
 * automatic check that holds it (lib/guideMadeHow.test.ts ties each claim to the test that makes it true).
 *
 * - a card article: the KB's misdescriptions of that card, which lib/guide-articles/library.test.ts keeps out of the page,
 *   and where in Waite's book its quote stands (lib/evidence.ts);
 * - a suit article: the misdescriptions of its fourteen cards, which suits.test.ts keeps out of the sentences naming them;
 * - a saju article with a worked example (SAJU_EXAMPLES): the chart saju-guides.test.ts recomputes with the engine;
 * - any other article: its sources, and the links in its text, which GuideLinks.test.tsx resolves;
 * - an article with `madeHow` of its own (the data articles): that.
 */

const SUIT_KO: Readonly<Record<string, string>> = { wands: "완드", cups: "컵", swords: "검", pentacles: "펜타클" };
const SUIT_OF: Readonly<Record<string, string>> = { "wands-suit": "wands", "cups-suit": "cups", "swords-suit": "swords", "pentacles-suit": "pentacles" };

/**
 * The worked example each saju article's check recomputes with the engine, as the article writes it. Only articles whose
 * check in saju-guides.test.ts computes this very birth (lib/guideMadeHow.test.ts reads that file to make sure).
 */
export const SAJU_EXAMPLES: Readonly<Record<string, string>> = {
  "heavenly-stems": "1995년 8월 20일 낮 12시",
  "earthly-branches": "1995년 8월 20일 낮 12시",
  "day-master": "1995년 8월 20일 낮 12시",
  "ten-gods": "1996년 2월 7일 오전 6시 25분",
  daewoon: "1995년 8월 20일 낮 12시",
  "saju-compatibility": "1999년 10월 3일 오후 8시 30분",
  "reunion-saju": "1994년 6월 7일 오후 3시 10분",
  "new-year-fortune": "1995년 8월 20일 낮 12시",
  "four-pillars": "1990년 5월 15일 낮 12시",
  "jasi-birth": "2026년 3월 10일 밤 11시 40분",
  "saju-birth-info": "1990년 5월 15일 낮 12시",
  "branch-relations": "1994년 3월 25일 오후 1시 50분",
  "twelve-stages": "1995년 8월 20일 낮 12시",
  yongsin: "1990년 5월 15일 낮 12시",
  "saju-glossary": "1995년 8월 20일 낮 12시",
  "day-master-gapmok": "1996년 2월 7일 오전 6시 25분",
  "day-master-eulmok": "1997년 8월 11일 오후 4시 20분",
  "day-master-byeonghwa": "1995년 7월 4일 오후 2시 45분",
  "day-master-jeonghwa": "1993년 12월 12일 오전 7시 5분",
  "day-master-muto": "1999년 10월 3일 오후 8시 30분",
  "day-master-gito": "1993년 4월 8일 오전 5시 55분",
  "day-master-gyeonggeum": "1994년 3월 25일 오후 1시 50분",
  "day-master-singeum": "1998년 10월 21일 오전 10시 40분",
  "day-master-imsu": "1996년 11월 11일 오후 5시 5분",
  "day-master-gyesu": "1993년 6월 11일 오전 6시 40분",
};

/** Links in the article's own text to other guide pages (each resolved by GuideLinks.test.tsx). */
export function guideLinkCount(article: GuideArticle): number {
  const texts = article.sections.flatMap((section) => [section.body, ...(section.blocks ?? []).map((block) => JSON.stringify(block))]);
  const paths = texts.flatMap((text) => inlineParts(text)).flatMap((part) => {
    if (typeof part === "string") return [];
    const target = guideLinkTarget(part.url);
    return target?.kind === "guide" ? [target.path] : [];
  });
  return new Set(paths).size;
}

const misdescriptions = (cardId: string): number => kbCard(cardId).imagery.misdescriptions.length;

export interface MadeHow {
  /** Under the title, after "만든 방법". */
  short: string;
  /** In 이 글에 대해, a sentence or two. */
  long: string;
}

export function guideMadeHow(article: GuideArticle): MadeHow {
  if (article.madeHow) return article.madeHow;
  const links = guideLinkCount(article);
  const linkNote = links ? ` 글 속 가이드 링크 ${links}개가 실제 글로 이어지는지도 자동 검사로 확인해요.` : "";
  if (article.cardId) {
    const name = kbCard(article.cardId).names.ko;
    const count = misdescriptions(article.cardId);
    const quote = cardQuote(article.cardId);
    return {
      short: `AI 도구로 쓴 초안을 ${name} 카드의 1909년 원판 그림과 웨이트 해설서에 대조 · 그림 오기 ${count}가지 자동 검사`,
      long: `AI 도구로 초안을 쓰고 ${name} 카드의 1909년 원판 그림과 웨이트 해설서${quote ? `(${quote.loc})` : ""}에 대조해 다듬었어요. 카드 지식 베이스에 적어 둔 이 카드의 잘못 묘사하기 쉬운 그림 ${count}가지가 글에 없는지 자동 검사로 확인해요.`,
    };
  }
  const suit = SUIT_OF[article.slug];
  if (suit) {
    const cards = CARDS.filter((card) => card.suit === suit);
    const count = cards.reduce((sum, card) => sum + misdescriptions(card.id), 0);
    const name = SUIT_KO[suit];
    return {
      short: `AI 도구로 쓴 초안을 ${name} ${cards.length}장의 1909년 원판 그림에 대조 · 그림 오기 ${count}가지 자동 검사`,
      long: `AI 도구로 초안을 쓰고 ${name} ${cards.length}장의 1909년 원판 그림에 대조해 다듬었어요. 카드 지식 베이스에 적어 둔 ${cards.length}장의 잘못 묘사하기 쉬운 그림 ${count}가지가 각 카드를 말하는 문장에 없는지 자동 검사로 확인해요.`,
    };
  }
  const example = SAJU_EXAMPLES[article.slug];
  if (example) {
    return {
      short: `AI 도구로 쓴 초안의 예시 명식(${example})을 만세력 엔진으로 다시 계산해 확인`,
      long: `AI 도구로 초안을 쓰고 만세력 계산 규칙에 대조해 다듬었어요. 예시 명식(${example})은 스타로그 앱의 만세력 엔진으로 다시 세워, 글에 적힌 기둥과 같은지 자동 검사로 확인해요.${linkNote}`,
    };
  }
  if (article.category === "saju") {
    return {
      short: `AI 도구로 쓴 초안을 만세력 계산 규칙에 대조${links ? ` · 가이드 링크 ${links}개 자동 확인` : ""}`,
      long: `AI 도구로 초안을 쓰고 만세력 계산 규칙에 대조해 다듬었어요.${linkNote}`,
    };
  }
  return {
    short: `AI 도구로 쓴 초안을 1909년 원판 그림과 웨이트 해설서에 대조${links ? ` · 가이드 링크 ${links}개 자동 확인` : ""}`,
    long: `AI 도구로 초안을 쓰고 1909년 원판 그림과 웨이트 해설서에 대조해 다듬었어요.${linkNote}`,
  };
}
