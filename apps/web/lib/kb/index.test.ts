import { CARDS } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { KB_CARDS, kbCard, positionHint, topicAngles } from "./index";

describe("runtime KB", () => {
  it("has an entry for every deck card, with image facts and compilable misdescription regexes", () => {
    expect(KB_CARDS).toHaveLength(78);
    for (const card of CARDS) {
      const kb = kbCard(card.id);
      expect(kb.names.ko).toBe(card.names.ko);
      expect(kb.imagery.facts.length).toBeGreaterThanOrEqual(3);
      for (const m of kb.imagery.misdescriptions) expect(() => new RegExp(m.regex)).not.toThrow();
    }
  });

  it("maps topics to reading angles, main angle first", () => {
    expect(topicAngles("me", "money")).toEqual(["self"]);
    expect(topicAngles("us", "reunion")).toEqual(["contact", "love"]);
  });

  it("falls back to a sibling position, then the topic angle, when a card has no hint for a position", () => {
    const hermit = kbCard("major-09-hermit");
    expect(positionHint(hermit, "나의 마음", "upright")).toBe(hermit.positionHints["나의 마음"]!.upright);
    const noWorkHint = KB_CARDS.find((card) => !card.positionHints["지금 상황"])!;
    expect(positionHint(noWorkHint, "지금 상황", "reversed")).toBe(noWorkHint.topics.work.reversed);
  });
});
