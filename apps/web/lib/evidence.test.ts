import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BIRTH_PLACE_CREDIT_URL, BIRTH_PLACE_ROWS } from "./birthPlaces";
import { MODERN_SOURCES, SAJU_SOURCE_LINE, cardQuote, cardSourceLine, evidenceHighlights, evidenceHref, evidenceItems, evidenceSources, modernSourceCount } from "./evidence";
import { INFO_PAGES } from "./infoPages";

/** What the evidence page and the guide source lines may say: content/evidence.json and the two source books. */
const repoPath = (path: string) => fileURLToPath(new URL(`../../../${path}`, import.meta.url));
const readJson = <T>(path: string): T => JSON.parse(readFileSync(repoPath(path), "utf8")) as T;

interface Fact { id: string; area: "tarot" | "saju"; labelKo: string; valueKo: string; detailKo: string }
interface Source { title: string; author?: string; year: number; edition: string; urls: string[] }
interface PktCard { loc: string; quoteKo: string }

const facts = readJson<Fact[]>("content/evidence.json");
const pkt = readJson<{ source: Source; cards: Record<string, PktCard> }>("content/kb/sources/pkt.json");
const bookT = readJson<{ source: Source; cards: Record<string, unknown> }>("content/kb/sources/book-t.json");
/** KASI's 24절기 minutes the core golden test checks the engine against (packages/core/tests/kasi-solar-terms.test.ts). */
const kasiTerms = readJson<{ sourceUrl: string; terms: Record<string, [string, string][]>; notes: { knownPlusOneMinute: { kasi: string; manseryeok: string }[] } }>(
  "packages/core/tests/fixtures/kasi-solar-terms-2021-2028.json",
);
const numbers = (text: string) => text.match(/\d[\d,.]*\d|\d/g) ?? [];

describe("evidence items", () => {
  it("show every fact of content/evidence.json once, in its own area, word for word", () => {
    for (const area of ["tarot", "saju"] as const) {
      const items = evidenceItems(area);
      for (const fact of facts.filter((f) => f.area === area)) {
        const found = items.filter((item) => item.id === fact.id);
        expect(found, fact.id).toHaveLength(1);
        expect(found[0], fact.id).toMatchObject({ labelKo: fact.labelKo, valueKo: fact.valueKo, detailKo: fact.detailKo });
      }
    }
    const shown = [...evidenceItems("tarot"), ...evidenceItems("saju")].map((item) => item.id);
    expect(new Set(shown).size).toBe(shown.length);
  });

  it("put the tarot sources in reading order: the 1909 scans, Waite's book, Book T, then the modern cross-check", () => {
    const ids = evidenceItems("tarot").map((item) => item.id);
    const at = (id: string) => ids.indexOf(id);
    expect(at("tarot-scan-basis")).toBe(0);
    expect(at("pkt")).toBe(1);
    expect(at("book-t")).toBe(2);
    expect(at("tarot-modern-sources")).toBeGreaterThan(at("book-t"));
    expect(evidenceItems("saju").map((item) => item.id)).not.toContain("pkt");
  });

  it("say nothing that undercuts trust: no draft, pending-review or could-not-check wording", () => {
    const text = [...evidenceItems("tarot"), ...evidenceItems("saju")].flatMap((item) => [item.labelKo, item.valueKo, item.detailKo]).join(" ");
    for (const word of ["아직", "초안", "1차", "검수", "못했", "못 했", "하지 못", "확인하지", "임시"]) expect(text, word).not.toContain(word);
  });

  it("take the books' years from the source files and link their public-domain scans", () => {
    const items = evidenceItems("tarot");
    const book = items.find((item) => item.id === "pkt");
    const goldenDawn = items.find((item) => item.id === "book-t");
    expect(book?.valueKo).toContain(`${pkt.source.year}년`);
    expect(book?.valueKo).toContain("The Pictorial Key to the Tarot");
    expect(book?.link?.href).toBe(pkt.source.urls.find((url) => url.includes("Index:")));
    expect(goldenDawn?.valueKo).toContain(`${bookT.source.year}년`);
    expect(goldenDawn?.link?.href).toBe(bookT.source.urls[0]);
    // Every number they show is in the source file they describe (years, the 78 cards, the reprint).
    for (const [item, source] of [[book, pkt], [goldenDawn, bookT]] as const) {
      const allowed = new Set([...numbers(JSON.stringify(source.source)), String(Object.keys(source.cards).length)]);
      for (const n of numbers(`${item?.valueKo} ${item?.detailKo}`)) expect(allowed, `${item?.id}: ${n}`).toContain(n);
    }
  });
});

describe("modern source count", () => {
  it("is the count the tarot-modern-sources fact states", () => {
    const fact = facts.find((f) => f.id === "tarot-modern-sources");
    expect(modernSourceCount()).toBeGreaterThan(0);
    expect(fact?.valueKo).toContain(`${modernSourceCount()}곳`);
  });
});

describe("card quote", () => {
  it("gives each card its own quoteKo and the locator of the picture text the quote comes from", () => {
    const ids = Object.keys(pkt.cards);
    expect(ids).toHaveLength(78);
    for (const id of ids) {
      const card = pkt.cards[id]!;
      const quote = cardQuote(id);
      expect(quote?.ko, id).toBe(card.quoteKo);
      // A trump's loc names its picture (Part II §2), then its meanings (Part III §3); the quote is from the picture.
      expect(card.loc.startsWith(quote?.loc ?? "-"), id).toBe(true);
      expect(quote?.loc, id).not.toContain(";");
      expect(quote?.loc, id).toMatch(id.startsWith("major-") ? /^Part II §2 / : /^Part III §2 /);
    }
  });

  it("has nothing for an id the PKT file does not have", () => {
    expect(cardQuote("major-99-nothing")).toBeNull();
    expect(cardSourceLine("major-99-nothing")).toBeNull();
  });
});

describe("source lines", () => {
  it("name the 1909 picture, Waite's book with the card's full locator and the modern references", () => {
    for (const [id, card] of Object.entries(pkt.cards)) {
      expect(cardSourceLine(id), id).toBe(`그림: 1909년 원판 · 원전: 웨이트 『The Pictorial Key to the Tarot』 ${card.loc} · 현대 해석 ${modernSourceCount()}곳 대조`);
    }
  });

  it("give saju articles their calendar basis", () => {
    expect(SAJU_SOURCE_LINE).toBe("달력: 한국천문연구원 음력 · NASA JPL 절입 시각 검증");
  });

  it("link to the evidence page's section for the area", () => {
    expect(evidenceHref("tarot")).toBe(`${INFO_PAGES.evidence.path}#tarot`);
    expect(evidenceHref("saju")).toBe(`${INFO_PAGES.evidence.path}#saju`);
  });

  it("state the KASI 절입 cross-check as the core fixture holds it: the count, the years, a minute at most, how many to the minute", () => {
    const fact = facts.find((f) => f.id === "saju-kasi-solar-terms");
    const years = Object.keys(kasiTerms.terms).map(Number);
    const count = Object.values(kasiTerms.terms).reduce((n, list) => n + list.length, 0);
    const exact = count - kasiTerms.notes.knownPlusOneMinute.length;
    const [first, last] = [Math.min(...years), Math.max(...years)];
    expect(fact).toMatchObject({ area: "saju", labelKo: "천문연 절입 시각 대조", valueKo: `${count}개` });
    expect(fact?.detailKo).toContain(`한국천문연구원이 공개한 ${first}~${last}년`);
    // "1분 이내" for all of them, so it does not read as under a minute next to the 32.7초 fact before it
    expect(fact?.detailKo).toContain(`${count}개 모두 1분 이내로 맞았고, 그중 ${exact}개는 분까지 같아요.`);
    // every number it says comes from the fixture: the years, the 24 terms a year, the count, the one minute, the exact ones
    for (const n of numbers(fact?.detailKo ?? "")) expect([String(first), String(last), "24", String(count), "1", String(exact)], n).toContain(n);
    // the fixture's only differences are the listed ones, each a single minute (the core test checks the engine)
    const minute = (kst: string) => Date.parse(`${kst.replace(" ", "T")}:00Z`) / 60_000;
    expect(kasiTerms.notes.knownPlusOneMinute.every((d) => minute(d.manseryeok) - minute(d.kasi) === 1)).toBe(true);
    expect(kasiTerms.sourceUrl).toContain("astro.kasi.re.kr");
    // it stands with the other 절입 facts, right after the largest difference
    const ids = evidenceItems("saju").map((item) => item.id);
    expect(ids.indexOf("saju-kasi-solar-terms")).toBe(ids.indexOf("saju-solar-term-max") + 1);
  });

  it("draw the top numbers and the source list from the data, never typed twice", () => {
    const fact = (id: string) => facts.find((f) => f.id === id)!;
    const tiles = evidenceHighlights().map((t) => t.value);
    expect(tiles).toEqual([`${Object.keys(pkt.cards).length}장`, `${modernSourceCount()}곳`, fact("saju-wide-sweep").valueKo, fact("saju-solar-term-max").valueKo]);
    expect(fact("saju-solar-term-max").detailKo).toContain("1929~2026");
    expect(MODERN_SOURCES).toHaveLength(modernSourceCount());
    for (const name of MODERN_SOURCES) expect(fact("tarot-modern-sources").detailKo, name).toContain(name);
    const rows = evidenceSources();
    expect(rows.find((r) => r.kind === "만세력")?.title).toContain(fact("saju-engine").valueKo);
    expect(fact("saju-engine").detailKo).toContain("11종");
    expect(rows.map((r) => r.title).join(" ")).toContain("KASI");
    expect(fact("saju-jpl-horizons").valueKo).toBe("NASA JPL Horizons");
  });

  it("credit the birthplace longitudes to OpenStreetMap under ODbL 1.0, linked, with the count the list holds", () => {
    const fact = facts.find((f) => f.id === "saju-birth-places");
    const count = `${BIRTH_PLACE_ROWS.length}곳`;
    expect(fact).toMatchObject({ area: "saju", valueKo: count });
    for (const words of [count, "OpenStreetMap", "ODbL 1.0"]) expect(fact?.detailKo, words).toContain(words);
    expect(evidenceSources().find((row) => row.kind === "지도 데이터")).toEqual({
      kind: "지도 데이터", title: "OpenStreetMap 기여자 (ODbL 1.0)", note: `출생지 ${count}의 경도`, href: BIRTH_PLACE_CREDIT_URL,
    });
    expect(BIRTH_PLACE_CREDIT_URL).toBe("https://www.openstreetmap.org/copyright");
    // it stands with the other clock facts, after the DST one
    const ids = evidenceItems("saju").map((item) => item.id);
    expect(ids.indexOf("saju-birth-places")).toBe(ids.indexOf("saju-daylight-saving") + 1);
  });
});
