import { CARDS } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { KB_CARDS, kbCard, kbForDeck, positionHint, topicAngles, type KbCard } from "./index";

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

describe("kbForDeck", () => {
  const base = kbCard("major-08-strength");
  const starlog = {
    facts: [
      { id: "hands-jaws", ko: "고양이가 두 앞발로 금빛 사자의 얼굴을 감싸 안고 있다", salience: 1 },
      { id: "lemniscate", ko: "고양이의 머리 위에 옆으로 누운 8자(∞) 모양이 떠 있다", salience: 2 },
    ],
    misdescriptions: [{ wrong: "여인이 사자를 다룬다", correct: "스타로그 카드의 인물은 고양이다", regex: "여인|여자" }],
  };
  const card: KbCard = { ...base, imagery: { ...base.imagery, decks: { starlog } } };

  it("reads the Starlog deck's own picture: its facts, its misdescriptions, the glosses of the facts it shows", () => {
    const seen = kbForDeck(card, "starlog");
    expect(seen.imagery.facts).toEqual(starlog.facts);
    expect(seen.imagery.misdescriptions).toEqual(starlog.misdescriptions);
    expect(seen.imagery.glosses.map((g) => g.factId).every((id) => id === "hands-jaws" || id === "lemniscate")).toBe(true);
    expect(seen.imagery.glosses.length).toBeGreaterThan(0);
    // Everything but the picture is the card's own.
    expect(seen.core).toBe(card.core);
    expect(seen.keywordsKo).toBe(card.keywordsKo);
  });

  it("keeps the 1909 picture for the 1909 deck, and for a card whose Starlog picture is not written yet", () => {
    expect(kbForDeck(card, "rws1909")).toBe(card);
    expect(kbForDeck(base, "starlog")).toBe(base);
  });
});
