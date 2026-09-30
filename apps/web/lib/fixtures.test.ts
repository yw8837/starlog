import { TEMPLATES, getCard } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { SITE } from "./config";
import {
  FOLLOW_UP_ANSWER,
  INVITE_FIXTURE,
  INVITE_FIXTURE_TOKEN,
  ME_FIXTURE,
  SAJU_SAMPLE,
  STORY_FIXTURE,
  TAROT_SAMPLE,
  WALLET_FIXTURE,
  nextChapterNumber,
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

describe("SAJU_SAMPLE", () => {
  it("locks exactly the paid section headings, in order", () => {
    expect(SAJU_SAMPLE.free.lockedToc).toEqual(SAJU_SAMPLE.paid.sections.map((s) => s.heading));
  });
});

describe("STORY_FIXTURE", () => {
  it("starts with the saju prologue, then the tarot chapter", () => {
    expect(STORY_FIXTURE.chapters.map((c) => c.id)).toEqual(["prologue", "sample"]);
    expect(STORY_FIXTURE.chapters[0]?.title).toBe(SAJU_SAMPLE.free.title);
    expect(STORY_FIXTURE.chapters[1]?.title).toBe(TAROT_SAMPLE.story.title);
  });

  it("gives every chapter a story excerpt and a plain excerpt taken from its own sample", () => {
    const [prologue, first] = STORY_FIXTURE.chapters;
    expect(prologue?.excerpt).toEqual({ story: SAJU_SAMPLE.story.body, plain: SAJU_SAMPLE.free.summary });
    expect(first?.excerpt).toEqual({ story: TAROT_SAMPLE.story.body, plain: TAROT_SAMPLE.paid.verdict });
  });

  it("marks the prologue with the sample's day pillar and day master", () => {
    const { day } = SAJU_SAMPLE.chart.pillars;
    expect(STORY_FIXTURE.chapters[0]?.saju).toEqual({ dayPillar: day.stem + day.branch, dayMaster: SAJU_SAMPLE.chart.dayMaster.ko });
    expect(STORY_FIXTURE.chapters[0]?.saju?.dayPillar).toBe("丙寅");
  });

  it("links each chapter to its chapter page, and the tarot chapter carries its three cards", () => {
    expect(STORY_FIXTURE.chapters.map((c) => c.href)).toEqual(["/chapter/prologue", "/chapter/sample"]);
    expect(STORY_FIXTURE.chapters[1]?.cards.map((c) => c.cardId)).toEqual(TAROT_SAMPLE.cards.map((c) => c.cardId));
  });

  it("numbers the next chapter after the tarot chapters (the prologue is not counted)", () => {
    expect(nextChapterNumber(STORY_FIXTURE.chapters)).toBe(2);
    expect(nextChapterNumber([])).toBe(1);
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

  it("signs the user in as 별지기", () => {
    expect(ME_FIXTURE.nickname).toBe("별지기");
    expect(ME_FIXTURE.provider).toBe("카카오");
  });
});

describe("INVITE_FIXTURE", () => {
  it("is 하늘's invite, on the placeholder token", () => {
    expect(INVITE_FIXTURE.token).toBe(INVITE_FIXTURE_TOKEN);
    expect(INVITE_FIXTURE.inviter).toBe("하늘");
  });

  it("gives the friend the same sun card the story's friend scene shows", () => {
    const scene = STORY_FIXTURE.friendScenes[0];
    expect(INVITE_FIXTURE.card).toMatchObject({ cardId: scene?.cardId, orientation: scene?.orientation });
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

describe("SITE.moonPacks", () => {
  it("starts with 30 달빛 for 9,900원, then 60 + 6 bonus for 19,800원", () => {
    expect(SITE.moonPacks.slice(0, 2)).toEqual([
      { units: 30, bonus: 0, krw: 9900 },
      { units: 60, bonus: 6, krw: 19800 },
    ]);
  });

  it("lists bigger packs at higher prices", () => {
    for (let i = 1; i < SITE.moonPacks.length; i++) {
      expect(SITE.moonPacks[i]!.units).toBeGreaterThan(SITE.moonPacks[i - 1]!.units);
      expect(SITE.moonPacks[i]!.krw).toBeGreaterThan(SITE.moonPacks[i - 1]!.krw);
    }
  });
});
