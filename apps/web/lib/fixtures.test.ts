import { TEMPLATES, getCard } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { FOLLOW_UP_ANSWER, SAJU_SAMPLE, STORY_FIXTURE, TAROT_SAMPLE, WALLET_FIXTURE, paidHeadings } from "./fixtures";

describe("TAROT_SAMPLE", () => {
  const toc = TAROT_SAMPLE.free.lockedToc;
  const headings = paidHeadings(TAROT_SAMPLE.paid);

  it("opens the locked table of contents with the one-line verdict", () => {
    expect(toc[0]).toBe("한 줄 결론");
  });

  it("lists every paid heading in the locked table of contents, in reading order", () => {
    expect(toc.slice(1)).toEqual(headings);
  });

  it("has exactly one locked entry per paid section (no section left out)", () => {
    expect(headings).toHaveLength(10);
    expect(new Set(headings).size).toBe(headings.length);
    for (const heading of toc.slice(1)) expect(headings).toContain(heading);
  });

  it("uses real card ids whose positions follow the template", () => {
    const positions = TEMPLATES[TAROT_SAMPLE.template].positions;
    expect(TAROT_SAMPLE.cards.map((c) => c.position)).toEqual(positions);
    expect(TAROT_SAMPLE.paid.cards.map((c) => c.position)).toEqual(positions);
    for (const card of TAROT_SAMPLE.cards) {
      expect(getCard(card.cardId).names.ko).toBe(card.name);
      expect(["upright", "reversed"]).toContain(card.orientation);
    }
    expect(TAROT_SAMPLE.paid.cards.map((c) => c.cardId)).toEqual(TAROT_SAMPLE.cards.map((c) => c.cardId));
  });

  it("does not repeat the free first-card paragraph inside the paid reading", () => {
    const paidText = JSON.stringify(TAROT_SAMPLE.paid);
    expect(paidText).not.toContain(TAROT_SAMPLE.free.firstCard.body);
  });
});

describe("SAJU_SAMPLE", () => {
  it("locks exactly the paid section headings, in order", () => {
    expect(SAJU_SAMPLE.free.lockedToc).toEqual(SAJU_SAMPLE.paid.sections.map((s) => s.heading));
  });
});

describe("STORY_FIXTURE", () => {
  it("starts with the saju prologue, then the tarot chapter", () => {
    expect(STORY_FIXTURE.chapters.map((c) => c.id)).toEqual(["prologue", "sample"]);
    expect(STORY_FIXTURE.chapters[0]?.title).toBe(SAJU_SAMPLE.story.title);
    expect(STORY_FIXTURE.chapters[1]?.title).toBe(TAROT_SAMPLE.story.title);
  });

  it("holds one pending friend scene with the sun card under the friend's own nickname", () => {
    expect(STORY_FIXTURE.friendScenes).toHaveLength(1);
    const scene = STORY_FIXTURE.friendScenes[0];
    expect(scene?.status).toBe("pending");
    expect(scene?.cardId).toBe("major-19-sun");
    expect(scene?.nickname).toBe("지인 A");
    expect(() => getCard(scene?.cardId ?? "")).not.toThrow();
  });
});

describe("fixture extras", () => {
  it("keeps a wallet that covers 별조각 but is short on 달빛 for one reading", () => {
    expect(WALLET_FIXTURE).toEqual({ moonlight: 4, stardust: 12 });
  });

  it("has a follow-up answer in 해요체", () => {
    expect(FOLLOW_UP_ANSWER.length).toBeGreaterThan(40);
    expect(FOLLOW_UP_ANSWER).toMatch(/요\.$/);
  });
});
