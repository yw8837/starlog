import { describe, expect, it } from "vitest";
import { deepHeadings } from "@/lib/ai/prompts/deepTarot";
import { MATCH_HEADINGS } from "@/lib/ai/prompts/match";
import { NEWYEAR_HEADINGS } from "@/lib/ai/prompts/newyear";
import { SAJU_LOCKED_TOC } from "@/lib/ai/prompts/saju";
import { tarotHeadings } from "@/lib/ai/prompts/tarot";
import { PRODUCTS } from "./catalog";
import { CHECKOUT_TOC } from "./toc";

/** The headings a reading is written under, for a plain three-card question (no time chosen, not about another person). */
const ctx = { when: null, custom: {}, cards: [{}, {}, {}], relational: false, conditions: [] } as never;
const short = (heading: string) => heading.split(" · ")[0]!;

describe("checkout's table of contents (sales 2026-11-10 item 1)", () => {
  it("has titles for every product on sale, short ones only", () => {
    for (const product of PRODUCTS) {
      expect(CHECKOUT_TOC[product.id].length).toBeGreaterThan(3);
      for (const title of CHECKOUT_TOC[product.id]) expect(title.length).toBeLessThanOrEqual(24);
    }
  });

  it("names only sections the reading is really written under (the generators' own headings)", () => {
    const tarot = Object.values(tarotHeadings(ctx));
    expect(CHECKOUT_TOC.tarot.filter((t) => t !== "카드별 풀이" && t !== "카드를 이어 읽으면").every((t) => tarot.includes(t))).toBe(true);
    const deep = Object.values(deepHeadings(ctx));
    expect(CHECKOUT_TOC["tarot-deep"].filter((t) => t !== "카드 10장 자리별 풀이").every((t) => deep.includes(t))).toBe(true);
    expect(CHECKOUT_TOC.saju).toEqual(SAJU_LOCKED_TOC.map(short));
    const match: readonly string[] = Object.values(MATCH_HEADINGS);
    expect(CHECKOUT_TOC.match.filter((t) => t !== "앞으로 1년, 석 달씩").every((t) => match.includes(t))).toBe(true);
    const year: readonly string[] = Object.values(NEWYEAR_HEADINGS);
    expect(CHECKOUT_TOC["newyear-2027"].filter((t) => t !== "1월부터 12월까지 달마다" && t !== "일, 돈, 관계, 몸과 생활 리듬").every((t) => year.includes(t))).toBe(true);
  });
});
