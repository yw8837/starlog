import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MODEL_NAMES } from "../ai/style";

/**
 * Verified source data for the "our evidence" page: Waite's PKT (content/kb/sources/pkt.json),
 * Golden Dawn Book T (content/kb/sources/book-t.json) and the evidence facts (content/evidence.json).
 * Method and every KB change: docs/research/kb-source-verification-2026-10.md.
 */
const repoPath = (path: string) => fileURLToPath(new URL(`../../../../${path}`, import.meta.url));
const readJson = <T>(path: string): T => JSON.parse(readFileSync(repoPath(path), "utf8")) as T;

interface PktCard { loc: string; pictureEn: string; meaningEn: string; reversedEn: string | null; quoteEn: string; quoteKo: string }
interface BookTCard { nameInSource: string; title: string; letter?: { name: string; hebrew: string }; attribution: string; loc: string }
interface Source { title: string; author?: string; year: number; urls: string[] }
interface KbCard {
  arcana: "major" | "minor";
  rank: string | null;
  attributions: { astrology: string | null };
  imagery: { commonMisdescriptions: { regex: string }[] };
  waite: { upright: string; reversed: string | null; loc: string };
  sources: { id: string; loc: string }[];
}
interface Fact { id: string; area: string; labelKo: string; valueKo: string; detailKo: string; doc: string }

const IDS = readJson<{ ids: string[] }>("content/kb/cards/_index.json").ids;
const kb = (id: string) => readJson<KbCard>(`content/kb/cards/${id}.json`);
const HANGUL = /[가-힣]/;
// The KB keeps Waite's meanings without the comma or period that ends them before "Reversed:".
const sameText = (a: string | null, b: string | null) => (a ?? "").replace(/[\s,.;:]+$/, "") === (b ?? "").replace(/[\s,.;:]+$/, "");

describe("PKT 1910 source file", () => {
  const pkt = () => readJson<{ source: Source; cards: Record<string, PktCard> }>("content/kb/sources/pkt.json");

  it("covers all 78 cards with a locator, Waite's verbatim text and a short Korean quote taken from it", () => {
    const { source, cards } = pkt();
    expect(Object.keys(cards).sort()).toEqual([...IDS].sort());
    expect(source.urls.length).toBeGreaterThan(0);
    for (const url of source.urls) expect(url).toMatch(/^https:\/\//);
    for (const id of IDS) {
      const card = cards[id]!;
      expect(card.loc.trim(), id).not.toBe("");
      expect(card.pictureEn.trim(), id).not.toBe("");
      expect(card.meaningEn.trim(), id).not.toBe("");
      expect(card.pictureEn, id).toContain(card.quoteEn);
      expect(card.quoteKo, id).toMatch(HANGUL);
      expect(card.quoteKo.length, id).toBeLessThanOrEqual(80);
      expect(card.quoteKo, id).not.toMatch(MODEL_NAMES);
      expect(card.quoteKo, id).not.toContain("—");
      // The quote sits next to the card picture, so it must not repeat a misdescription the KB rules out.
      for (const m of kb(id).imagery.commonMisdescriptions) expect(card.quoteKo, `${id}: ${m.regex}`).not.toMatch(new RegExp(m.regex));
    }
  });

  it("matches the KB's waite fields and PKT locators", () => {
    const { cards } = pkt();
    for (const id of IDS) {
      const card = kb(id), source = cards[id]!;
      expect(sameText(card.waite.upright, source.meaningEn), `${id} waite.upright`).toBe(true);
      expect(sameText(card.waite.reversed, source.reversedEn), `${id} waite.reversed`).toBe(true);
      const kbLoc = card.sources.find((s) => s.id === "PKT-1910")!.loc;
      if (card.arcana === "major") {
        expect(card.waite.loc, id).toBe("PKT Part III §3");
        const roman = source.loc.match(/^Part II §2 (\S+) /)![1]!.replace("Zero", "0");
        expect(kbLoc, id).toBe(`Part II §2 ${roman}, Part III §3`);
      } else {
        expect(card.waite.loc, id).toBe("PKT Part III §2");
        const suit = source.loc.match(/^Part III §2 (\w+),/)![1]!.toLowerCase();
        expect(kbLoc, id).toBe(`Part III §2 ${suit}`);
      }
    }
  });
});

describe("Book T source file", () => {
  const bookT = () => readJson<{ source: Source; cards: Record<string, BookTCard> }>("content/kb/sources/book-t.json");

  it("covers all 78 cards with a locator, a title and an attribution", () => {
    const { source, cards } = bookT();
    expect(Object.keys(cards).sort()).toEqual([...IDS].sort());
    expect(source.urls.length).toBeGreaterThan(0);
    for (const id of IDS) {
      const card = cards[id]!;
      expect(card.loc.trim(), id).not.toBe("");
      expect(card.title.trim(), id).not.toBe("");
      expect(card.attribution.trim(), id).not.toBe("");
      if (id.startsWith("major-")) expect(card.letter?.hebrew, id).toMatch(/^[א-ת]$/);
    }
  });

  it("agrees with every astrological attribution the KB records", () => {
    const { cards } = bookT();
    for (const id of IDS) {
      const english = kb(id).attributions.astrology?.match(/\(([^)]+)\)$/)?.[1];
      if (!english) continue; // aces and court cards: the KB records none
      const stated = cards[id]!.attribution;
      if (id.startsWith("major-")) expect(stated.split(" and "), id).toContain(english);
      else expect(stated, id).toBe(english);
    }
  });
});

describe("evidence facts", () => {
  const facts = () => readJson<Fact[]>("content/evidence.json");

  it("are Korean 해요체 facts with unique ids that name no model or vendor", () => {
    const list = facts();
    expect(list.length).toBeGreaterThan(0);
    expect(new Set(list.map((f) => f.id)).size).toBe(list.length);
    for (const fact of list) {
      expect(["tarot", "saju"], fact.id).toContain(fact.area);
      for (const text of [fact.labelKo, fact.detailKo]) expect(text, fact.id).toMatch(HANGUL);
      expect(fact.valueKo.trim(), fact.id).not.toBe("");
      expect(fact.detailKo, fact.id).toMatch(/요\.$/);
      for (const text of [fact.labelKo, fact.valueKo, fact.detailKo]) {
        expect(text, fact.id).not.toMatch(MODEL_NAMES);
        expect(text, fact.id).not.toContain("—");
      }
    }
  });

  it("each point to a section that exists in a repo document", () => {
    for (const fact of facts()) {
      const [path, section] = fact.doc.split("#");
      expect(section, fact.id).toBeTruthy();
      expect(existsSync(repoPath(path!)), `${fact.id}: ${path}`).toBe(true);
      const text = readFileSync(repoPath(path!), "utf8");
      if (path!.endsWith(".json")) expect(Object.keys(JSON.parse(text) as object), fact.id).toContain(section);
      else expect(text.split(/\r?\n/), `${fact.id}: ${fact.doc}`).toContainEqual(expect.stringMatching(new RegExp(`^#{1,6} ${section!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`)));
    }
  });
});
