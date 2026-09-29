import { describe, it, expect } from "vitest";
import { CARDS, getCard, cardImage } from "../src/tarot/cards";
import manifest from "../../../assets/cards/rws1909/manifest.json";

describe("card catalog", () => {
  it("has 78 unique cards", () => {
    expect(CARDS).toHaveLength(78);
    expect(new Set(CARDS.map(c => c.id)).size).toBe(78);
  });
  it("matches the downloaded scan manifest one-to-one", () => {
    const files = (manifest as { file: string }[]).map(m => m.file.replace(/\.jpg$/, "")).sort();
    expect(CARDS.map(c => c.id).sort()).toEqual(files);
  });
  it("names the Hermit correctly", () => {
    const h = getCard("major-09-hermit");
    expect(h.names.ko).toBe("은둔자");
    expect(h.roman).toBe("IX");
    expect(cardImage(h.id)).toBe("/cards/major-09-hermit.webp");
  });
  it("uses 에이스/시종/기사/여왕/왕 for minor ranks", () => {
    expect(getCard("wands-01").names.ko).toBe("완드 에이스");
    expect(getCard("cups-11").names.ko).toBe("컵 시종");
    expect(getCard("swords-14").names.ko).toBe("검 왕");
    expect(getCard("pentacles-13").names.ko).toBe("펜타클 여왕");
  });
  it("throws on unknown ids", () => { expect(() => getCard("nope")).toThrow(); });
});
