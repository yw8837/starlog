import { TEMPLATES, getCard } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { SITE } from "./config";
import {
  FOLLOW_UP_ANSWER,
  INVITE_FIXTURE,
  INVITE_FIXTURE_TOKEN,
  ME_FIXTURE,
  SAJU_FOLLOW_UPS,
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

describe("SAJU_FOLLOW_UPS", () => {
  it("offers two suggestions and one 해요체 answer", () => {
    expect(SAJU_FOLLOW_UPS.suggestions).toHaveLength(2);
    for (const q of SAJU_FOLLOW_UPS.suggestions) expect(q).toMatch(/요\?$/);
    expect(SAJU_FOLLOW_UPS.answer).toMatch(/요\.$/);
  });

  it("states only the sample chart's facts, with the reading hedged", () => {
    const { answer } = SAJU_FOLLOW_UPS;
    const { dayMaster, elements, hiddenStems } = SAJU_SAMPLE.chart;
    expect(answer).toContain(`일간은 ${dayMaster.ko}(${dayMaster.stem}火)`);
    expect(elements.금).toBe(0);
    expect(answer).toContain("보이는 여섯 글자 가운데 금(金)은 없어요");
    expect(hiddenStems.year).toContain("庚");
    expect(answer).toContain("뱀(巳) 속에 경금(庚金)");
    expect(answer).toContain("읽기도 해요");
    for (const word of ["반드시", "보장", "확률", "무조건"]) expect(answer).not.toContain(word);
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
  it("offers 30 for 8,500원, 60 + 6 for 16,900원 and 100 + 20 for 27,000원", () => {
    expect(SITE.moonPacks).toEqual([
      { units: 30, bonus: 0, krw: 8500 },
      { units: 60, bonus: 6, krw: 16900 },
      { units: 100, bonus: 20, krw: 27000 },
    ]);
  });

  it("makes a reading cheaper with 달빛 than paying for it directly, in every pack (spec §5)", () => {
    const direct = Math.min(SITE.price.tarotStandardKrw, SITE.price.sajuStandardKrw);
    for (const pack of SITE.moonPacks) {
      expect((pack.krw / (pack.units + pack.bonus)) * SITE.price.unitsPerReading, `${pack.units}+${pack.bonus}`).toBeLessThan(direct);
    }
  });

  it("lists bigger packs at higher prices", () => {
    for (let i = 1; i < SITE.moonPacks.length; i++) {
      expect(SITE.moonPacks[i]!.units).toBeGreaterThan(SITE.moonPacks[i - 1]!.units);
      expect(SITE.moonPacks[i]!.krw).toBeGreaterThan(SITE.moonPacks[i - 1]!.krw);
    }
  });
});
