import { describe, expect, it } from "vitest";
import { tarotChapter } from "./chapters";

const CARDS = [{ position: "지금의 나", cardId: "major-09-hermit", orientation: "upright" as const }];
const BODY = { reading: { verdict: "결론" }, chapterToken: "t" };

describe("tarotChapter (the account's copy)", () => {
  it("keeps the deck the reading was written for, so a copy restored on another device shows that deck", () => {
    const chapter = tarotChapter({ question: "q", conditions: [], deck: "starlog" }, CARDS, BODY, 1);
    expect(chapter.deck).toBe("starlog");
  });

  it("leaves it out for a reading sent without one (written for the 1909 scans)", () => {
    expect(tarotChapter({ question: "q", conditions: [] }, CARDS, BODY, 1)).not.toHaveProperty("deck");
  });
});
