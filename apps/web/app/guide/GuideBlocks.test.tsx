// @vitest-environment jsdom
import { TEMPLATES, getCard } from "@starlog/core";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DECK_KEY } from "@/lib/deck";
import type { GuideBlock } from "@/lib/guideMeta";
import { CELTIC_CROSS_POSITIONS } from "./GuideDiagram";
import { GuideBlocks } from "./GuideBlocks";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const show = (...blocks: GuideBlock[]) => render(<GuideBlocks blocks={blocks} id="s1" />).container;
const texts = (nodes: Iterable<Element>) => [...nodes].map((node) => node.textContent);

describe("guide blocks", () => {
  it("p: a paragraph of its text", () => {
    const root = show({ kind: "p", text: "둘째 문단이에요." });
    expect(texts(root.querySelectorAll("p"))).toEqual(["둘째 문단이에요."]);
  });

  it("list: bullets, or numbers when ordered", () => {
    const root = show({ kind: "list", items: ["하나", "둘"] }, { kind: "list", ordered: true, items: ["먼저", "다음"] });
    expect(texts(root.querySelectorAll("ul > li"))).toEqual(["하나", "둘"]);
    expect(texts(root.querySelectorAll("ol > li"))).toEqual(["먼저", "다음"]);
  });

  it("table: a captioned table with column and row headers, in a keyboard-scrollable region named by its caption", () => {
    show({ kind: "table", caption: "오행과 계절", head: ["오행", "천간", "계절"], rows: [["목(木)", "갑·을", "봄"], ["화(火)", "병·정", "여름"]] });
    const table = screen.getByRole("table", { name: "오행과 계절" });
    expect(table.querySelector("caption")?.textContent).toBe("오행과 계절");
    const columns = within(table).getAllByRole("columnheader");
    expect(texts(columns)).toEqual(["오행", "천간", "계절"]);
    for (const th of columns) expect(th.getAttribute("scope")).toBe("col");
    const rowHeads = within(table).getAllByRole("rowheader");
    expect(texts(rowHeads)).toEqual(["목(木)", "화(火)"]);
    for (const th of rowHeads) expect(th.getAttribute("scope")).toBe("row");
    expect(texts(within(table).getAllByRole("cell"))).toEqual(["갑·을", "봄", "병·정", "여름"]);
    const region = screen.getByRole("region", { name: "오행과 계절" });
    expect(region.contains(table)).toBe(true);
    expect(region.tabIndex).toBe(0);
  });

  it("table: short columns keep one line, the tightest even on a phone; long ones (headers and the first column too) wrap", () => {
    show({
      kind: "table",
      caption: "줄바꿈",
      head: ["벌", "한 줄로 둘 만한 칸", "아주 길어서 줄을 바꿔야 하는 머리글"],
      rows: [["완드", "밝게 열리는 카드", "짧음"], ["컵", "멈추고 기다리는 카드", "길게 이어지는 설명이 들어가는 칸이에요"]],
    });
    const table = screen.getByRole("table", { name: "줄바꿈" });
    const [tight, short, long] = within(table).getAllByRole("columnheader").map((th) => th.className);
    expect(tight).toMatch(/nowrap/);
    expect(tight).toMatch(/tight/);
    expect(short).toMatch(/nowrap/);
    expect(short).not.toMatch(/tight/);
    expect(long).toBe("");
    expect(within(table).getAllByRole("rowheader")[0]!.className).toMatch(/tight/);
    expect(within(table).getAllByRole("cell").map((td) => td.className)).toEqual([short, "", short, ""]);
  });

  it("figure: a lazy image with its alt and real size, and its caption", () => {
    show({ kind: "figure", src: "/cards/major-17-star.webp", alt: "별 카드 그림", width: 600, height: 1027, caption: "XVII 별" });
    const img = screen.getByRole("img", { name: "별 카드 그림" });
    expect([img.getAttribute("src"), img.getAttribute("width"), img.getAttribute("height"), img.getAttribute("loading")]).toEqual([
      "/cards/major-17-star.webp",
      "600",
      "1027",
      "lazy",
    ]);
    expect(screen.getByRole("figure").querySelector("figcaption")?.textContent).toBe("XVII 별");
  });

  it("callout: a note naming its tone, then its title and text", () => {
    show(
      { kind: "callout", tone: "tip", title: "개수가 0이어도", text: "지장간에 숨어 있을 수 있어요." },
      { kind: "callout", tone: "note", title: "웨이트의 방식", text: "카드를 덮었어요." },
      { kind: "callout", tone: "caution", title: "중요한 결정은", text: "전문가와 꼭 상의해 주세요." },
    );
    const notes = screen.getAllByRole("note");
    expect(notes.map((note) => note.getAttribute("data-tone"))).toEqual(["tip", "note", "caution"]);
    expect(texts(notes)).toEqual(["도움말개수가 0이어도지장간에 숨어 있을 수 있어요.", "참고웨이트의 방식카드를 덮었어요.", "주의중요한 결정은전문가와 꼭 상의해 주세요."]);
  });

  it("steps: a numbered list, each step its title and text", () => {
    show({ kind: "steps", items: [{ title: "자리 확인하기", text: "자리를 봐요." }, { title: "그림 살피기", text: "그림을 봐요." }] });
    const steps = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(steps).toHaveLength(2);
    expect(screen.getByRole("list").tagName).toBe("OL");
    expect(texts(steps.map((step) => step.querySelector("p") as Element))).toEqual(["자리 확인하기", "그림 살피기"]);
    expect(steps[1]?.textContent).toContain("그림을 봐요.");
  });

  it("cardRow: each card's picture and name, in order, with the caption", () => {
    const root = show({ kind: "cardRow", cards: ["major-00-fool", "major-01-magician", "major-02-high-priestess"], caption: "메이저 아르카나 0~2번" });
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(["바보", "마법사", "여사제"]);
    expect([...root.querySelectorAll("img")].map((img) => img.getAttribute("src"))).toContain("/cards/major-01-magician-sm.webp");
    expect([...root.querySelectorAll("img")].every((img) => img.getAttribute("loading") === "lazy")).toBe(true);
    expect(root.querySelector("figcaption")?.textContent).toBe("메이저 아르카나 0~2번");
  });

  it("cardRow: each face is named by its card's Korean name (image search), each back stays empty (decorative)", () => {
    const root = show({ kind: "cardRow", cards: ["major-00-fool", "wands-01"] });
    const images = [...root.querySelectorAll("img")];
    const faces = images.filter((img) => !img.getAttribute("src")?.includes("/backs/"));
    const backs = images.filter((img) => img.getAttribute("src")?.includes("/backs/"));
    expect(faces.map((img) => img.getAttribute("alt"))).toEqual([getCard("major-00-fool").names.ko, getCard("wands-01").names.ko]);
    expect(backs).toHaveLength(2);
    expect(backs.map((img) => img.getAttribute("alt"))).toEqual(["", ""]);
  });

  it("cardRow: the pictures are the 1909 scans, whatever deck the visitor chose; only the backs follow the choice", () => {
    localStorage.setItem(DECK_KEY, JSON.stringify({ front: "starlog", back: "navy-gold" }));
    const root = show({ kind: "cardRow", cards: ["major-00-fool", "wands-01"] });
    expect([...root.querySelectorAll("img")].map((img) => img.getAttribute("src"))).toEqual([
      "/cards/backs/navy-gold-sm.webp",
      "/cards/major-00-fool-sm.webp",
      "/cards/backs/navy-gold-sm.webp",
      "/cards/wands-01-sm.webp",
    ]);
  });

  it("diagram five-elements: an SVG picture with a title and description, the five elements with their Hanja, and a legend", () => {
    const root = show({ kind: "diagram", name: "five-elements", caption: "오행의 상생과 상극" });
    const svg = screen.getByRole("img", { name: "오행의 상생과 상극" });
    expect(svg.tagName.toLowerCase()).toBe("svg");
    // Named by its title, described by its desc.
    expect(svg.getAttribute("aria-describedby")).toBe(svg.querySelector("desc")?.id);
    expect(svg.querySelector("desc")?.textContent).toContain("목에서 화, 화에서 토, 토에서 금, 금에서 수, 수에서 다시 목");
    expect(svg.querySelector("desc")?.textContent).toContain("목에서 토, 토에서 수, 수에서 화, 화에서 금, 금에서 다시 목");
    for (const glyph of ["목", "木", "화", "火", "토", "土", "금", "金", "수", "水"]) expect(svg.textContent).toContain(glyph);
    expect(texts(root.querySelectorAll("figure > ul > li"))).toEqual(["상생: 살리는 관계", "상극: 누르는 관계"]);
    expect(root.querySelector("figcaption")?.textContent).toBe("오행의 상생과 상극");
  });

  it("diagram three-card: the spread's three positions from the app's own templates, left to right", () => {
    for (const spread of ["self-flow", "relationship-contact", "choice"] as const) {
      const root = show({ kind: "diagram", name: "three-card", spread });
      const positions = TEMPLATES[spread].positions;
      expect(texts(root.querySelectorAll("figure > ol > li"))).toEqual(positions);
      expect(screen.getByRole("img").querySelector("desc")?.textContent).toBe(`왼쪽부터 1번 ${positions[0]}, 2번 ${positions[1]}, 3번 ${positions[2]} 자리에 카드를 한 장씩 놓아요.`);
      cleanup();
    }
  });

  it("diagram celtic-cross: ten numbered places and a legend with the names the article uses", () => {
    const root = show({ kind: "diagram", name: "celtic-cross" });
    const svg = screen.getByRole("img", { name: "켈틱 크로스 열 자리" });
    expect([...svg.querySelectorAll("text")].map((t) => t.textContent)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
    expect(texts(root.querySelectorAll("figure > ol > li"))).toEqual(CELTIC_CROSS_POSITIONS.map((name, i) => `${i + 1}${name}`));
  });

  it("diagram daewoon: generic 10-year bands with yearly ticks, no personal data", () => {
    const root = show({ kind: "diagram", name: "daewoon" });
    const svg = screen.getByRole("img", { name: "대운과 세운" });
    expect(svg.textContent).toContain("첫 대운");
    expect(svg.querySelectorAll("[data-tick]")).toHaveLength(30);
    expect(texts(root.querySelectorAll("figure > ul > li"))).toEqual(["칸 하나: 대운 10년", "눈금 하나: 세운 1년"]);
    // No birth year, age or ganzhi of anyone: only the generic marks.
    expect(svg.textContent).not.toMatch(/\d{4}|[甲乙丙丁戊己庚辛壬癸]/);
  });

  it("keeps every id unique when one section shows several diagrams and tables", () => {
    const root = show(
      { kind: "diagram", name: "five-elements" },
      { kind: "diagram", name: "five-elements" },
      { kind: "table", caption: "가", head: ["a", "b"], rows: [["1", "2"]] },
      { kind: "table", caption: "나", head: ["a", "b"], rows: [["1", "2"]] },
    );
    const ids = [...root.querySelectorAll("[id]")].map((el) => el.id);
    expect(ids.length).toBeGreaterThan(4);
    expect(new Set(ids).size).toBe(ids.length);
    // Every name and description reference points at an element that is there.
    for (const el of root.querySelectorAll("[aria-labelledby], [aria-describedby]")) {
      const refs = `${el.getAttribute("aria-labelledby") ?? ""} ${el.getAttribute("aria-describedby") ?? ""}`.trim().split(/\s+/);
      for (const ref of refs) expect(root.querySelector(`#${ref}`), ref).not.toBeNull();
    }
  });
});
