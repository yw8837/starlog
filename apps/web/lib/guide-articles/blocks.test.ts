import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BRANCHES, BRANCHES_KO, BRANCH_ELEMENTS, STEMS, STEMS_KO, STEM_ELEMENTS, TEMPLATES, computeChart, getCard, type SajuElement } from "@starlog/core";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { CELTIC_CROSS_POSITIONS } from "@/app/guide/GuideDiagram";
import { DAY_MASTER_IMAGE, ELEMENT_HANJA, ORDER, SEASON } from "../ai/prompts/saju";
import { GUIDE_ARTICLES, findArticle, guideSectionText, type GuideArticle, type GuideBlock } from "../guide";

/**
 * Rules for the rich blocks (lib/guideMeta.ts GuideBlock) every article can use, and the tables of the
 * converted articles checked against the chart engine (@starlog/core), the reading prompts' tables
 * (lib/ai/prompts/saju.ts) and the card KB (content/kb/cards).
 */

const PUBLIC = fileURLToPath(new URL("../../public", import.meta.url));
const HAEYO = /[요죠][.?]$/;
const blocksOf = (article: GuideArticle) => article.sections.flatMap((section) => section.blocks ?? []);

type Table = Extract<GuideBlock, { kind: "table" }>;
function tableIn(slug: string, caption: string): Table {
  const table = blocksOf(findArticle(slug) as GuideArticle).find((block): block is Table => block.kind === "table" && block.caption === caption);
  if (!table) throw new Error(`${slug}: no table "${caption}"`);
  return table;
}

interface KbCard {
  keywordsKo: string[];
  core: { upright: string[]; reversed: string[]; oneLine: { upright: string; reversed: string } };
  imagery: { commonMisdescriptions: { wrong: string; regex: string }[] };
}
const kbCard = (cardId: string): KbCard =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../../../content/kb/cards/${cardId}.json`, import.meta.url)), "utf8")) as KbCard;

describe("guide blocks: authoring rules", () => {
  it.each(GUIDE_ARTICLES.map((article) => [article.slug, article] as const))("%s", async (_slug, article) => {
    if (article.keyPoints) {
      expect(article.keyPoints).toHaveLength(3);
      expect(new Set(article.keyPoints).size).toBe(3);
      for (const point of article.keyPoints) {
        expect(point.length, point).toBeGreaterThanOrEqual(8);
        expect(point.length, point).toBeLessThanOrEqual(60);
        expect(point, point).toMatch(HAEYO);
      }
    }
    for (const block of blocksOf(article)) {
      switch (block.kind) {
        case "p":
          expect(block.text).toMatch(HAEYO);
          break;
        case "list":
          expect(block.items.length).toBeGreaterThanOrEqual(2);
          for (const item of block.items) expect(item.trim()).not.toBe("");
          break;
        case "table":
          expect(block.caption.trim()).not.toBe("");
          expect(block.head.length).toBeGreaterThanOrEqual(2);
          expect(block.rows.length).toBeGreaterThanOrEqual(2);
          for (const cell of [...block.head, ...block.rows.flat()]) expect(cell.trim(), block.caption).not.toBe("");
          for (const row of block.rows) expect(row, block.caption).toHaveLength(block.head.length);
          break;
        case "figure": {
          // A file under public/, with its real size so the page never jumps when it loads.
          expect(block.src).toMatch(/^\/[\w./-]+$/);
          const file = `${PUBLIC}${block.src}`;
          expect(existsSync(file), block.src).toBe(true);
          const { width, height } = await sharp(file).metadata();
          expect([block.width, block.height], block.src).toEqual([width, height]);
          expect(block.alt.trim()).not.toBe("");
          // A card scan's alt must not repeat a known misdescription of that scan (KB R3).
          const card = /^\/cards\/([a-z0-9-]+)\.webp$/.exec(block.src)?.[1];
          if (card) for (const mis of kbCard(card).imagery.commonMisdescriptions) expect(block.alt, mis.wrong).not.toMatch(new RegExp(mis.regex));
          break;
        }
        case "callout":
          expect(["tip", "note", "caution"]).toContain(block.tone);
          expect(block.title.trim()).not.toBe("");
          expect(block.text).toMatch(HAEYO);
          break;
        case "steps":
          expect(block.items.length).toBeGreaterThanOrEqual(2);
          for (const step of block.items) {
            expect(step.title.trim()).not.toBe("");
            expect(step.text).toMatch(HAEYO);
          }
          break;
        case "cardRow":
          expect(article.category).toBe("tarot");
          expect(block.cards.length).toBeGreaterThanOrEqual(2);
          expect(block.cards.length).toBeLessThanOrEqual(5);
          for (const id of block.cards) expect(() => getCard(id), id).not.toThrow();
          break;
        case "diagram":
          if (block.name === "three-card") expect(TEMPLATES[block.spread].positions).toHaveLength(3);
          break;
      }
    }
  });
});

describe("the converted articles' tables agree with the engine, the reading tables and the KB", () => {
  const hanja = (element: SajuElement) => `${element}(${ELEMENT_HANJA[element]})`;
  const sorted = (cell: string) => cell.split("·").sort();
  /** "봄이 시작되는 달" → "봄": the season of a month branch in the reading prompts' table. */
  const seasonOf = (branch: (typeof BRANCHES)[number]) => SEASON[branch].split(/이 |의 /)[0];

  it("five-elements: each 오행's stems and branches are the engine's, its season the month table's, its colour the article's", () => {
    const table = tableIn("five-elements", "오행과 글자, 계절, 색");
    expect(table.head).toEqual(["오행", "천간", "지지", "계절", "전통 색"]);
    expect(table.rows.map((row) => row[0])).toEqual(ORDER);
    const colours = findArticle("five-elements")?.sections.find((section) => section.heading === "화면의 색")?.body ?? "";
    for (const [i, element] of ORDER.entries()) {
      const [, stems = "", branches = "", season = "", colour = ""] = table.rows[i] ?? [];
      expect(sorted(stems), element).toEqual(STEMS_KO.filter((_, k) => STEM_ELEMENTS[k] === element).sort());
      const own = BRANCHES.filter((_, k) => BRANCH_ELEMENTS[k] === element);
      expect(sorted(branches), element).toEqual(own.map((b) => BRANCHES_KO[BRANCHES.indexOf(b)]).sort());
      // 토 holds the last month of every season (진·미·술·축); the others hold one season's first two months.
      if (element === "토") {
        expect(season).toBe("환절기");
        for (const branch of own) expect(SEASON[branch], branch).toContain("끝나 가는 달");
      } else {
        for (const branch of own) expect(seasonOf(branch), branch).toBe(season);
      }
      expect(colours, element).toMatch(new RegExp(`${element}[은는] ${colour}`));
    }
  });

  it("heavenly-stems: the ten stems in order, with the engine's 오행 and yang on the odd places (the polarity the ten gods use)", () => {
    const table = tableIn("heavenly-stems", "천간 열 글자");
    expect(table.head).toEqual(["천간", "오행", "음양"]);
    expect(table.rows).toEqual(STEMS.map((stem, i) => [`${STEMS_KO[i]}(${stem})`, STEM_ELEMENTS[i], i % 2 === 0 ? "양" : "음"]));
    // The images the article lists stem by stem are the reading prompts' day-master images.
    const text = findArticle("heavenly-stems")?.sections.map(guideSectionText).join("\n") ?? "";
    for (const [i, stem] of STEMS.entries()) expect(text, stem).toMatch(new RegExp(`${STEMS_KO[i]}[은는] ${DAY_MASTER_IMAGE[stem]}`));
  });

  it("heavenly-stems: a year's last digit gives its stem, as the engine's year pillars do (mid-year, after 입춘)", () => {
    const table = tableIn("heavenly-stems", "연도 끝자리로 찾는 해의 천간");
    expect(table.head).toEqual(["연도 끝자리", "천간"]);
    const byDigit = new Map<string, string>();
    for (const [digits = "", stems = ""] of table.rows) {
      const ds = digits.split(", ");
      const ss = stems.split(", ");
      expect(ds.length).toBe(ss.length);
      ds.forEach((d, i) => byDigit.set(d, ss[i] as string));
    }
    expect([...byDigit.keys()].sort()).toEqual(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);
    for (let year = 2020; year <= 2029; year++) {
      const chart = computeChart({ calendar: "solar", year, month: 7, day: 1, time: { hour: 12, minute: 0 }, gender: "female", place: { name: "서울", longitude: 126.978 } });
      expect(byDigit.get(String(year % 10)), String(year)).toBe(STEMS_KO[STEMS.indexOf(chart.pillars.year.stem as (typeof STEMS)[number])]);
    }
  });

  it("earthly-branches: the twelve branches in order, with the engine's 오행 and the month table's seasons", () => {
    const table = tableIn("earthly-branches", "지지 열두 글자 (시간은 보정한 시각)");
    expect(table.head).toEqual(["지지", "띠", "오행", "계절", "시간"]);
    expect(table.rows.map((row) => row[0])).toEqual(BRANCHES.map((branch, i) => `${BRANCHES_KO[i]}(${branch})`));
    expect(table.rows.map((row) => row[2])).toEqual(BRANCH_ELEMENTS);
    expect(table.rows.map((row) => row[3])).toEqual(BRANCHES.map(seasonOf));
    // 띠: the twelve animals in the order the article has always listed them (쥐 to 돼지).
    expect(table.rows.map((row) => row[1])).toEqual(["쥐", "소", "호랑이", "토끼", "용", "뱀", "말", "양", "원숭이", "닭", "개", "돼지"]);
  });

  it("earthly-branches: each 시진 is two hours from 23시 (자) on the corrected clock, as the engine's hour pillar has it", () => {
    const table = tableIn("earthly-branches", "지지 열두 글자 (시간은 보정한 시각)");
    const ranges = table.rows.map((row) => {
      const m = /^(\d+)시~(\d+)시$/.exec(row[4] ?? "");
      if (!m) throw new Error(`hours "${row[4]}"`);
      return [Number(m[1]), Number(m[2])] as const;
    });
    expect(ranges).toEqual(BRANCHES.map((_, i) => [(23 + 2 * i) % 24, (1 + 2 * i) % 24]));
    // Wall clock every 20 minutes through a day in Seoul (about 32 minutes of correction), off the boundaries.
    for (let minutes = 10; minutes < 24 * 60; minutes += 20) {
      const chart = computeChart({
        calendar: "solar", year: 2024, month: 6, day: 15, time: { hour: Math.floor(minutes / 60), minute: minutes % 60 }, gender: "female", place: { name: "서울", longitude: 126.978 },
      });
      const [hh = 0, mm = 0] = (chart.correctedLocalTime ?? "").split(":").map(Number);
      const clock = hh * 60 + mm;
      const branch = BRANCHES.indexOf(chart.pillars.hour?.branch as (typeof BRANCHES)[number]);
      const [from, to] = ranges[branch] ?? [0, 0];
      const inRange = from < to ? clock >= from * 60 && clock < to * 60 : clock >= from * 60 || clock < to * 60;
      expect(inRange, `${chart.correctedLocalTime} → ${BRANCHES_KO[branch]}시`).toBe(true);
    }
  });

  it("upright-and-reversed: the Star's comparison quotes the KB, next to the Star's own scan", () => {
    const kb = kbCard("major-17-star");
    const table = tableIn("upright-and-reversed", "별 카드를 정방향과 역방향으로 읽으면");
    expect(table.head).toEqual(["구분", "정방향", "역방향"]);
    expect(table.rows[0]).toEqual(["한 줄로", kb.core.oneLine.upright, kb.core.oneLine.reversed]);
    const [, upright = "", reversed = ""] = table.rows[1] ?? [];
    for (const word of upright.split(", ")) expect(kb.core.upright, word).toContain(word);
    for (const word of reversed.split(", ")) expect(kb.core.reversed, word).toContain(word);
    expect(blocksOf(findArticle("upright-and-reversed") as GuideArticle).some((block) => block.kind === "figure" && block.src === "/cards/major-17-star.webp")).toBe(true);
  });

  it("card articles: the keyword table quotes the card's KB word for word, and a card row shows the card", () => {
    const withoutTable: string[] = [];
    for (const article of GUIDE_ARTICLES.filter((a) => a.cardId)) {
      const cardId = article.cardId as string;
      const table = blocksOf(article).find((block): block is Table => block.kind === "table" && block.caption === `${getCard(cardId).names.ko} 카드의 키워드`);
      if (!table) {
        withoutTable.push(article.slug);
        continue;
      }
      const kb = kbCard(cardId);
      expect(table.head, article.slug).toEqual(["구분", "정방향", "역방향"]);
      expect(table.rows, article.slug).toEqual([
        ["한 줄로", kb.core.oneLine.upright, kb.core.oneLine.reversed],
        ["핵심 낱말", kb.keywordsKo.join(", "), kb.core.reversed.join(", ")],
      ]);
      expect(blocksOf(article).some((block) => block.kind === "cardRow" && block.cards.includes(cardId)), article.slug).toBe(true);
    }
    // Every card article has it, 은둔자 and 별 in lib/guide.ts too (은둔자 had no blocks until 2026-10-08).
    expect(withoutTable).toEqual([]);
  });

  it("celtic-cross-spread: the tables name the ten places as the diagram's legend does, in order", () => {
    const cross = tableIn("celtic-cross-spread", "십자 모양의 여섯 자리");
    const staff = tableIn("celtic-cross-spread", "오른쪽 기둥의 네 자리");
    expect([...cross.rows, ...staff.rows].map((row) => row[0])).toEqual(CELTIC_CROSS_POSITIONS.map((name, i) => `${i + 1}번 ${name}`));
  });

  it("how-to-read-tarot: the four suits with the element their cards carry and the area the suit articles give them", () => {
    const table = tableIn("how-to-read-tarot", "마이너 아르카나의 네 벌");
    expect(table.head).toEqual(["벌", "원소", "주로 읽는 영역"]);
    const ELEMENT_KO = { fire: "불", water: "물", air: "공기", earth: "흙" } as const;
    // The minor arcana overview compares the four suits in one table, with the same element and area.
    const compare = tableIn("minor-arcana-suits", "네 벌 비교");
    expect(compare.head.slice(2, 4)).toEqual(["원소", "다루는 영역"]);
    for (const [i, suit] of (["wands", "cups", "swords", "pentacles"] as const).entries()) {
      const [name = "", element = "", area = ""] = table.rows[i] ?? [];
      expect(element, name).toBe(ELEMENT_KO[getCard(`${suit}-01`).element as keyof typeof ELEMENT_KO]);
      expect(compare.rows[i]?.slice(2, 4), name).toEqual([element, area]);
    }
  });
});
