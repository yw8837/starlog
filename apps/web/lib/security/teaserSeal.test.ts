import { describe, expect, it } from "vitest";
import { TEASER_SEAL_TTL_MS, openTeaserSeal, sealTeaser, teaserCut } from "./teaserSeal";

const SECRET = "test-signing-secret-at-least-32-characters";
const NOW = Date.parse("2026-10-14T03:00:00Z");
const FIRST = { heading: "지금의 나 · 은둔자", body: "눈 덮인 봉우리 위에 노인이 홀로 서 있어요. 등불을 높이 들었어요." };
const SECOND = { heading: "필요한 것 · 별", body: "여인이 두 항아리로 물을 붓고 있어요. 오른손 물은 연못으로 들어가요. 이번 주에는 하나만 해 보세요." };
const BINDING = { drawToken: "draw.token", input: { topicId: "money", question: "이번 주 재물 흐름", conditions: [{ label: "지금 상황", value: "수입이 들쭉날쭉" }] } };

const sealed = () => sealTeaser([FIRST, SECOND], BINDING, SECRET, NOW);

describe("teaserCut: the part of the second card the teaser shows", () => {
  it("cuts at the sentence end nearest half the text", () => {
    const text = "가".repeat(40) + "요. " + "나".repeat(10) + "다. " + "다".repeat(45) + "요.";
    // ends at 42 (41%) and 55 (53%) of 103: the one at 55 is nearer the middle
    expect(teaserCut(text)).toBe("가".repeat(40) + "요. " + "나".repeat(10) + "다.");
  });

  it("counts ?, ! and … as sentence ends only before a space or the end", () => {
    const text = "가".repeat(48) + "?" + "나".repeat(3) + " " + "다".repeat(48) + "요.";
    // the ? is followed by 나, so it is no sentence end: the space at 52 is the cut
    expect(teaserCut(text)).toBe("가".repeat(48) + "?" + "나".repeat(3));
    expect(teaserCut("가".repeat(48) + "… " + "나".repeat(50))).toBe("가".repeat(48) + "…");
    expect(teaserCut("가".repeat(48) + "! " + "나".repeat(50))).toBe("가".repeat(48) + "!");
  });

  it("never cuts under 35% or over 65% of the text: without a sentence end there, at the space nearest half", () => {
    const text = "가".repeat(20) + "요. " + "나나 ".repeat(20) + "다".repeat(20) + "요.";
    const cut = teaserCut(text);
    expect(cut.length / text.length).toBeGreaterThanOrEqual(0.35);
    expect(cut.length / text.length).toBeLessThanOrEqual(0.65);
    expect(cut.endsWith("나나")).toBe(true);
  });

  it("shows only a part: the rest is not in what it returns", () => {
    const cut = teaserCut(SECOND.body);
    expect(SECOND.body.startsWith(cut)).toBe(true);
    expect(cut.length).toBeLessThan(SECOND.body.length);
    expect(cut).not.toContain("이번 주에는 하나만 해 보세요");
  });
});

describe("the teaser seal", () => {
  it("opens to both full cards for the same draw and input, and is not readable as text", async () => {
    const seal = await sealed();
    expect(seal).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(seal).not.toContain("항아리");
    expect(await openTeaserSeal(seal, BINDING, SECRET, NOW + 60_000)).toEqual([FIRST, SECOND]);
    // the same input with its keys in another order is the same input
    const reordered = { drawToken: BINDING.drawToken, input: { conditions: BINDING.input.conditions, question: BINDING.input.question, topicId: "money" } };
    expect(await openTeaserSeal(seal, reordered, SECRET, NOW)).toEqual([FIRST, SECOND]);
  });

  it("does not open for another draw, another question, another secret, after it expires, or when altered", async () => {
    const seal = await sealed();
    expect(await openTeaserSeal(seal, { ...BINDING, drawToken: "other.token" }, SECRET, NOW)).toBeNull();
    expect(await openTeaserSeal(seal, { ...BINDING, input: { ...BINDING.input, question: "다른 질문" } }, SECRET, NOW)).toBeNull();
    expect(await openTeaserSeal(seal, BINDING, `${SECRET}x`, NOW)).toBeNull();
    expect(await openTeaserSeal(seal, BINDING, SECRET, NOW + TEASER_SEAL_TTL_MS)).toBeNull();
    const flipped = seal.slice(0, 20) + (seal[20] === "A" ? "B" : "A") + seal.slice(21);
    expect(await openTeaserSeal(flipped, BINDING, SECRET, NOW)).toBeNull();
    for (const bad of [undefined, null, "", 42, "not a seal", "A".repeat(20_000)]) expect(await openTeaserSeal(bad, BINDING, SECRET, NOW)).toBeNull();
  });

  it("is its own key: a seal of the saved-reading or resume kind never opens as a teaser", async () => {
    const { sealJson } = await import("@/lib/account/secrets");
    const other = await sealJson({ v: 1, exp: NOW + 1000, cards: [FIRST, SECOND] }, SECRET, "anything");
    expect(await openTeaserSeal(other, BINDING, SECRET, NOW)).toBeNull();
  });
});
