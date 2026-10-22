import { describe, expect, it } from "vitest";
import { aiTells } from "../ai/style";
import { findArticle, guideSectionText, lastReviewed, type GuideArticle } from "../guide";

/**
 * 오행이 뭐예요? (five-elements) after the AI-tell pass: the same facts, but no ending that keeps coming back. Before it,
 * 10 of 61 sentences ended in 않아요, two cross-links said "따로 정리해 두었어요" word for word, and the 요약, 한눈에 보기 and a
 * section all opened with the same sentence about 좋고 나쁨.
 */

const article = findArticle("five-elements") as GuideArticle;
const pageText = [article.summary ?? "", ...(article.keyPoints ?? []), ...article.sections.map(guideSectionText)].join("\n");
const sentences = pageText
  .split(/(?<=[.?!])\s+|\n+/)
  .map((sentence) => sentence.trim())
  .filter((sentence) => /[.?!]$/.test(sentence));
const ending = (sentence: string) => sentence.replace(/[.?!…"'’”)\s]+$/, "").slice(-3);

describe("five-elements, sentence by sentence", () => {
  it("keeps every fact the tables and the worked example carry", () => {
    for (const fact of ["을해·갑신·계미·무오", "지장간", "상생", "상극", "편재·정재", "월지 신(申)", "목을 초록, 수를 파랑"]) expect(pageText, fact).toContain(fact);
  });

  it("has no AI tell the reading checks use in its prose, the repeated ending (E2) among them", () => {
    // The tables are left out: a column of "같은 오행 / 물이 살리는 오행 / …" ends alike by design, and it is not prose.
    const prose = article.sections.map((section) => guideSectionText({ ...section, blocks: (section.blocks ?? []).filter((block) => block.kind !== "table") }));
    expect(aiTells(prose.join("\n")).map((tell) => tell.id)).toEqual([]);
  });

  it("lets no ending carry more than an eighth of the sentences, nor three in a row", () => {
    const counts = new Map<string, number>();
    for (const sentence of sentences) counts.set(ending(sentence), (counts.get(ending(sentence)) ?? 0) + 1);
    for (const [end, n] of counts) expect(n, `${end} ×${n} of ${sentences.length}`).toBeLessThanOrEqual(Math.floor(sentences.length / 8));
    for (let i = 2; i < sentences.length; i++) {
      const same = [sentences[i - 2], sentences[i - 1], sentences[i]].map((sentence) => ending(sentence as string).slice(-2));
      expect(new Set(same).size, sentences.slice(i - 2, i + 1).join(" / ")).toBeGreaterThan(1);
    }
  });

  it("says no sentence twice across the 요약, 한눈에 보기 and the body", () => {
    const seen = new Set<string>();
    for (const sentence of sentences) {
      expect(seen.has(sentence), sentence).toBe(false);
      seen.add(sentence);
    }
    expect(pageText.match(/따로 정리해 두었어요/g) ?? []).toHaveLength(0);
  });

  it("links the two articles it points to, and dates the pass 2026-10-23", () => {
    const raw = article.sections.flatMap((section) => (section.blocks ?? []).flatMap((block) => (block.kind === "p" || block.kind === "callout" ? [block.text] : []))).join("\n");
    expect(raw).toContain("[십신 글](/guide/ten-gods)");
    expect(raw).toContain("[용신 글](/guide/yongsin)");
    expect(lastReviewed(article)).toBe("2026-10-23");
  });
});
