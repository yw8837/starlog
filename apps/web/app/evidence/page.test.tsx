// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import EvidencePage from "@/app/evidence/page";
import { MODEL_NAMES } from "@/lib/ai/style";
import { evidenceHref } from "@/lib/evidence";
import { INFO_PAGES } from "@/lib/infoPages";

afterEach(cleanup);

/** jsdom tests have no file: import.meta.url; vitest runs from the repo root or from apps/web. */
const readJson = <T,>(path: string): T => {
  const file = [path, `../../${path}`].map((p) => resolve(process.cwd(), p)).find((p) => existsSync(p)) ?? path;
  return JSON.parse(readFileSync(file, "utf8")) as T;
};

interface Fact { id: string; area: string; labelKo: string; valueKo: string; detailKo: string }
interface Source { year: number; urls: string[] }

const facts = readJson<Fact[]>("content/evidence.json");
const pkt = readJson<{ source: Source; cards: Record<string, unknown> }>("content/kb/sources/pkt.json");
const bookT = readJson<{ source: Source; cards: Record<string, unknown> }>("content/kb/sources/book-t.json");

const article = () => screen.getByRole("article");
const numbers = (text: string) => text.match(/\d[\d,.]*\d|\d/g) ?? [];

describe("스타로그의 근거", () => {
  it("has one h1 with the page title, and a section for tarot and for saju that the guide lines link to", () => {
    const { container } = render(<EvidencePage />);
    const h1s = container.querySelectorAll("h1");
    expect(h1s).toHaveLength(1);
    expect(h1s[0]?.textContent).toBe(INFO_PAGES.evidence.title);
    for (const area of ["tarot", "saju"] as const) {
      const id = evidenceHref(area).split("#")[1] ?? "";
      expect(container.querySelector(`section[id="${id}"]`), area).not.toBeNull();
    }
  });

  it("renders every fact of content/evidence.json in its area: its label as a heading, then its value and detail", () => {
    const { container } = render(<EvidencePage />);
    expect(facts.length).toBeGreaterThan(0);
    for (const fact of facts) {
      const section = container.querySelector(`section[id="${fact.area}"]`) as HTMLElement;
      const heading = within(section).getByRole("heading", { level: 3, name: fact.labelKo });
      const card = heading.parentElement as HTMLElement;
      const lines = [...card.querySelectorAll("p")].map((p) => p.textContent);
      expect(lines, fact.id).toContain(fact.valueKo);
      expect(lines, fact.id).toContain(fact.detailKo);
    }
  });

  it("shows no number that is not in content/evidence.json or the two source files", () => {
    render(<EvidencePage />);
    const allowed = new Set([
      ...numbers(JSON.stringify(facts)),
      ...numbers(JSON.stringify(pkt.source)),
      ...numbers(JSON.stringify(bookT.source)),
      String(Object.keys(pkt.cards).length),
      String(Object.keys(bookT.cards).length),
    ]);
    const shown = numbers(article().textContent ?? "");
    expect(shown.length).toBeGreaterThan(10);
    for (const n of shown) expect(allowed, n).toContain(n);
  });

  it("links the public-domain scans of Waite's book and of Book T", () => {
    render(<EvidencePage />);
    expect(screen.getByRole("link", { name: "원전 스캔 보기" }).getAttribute("href")).toBe(pkt.source.urls.find((url) => url.includes("Index:")));
    expect(screen.getByRole("link", { name: "Book T 스캔 보기" }).getAttribute("href")).toBe(bookT.source.urls[0]);
  });

  it("credits the birthplace map data in the source list, linked to OpenStreetMap's copyright page (ODbL)", () => {
    render(<EvidencePage />);
    const link = screen.getByRole("link", { name: "OpenStreetMap 기여자 (ODbL 1.0)" });
    expect(link.getAttribute("href")).toBe("https://www.openstreetmap.org/copyright");
    expect(link.closest("li")?.textContent).toBe("지도 데이터OpenStreetMap 기여자 (ODbL 1.0)출생지 161곳의 경도");
  });

  it("says how we write: quote the original, modern meanings in our own words, no school labels", () => {
    render(<EvidencePage />);
    const section = screen.getByRole("heading", { level: 2, name: "이렇게 써요" }).closest("section") as HTMLElement;
    const text = section.textContent ?? "";
    for (const words of ["원전", "직접 쓴 문장", "용신", "신강·신약"]) expect(text, words).toContain(words);
  });

  it("names no model or vendor and never says 베타", () => {
    const { container } = render(<EvidencePage />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(MODEL_NAMES);
    expect(text).not.toContain("베타");
    expect(INFO_PAGES.evidence.description).not.toMatch(MODEL_NAMES);
  });
});
