import { describe, expect, it } from "vitest";
import { kbCard, kbForDeck } from "@/lib/kb";
import { sharedMisdescriptionHits } from "./validate";

/**
 * A misdescription regex is skipped when another drawn card's own text holds it (검 7's man makes "남자가" no invented
 * detail of 펜타클 9's woman). The 1909 scans and the Starlog deck draw a card differently under one id, so what a card
 * legitimately says is the deck's own: a reading in one deck must never be judged by the other's pictures (the deep
 * reading that failed now and then once both decks had been read in one process, 2026-10-17 gate and full suite).
 */
describe("shared misdescriptions, deck by deck", () => {
  const text = "붉은 모자를 쓴 남자가 칼 다섯 자루를 품에 안고 발끝으로 걸어가요.";
  const rws = [kbCard("swords-07"), kbCard("pentacles-09")];
  const starlog = rws.map((card) => kbForDeck(card, "starlog"));

  it("reads each deck's own pictures, whichever deck was read first", () => {
    const starlogFirst = sharedMisdescriptionHits(text, starlog);
    expect(sharedMisdescriptionHits(text, rws)).toEqual([]);
    expect(sharedMisdescriptionHits(text, starlog)).toEqual(starlogFirst);
  });

  it("still flags the detail when no drawn card holds it", () => {
    expect(sharedMisdescriptionHits(text, [kbCard("cups-02"), kbCard("pentacles-09")])).toEqual(["남자가 포도밭에 서 있다"]);
  });
});
