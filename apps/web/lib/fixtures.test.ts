import { TEMPLATES, getCard } from "@starlog/core";
import { describe, expect, it } from "vitest";
import {
  INVITE_FIXTURE,
  INVITE_FIXTURE_TOKEN,
  TAROT_FOLLOW_UPS,
  TAROT_SAMPLE,
  paidHeadings,
} from "./fixtures";

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

describe("TAROT_FOLLOW_UPS", () => {
  const all = () => [...Object.values(TAROT_FOLLOW_UPS.answers), TAROT_FOLLOW_UPS.other];

  it("answers each of the sample's suggestions with its own 해요체 answer, plus one for typed questions", () => {
    expect(TAROT_FOLLOW_UPS.suggestions).toEqual(TAROT_SAMPLE.followUps);
    for (const q of TAROT_FOLLOW_UPS.suggestions) expect(TAROT_FOLLOW_UPS.answers[q]).toBeTruthy();
    expect(new Set(all()).size).toBe(all().length);
    for (const answer of all()) expect(answer).toMatch(/요\.$/);
  });

  it("never asserts what the user chose, and drafts the line it was asked for", () => {
    for (const answer of all()) expect(answer).not.toContain("정했으니");
    const draft = TAROT_FOLLOW_UPS.answers[TAROT_SAMPLE.followUps[0] ?? ""] ?? "";
    expect(draft).toContain("가벼운 안부라면");
    expect(draft).toMatch(/“[^”]+\?”/);
  });

  it("makes no guarantees", () => {
    for (const answer of all()) for (const word of ["반드시", "보장", "확률", "무조건"]) expect(answer).not.toContain(word);
  });
});

describe("INVITE_FIXTURE", () => {
  it("is 하늘's invite, on the placeholder token", () => {
    expect(INVITE_FIXTURE.token).toBe(INVITE_FIXTURE_TOKEN);
    expect(INVITE_FIXTURE.inviter).toBe("하늘");
  });

  it("gives the friend the sun, named and numbered as the deck prints it", () => {
    expect(INVITE_FIXTURE.card).toMatchObject({ cardId: "major-19-sun", orientation: "upright" });
    const card = getCard(INVITE_FIXTURE.card.cardId);
    expect(INVITE_FIXTURE.card.name).toBe(card.names.ko);
    expect(card.arcana === "major" ? card.roman : "").toBe(INVITE_FIXTURE.card.number);
  });

  it("reads the friend's own card in 2-3 sentences of 해요체", () => {
    const { result } = INVITE_FIXTURE;
    expect(result.startsWith("오늘은 숨기지 않아도 되는 날이에요.")).toBe(true);
    const sentences = result.split(/(?<=요\.)\s+/);
    expect(sentences.length).toBeGreaterThanOrEqual(2);
    expect(sentences.length).toBeLessThanOrEqual(3);
    for (const sentence of sentences) expect(sentence).toMatch(/요\.$/);
  });
});
