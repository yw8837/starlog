import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CARDS } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { ALL_GUIDE_ARTICLES, guideSectionText, type GuideArticle } from "./guide";
import { DAY_MASTER_ARTICLES } from "./guide-articles/day-masters";
import { SAJU_ARTICLES } from "./guide-articles/saju";
import { SAJU_CONCEPT_ARTICLES } from "./guide-articles/saju-concepts";
import { SAJU_EXAMPLES, guideLinkCount, guideMadeHow } from "./guideMadeHow";

/**
 * 만든 방법 is page-specific and says only what the repository makes true (AdSense audit 2026-11-06, task D): each claim
 * is tied here to the data or the test that backs it. The AI disclosure stays on every page.
 */

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const kbFile = (id: string) => JSON.parse(read(`../../../content/kb/cards/${id}.json`)) as { names: { ko: string }; imagery: { commonMisdescriptions: unknown[] } };
const SAJU_TEST = read("./guide-articles/saju-guides.test.ts");
const text = (article: GuideArticle) => article.sections.map(guideSectionText).join("\n");

describe("만든 방법", () => {
  it.each(ALL_GUIDE_ARTICLES.map((article) => [article.slug, article] as const))("%s: keeps the AI disclosure, in both lines", (_slug, article) => {
    const made = guideMadeHow(article);
    expect(made.short).toContain("AI 도구로");
    expect(made.long).toContain("AI 도구로");
    expect(`${made.short}\n${made.long}`).not.toMatch(/Claude|GPT|Gemini|OpenAI|Anthropic|베타|정확도|100%/);
  });

  it("is no longer one line on every page: no short line on more than a tenth of the articles", () => {
    const counts = new Map<string, number>();
    for (const article of ALL_GUIDE_ARTICLES) counts.set(guideMadeHow(article).short, (counts.get(guideMadeHow(article).short) ?? 0) + 1);
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(Math.ceil(ALL_GUIDE_ARTICLES.length / 10));
  });

  it.each(ALL_GUIDE_ARTICLES.filter((a) => a.cardId).map((a) => [a.slug, a] as const))("%s: the card's own misdescription count, as content/kb has it (library.test.ts keeps them out)", (_slug, article) => {
    const kb = kbFile(article.cardId as string);
    expect(guideMadeHow(article).long).toContain(`${kb.names.ko} 카드`);
    expect(guideMadeHow(article).long).toContain(`그림 ${kb.imagery.commonMisdescriptions.length}가지`);
  });

  it.each(["wands", "cups", "swords", "pentacles"].map((suit) => [suit] as const))("%s-suit: its fourteen cards' misdescriptions, as content/kb has them (suits.test.ts keeps them out)", (suit) => {
    const article = ALL_GUIDE_ARTICLES.find((a) => a.slug === `${suit}-suit`) as GuideArticle;
    const total = CARDS.filter((card) => card.suit === suit).reduce((sum, card) => sum + kbFile(card.id).imagery.commonMisdescriptions.length, 0);
    expect(guideMadeHow(article).long).toContain(`그림 ${total}가지`);
  });

  it("names a worked example only where saju-guides.test.ts recomputes that very birth", () => {
    const checked = new Set([...SAJU_ARTICLES, ...SAJU_CONCEPT_ARTICLES, ...DAY_MASTER_ARTICLES].map((a) => a.slug));
    for (const [slug, example] of Object.entries(SAJU_EXAMPLES)) {
      expect(checked.has(slug), slug).toBe(true);
      const article = ALL_GUIDE_ARTICLES.find((a) => a.slug === slug) as GuideArticle;
      expect(text(article), slug).toContain(example);
      expect(guideMadeHow(article).short).toContain(example);
      const [, y, m, d] = /(\d{4})년 (\d{1,2})월 (\d{1,2})일/.exec(example) as RegExpExecArray;
      if (slug.startsWith("day-master-")) {
        // The day masters' check recomputes every "…년 …월 …일 오전|오후 …시 …분 서울" birth in a section marked 가상.
        const section = article.sections.find((s) => guideSectionText(s).includes(`${example} 서울`));
        expect(section && guideSectionText(section), slug).toContain("가상");
      } else {
        // The concept's own check computes this date, or rebuilds the chart from a table whose caption names it.
        const start = SAJU_TEST.search(new RegExp(`\\n  "?${slug}"?: \\(`));
        expect(start, slug).toBeGreaterThan(0);
        const block = SAJU_TEST.slice(start, SAJU_TEST.indexOf("\n  },", start));
        const computes = block.includes(`at(${y}, ${m}, ${d}`);
        const rebuilds = /exampleChart\(/.test(block) && article.sections.some((s) => (s.blocks ?? []).some((b) => b.kind === "table" && b.caption.includes(example)));
        expect(computes || rebuilds, slug).toBe(true);
      }
    }
  });

  it("counts only the article's own links to guide pages", () => {
    const article = ALL_GUIDE_ARTICLES.find((a) => a.slug === "how-to-read-tarot") as GuideArticle;
    const linked = new Set([...JSON.stringify(article.sections).matchAll(/\]\((\/guide\/[a-z0-9-]+)/g)].map((m) => m[1]));
    expect(guideLinkCount(article)).toBe(linked.size);
  });
});
