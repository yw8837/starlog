import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  BRANCHES, STEMS, STEMS_KO, STEM_ELEMENTS, bondBasis, bondScore, computeChart, ganzhiKo, mainHiddenStem, shiftGanzhi, type SajuChart,
} from "@starlog/core";
import { describe, expect, it } from "vitest";
import { elementMeeting } from "../ai/prompts/match";
import { DAY_MASTER_IMAGE, SEASON, branchRelations, stemRelations, tenGod, twelveStage } from "../ai/prompts/saju";
import { aiTells } from "../ai/style";
import { SITE } from "../config";
import { findArticle, guideSectionText, type GuideArticle, type GuideBlock } from "../guide";
import { isQuestion } from "../jsonld";
import { KEYWORD_PATH, iljuBySlug } from "../keyword2027";
import { DAY_MASTER_ARTICLES } from "./day-masters";
import { SAJU_ARTICLES } from "./saju";
import { SAJU_CONCEPT_ARTICLES } from "./saju-concepts";

/**
 * The saju guides as AdSense reads them (scaled content, helpful content): the ten day-master pages are not
 * one outline with the stem swapped, every worked example is what the engine computes, FAQ answers open with
 * the answer, and every page leads on to others.
 */

const UPDATED = "2026-10-23";
const APP = fileURLToPath(new URL("../../app", import.meta.url));
const full = (slug: string) => findArticle(slug) as GuideArticle;
const DAY_MASTERS = DAY_MASTER_ARTICLES.map((article) => full(article.slug));
const CONCEPTS = [...SAJU_ARTICLES, ...SAJU_CONCEPT_ARTICLES].map((article) => full(article.slug));
const ALL = [...CONCEPTS, ...DAY_MASTERS];

const sentences = (text: string) => text.split(/(?<=[.?!])\s+/).map((s) => s.trim()).filter(Boolean);
const firstSentence = (text: string) => sentences(text)[0] ?? "";
const bodyText = (article: GuideArticle) => article.sections.map(guideSectionText).join("\n");
const blocksOf = (article: GuideArticle) => article.sections.flatMap((section) => section.blocks ?? []);
type Table = Extract<GuideBlock, { kind: "table" }>;
const tables = (article: GuideArticle) => blocksOf(article).filter((block): block is Table => block.kind === "table");
/** Headings, table captions, callout and step titles: where an example says it is one. */
const labels = (article: GuideArticle) =>
  article.sections.flatMap((section) => [
    section.heading,
    ...(section.blocks ?? []).flatMap((block) =>
      block.kind === "table" ? [block.caption] : block.kind === "callout" ? [block.title] : block.kind === "steps" ? block.items.map((step) => step.title) : [],
    ),
  ]);
/** The prose a reader reads (no table cells or captions): what a template would repeat. */
function proseUnits(article: GuideArticle): string[] {
  return [
    article.title, article.description, article.summary ?? "", ...(article.keyPoints ?? []),
    ...article.sections.flatMap((section) => [
      section.heading, section.body,
      ...(section.blocks ?? []).flatMap((block) =>
        block.kind === "p" ? [block.text] : block.kind === "list" ? [...block.items] : block.kind === "callout" ? [block.title, block.text] : block.kind === "steps" ? block.items.flatMap((step) => [step.title, step.text]) : [],
      ),
    ]),
  ];
}

const SEOUL = { name: "서울", longitude: 126.978 };
const at = (year: number, month: number, day: number, hour: number | null, minute = 0, gender: "female" | "male" = "female", place = SEOUL) =>
  computeChart({ calendar: "solar", year, month, day, time: hour === null ? null : { hour, minute }, gender, place });
const KEYS = ["year", "month", "day", "hour"] as const;
const PLACE = { year: "연주", month: "월주", day: "일주", hour: "시주" } as const;
const pillarLine = (chart: SajuChart) => KEYS.map((k) => chart.pillars[k]?.ko).join("·");
const clock = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}시 ${m}분`;
};
/** A 절 instant in Korea: "2월 4일 오후 5시 27분". */
function kst(iso: string): string {
  const d = new Date(Date.parse(iso) + 9 * 3_600_000);
  const h = d.getUTCHours();
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${h < 12 ? "오전" : "오후"} ${h % 12 === 0 ? 12 : h % 12}시 ${d.getUTCMinutes()}분`;
}
const kstDate = (iso: string) => kst(iso).split(" ").slice(0, 2).join(" ");

/** "예시 명식 · 1996년 2월 7일 오전 7시 20분 서울 출생 (가상의 인물)": the example tables' caption, parsed back into the input. */
const EXAMPLE_CAPTION = /^예시 명식 · (\d{4})년 (\d{1,2})월 (\d{1,2})일 (오전|오후) (\d{1,2})시 (\d{1,2})분 서울 출생 \(가상의 인물\)$/;
function exampleChart(table: Table): SajuChart {
  const m = EXAMPLE_CAPTION.exec(table.caption);
  if (!m) throw new Error(`caption "${table.caption}"`);
  const [, y, mo, d, half, h, mi] = m;
  const hour = Number(h) % 12 + (half === "오후" ? 12 : 0);
  return at(Number(y), Number(mo), Number(d), hour, Number(mi));
}
/** The pillar table every example uses: 기둥, 간지 with its hanja, the stem's and the branch's ten god. */
function expectPillarTable(table: Table, chart: SajuChart) {
  expect(table.head).toEqual(["기둥", "간지", "천간 십신", "지지 십신"]);
  expect(table.rows).toEqual(
    KEYS.map((k) => {
      const p = chart.pillars[k];
      if (!p) throw new Error(`${table.caption}: no ${k} pillar`);
      return [PLACE[k], `${p.ko}(${p.stem}${p.branch})`, k === "day" ? "일간(나)" : p.stemGod, p.branchGod];
    }),
  );
  // An example sits on no boundary: another calendar would give the same eight characters.
  expect(chart.warnings.map((w) => w.code), table.caption).toEqual([]);
  expect(chart.ambiguous, table.caption).toEqual([]);
}

// ---- day masters ----

const nameOf = (stem: string) => `${STEMS_KO[STEMS.indexOf(stem as (typeof STEMS)[number])]}${STEM_ELEMENTS[STEMS.indexOf(stem as (typeof STEMS)[number])]}`;
const DAY_MASTER_STEM: Readonly<Record<string, string>> = {
  "day-master-gapmok": "甲", "day-master-eulmok": "乙", "day-master-byeonghwa": "丙", "day-master-jeonghwa": "丁", "day-master-muto": "戊",
  "day-master-gito": "己", "day-master-gyeonggeum": "庚", "day-master-singeum": "辛", "day-master-imsu": "壬", "day-master-gyesu": "癸",
};
const partner = (stem: string, type: string) =>
  STEMS.find((other) => other !== stem && stemRelations({ glyph: stem, at: "" }, { glyph: other, at: "" }, true).some((r) => r.type.startsWith(type)));

/**
 * A sentence with the stem taken out: the ten names, their images, the stem and branch characters, the five
 * element words, 음양 and the ordinals all become one mark, so two sentences that differ only by which day
 * master they are about come out the same.
 */
const NAMES = [...STEMS.map(nameOf), ...Object.values(DAY_MASTER_IMAGE)].sort((a, b) => b.length - a.length);
function masked(sentence: string): string {
  let text = sentence;
  for (const name of NAMES) text = text.replaceAll(name, "◇");
  return text
    .replace(/(첫|두|세|네|다섯|여섯|일곱|여덟|아홉|열) 번째|첫째|둘째|셋째|넷째|다섯째|여섯째|일곱째|여덟째|아홉째|열째|마지막/g, "◇")
    .replace(/나무|불|흙|쇠|물/g, "◇")
    .replace(/[甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥木火土金水갑을병정무기경신임계자축인묘진사오미유술해목화토금수음양]/g, "◇")
    .replace(/◇+/g, "◇")
    .replace(/◇(이에요|예요|으로|은|는|이|가|을|를|과|와|로|의)/g, "◇")
    .replace(/◇+/g, "◇");
}

const COMPAT = /궁합|맞는|맞물|부딪|끌리|맞서|긴장|손잡|가까워|빛나게/;
/** E 예시 명식, L 생활, C 잘 맞는·부딪히는 일간, Q a question (FAQ), X anything else. */
function role(heading: string): string {
  if (heading.includes("예시 명식")) return "E";
  if (heading.includes("생활")) return "L";
  if (!isQuestion(heading) && heading.includes("일간") && COMPAT.test(heading)) return "C";
  return isQuestion(heading) ? "Q" : "X";
}

describe("the ten day masters are ten articles, not one template", () => {
  it("covers the ten stems, each page about its own", () => {
    expect(DAY_MASTERS.map((article) => DAY_MASTER_STEM[article.slug])).toEqual([...STEMS]);
    for (const article of DAY_MASTERS) expect(article.title, article.slug).toContain(nameOf(DAY_MASTER_STEM[article.slug] as string));
  });

  it.each(DAY_MASTERS.map((article) => [article.slug, article] as const))("%s: one 예시 명식, one 생활 section, one 일간 궁합 section, 2-3 FAQ", (_slug, article) => {
    const roles = article.sections.map((section) => role(section.heading));
    expect(roles.filter((r) => r === "E"), roles.join("")).toHaveLength(1);
    expect(roles.filter((r) => r === "L"), roles.join("")).toHaveLength(1);
    expect(roles.filter((r) => r === "C"), roles.join("")).toHaveLength(1);
    const faq = roles.filter((r) => r === "Q").length;
    expect(faq, roles.join("")).toBeGreaterThanOrEqual(2);
    expect(faq, roles.join("")).toBeLessThanOrEqual(3);
  });

  it("orders its sections ten different ways, the example not always in one place", () => {
    const sequences = DAY_MASTERS.map((article) => article.sections.map((section) => role(section.heading)).join(""));
    expect(new Set(sequences).size, sequences.join(" ")).toBe(10);
    expect(new Set(sequences.map((s) => s.indexOf("E"))).size, sequences.join(" ")).toBeGreaterThanOrEqual(3);
    expect(new Set(sequences.map((s) => s.indexOf("C"))).size, sequences.join(" ")).toBeGreaterThanOrEqual(3);
  });

  it("never shares a heading, with the stem taken out, across more than two pages", () => {
    const pages = new Map<string, string[]>();
    for (const article of DAY_MASTERS) for (const section of article.sections) pages.set(masked(section.heading), [...(pages.get(masked(section.heading)) ?? []), article.slug]);
    const shared = [...pages].filter(([, slugs]) => slugs.length > 2).map(([heading, slugs]) => `${heading}: ${slugs.join(", ")}`);
    expect(shared).toEqual([]);
  });

  it("has no sentence that another day master repeats with only the stem changed", () => {
    const seen = new Map<string, string>();
    const repeats: string[] = [];
    for (const article of DAY_MASTERS) {
      const own = new Set<string>();
      for (const sentence of proseUnits(article).flatMap(sentences)) {
        if (sentence.length < 20) continue;
        const key = masked(sentence);
        if (own.has(key)) continue;
        own.add(key);
        const other = seen.get(key);
        if (other) repeats.push(`${article.slug} ≈ ${other}: ${sentence}`);
        else seen.set(key, article.slug);
      }
    }
    expect(repeats).toEqual([]);
  });

  it("asks FAQ questions of its own, answered in the first sentence (120 characters or less)", () => {
    const questions = new Map<string, string>();
    for (const article of DAY_MASTERS) {
      for (const section of article.sections.filter((s) => isQuestion(s.heading))) {
        const key = masked(section.heading);
        expect(questions.get(key), `${article.slug}: ${section.heading}`).toBeUndefined();
        questions.set(key, article.slug);
        expect(firstSentence(section.body).length, section.heading).toBeLessThanOrEqual(120);
      }
    }
  });

  it.each(DAY_MASTERS.map((article) => [article.slug, article] as const))("%s: the 예시 명식 is a labelled fictional chart the 만세력 computes, with this day master", (slug, article) => {
    const section = article.sections.find((s) => role(s.heading) === "E");
    const table = section?.blocks?.find((block): block is Table => block.kind === "table" && block.caption.startsWith("예시 명식"));
    if (!section || !table) throw new Error(`${slug}: no example table`);
    const chart = exampleChart(table);
    expectPillarTable(table, chart);
    expect(chart.pillars.day.stem).toBe(DAY_MASTER_STEM[slug]);
    expect(section.body).toContain(pillarLine(chart));
    // 3-4 sentences read the day master in that chart.
    const reading = (section.blocks ?? []).filter((block) => block.kind === "p").map((block) => (block.kind === "p" ? block.text : "")).join(" ");
    expect(sentences(reading).length).toBeGreaterThanOrEqual(3);
    expect(sentences(reading).length).toBeLessThanOrEqual(4);
  });

  it.each(DAY_MASTERS.map((article) => [article.slug, article] as const))("%s: the 궁합 section names the 천간합 and 천간충 partners the app's tables give", (slug, article) => {
    const stem = DAY_MASTER_STEM[slug] as string;
    const section = article.sections.find((s) => role(s.heading) === "C");
    const text = section ? guideSectionText(section) : "";
    const combine = partner(stem, "천간합");
    const clash = partner(stem, "천간충");
    expect(combine, slug).toBeDefined();
    expect(text).toContain(nameOf(combine as string));
    expect(text).toContain("천간합");
    expect(text).toContain("천간충");
    if (clash) expect(text).toContain(nameOf(clash));
    else expect(text, "戊·己 have no 천간충 partner").toMatch(/천간충[^.]*없어요/);
    expect(article.related).toContain("saju-compatibility");
  });

  it.each(DAY_MASTERS.map((article) => [article.slug, article] as const))("%s: every 12운성 and 일주 claim is the reading tables' own", (slug, article) => {
    const stem = DAY_MASTER_STEM[slug] as string;
    for (const [, branch = "", stage = ""] of bodyText(article).matchAll(/\(([子丑寅卯辰巳午未申酉戌亥])\)에서 (장생|목욕|관대|건록|제왕)/g)) {
      expect(twelveStage(stem, branch), `${slug}: ${branch} ${stage}`).toBe(stage);
    }
    for (const table of tables(article).filter((t) => t.head[0] === "일주")) {
      expect(table.head[1]).toBe("일지 십신");
      for (const [ilju = "", god = ""] of table.rows) {
        expect(ilju[0], ilju).toBe(STEMS_KO[STEMS.indexOf(stem as (typeof STEMS)[number])]);
        const branch = BRANCHES[["자", "축", "인", "묘", "진", "사", "오", "미", "신", "유", "술", "해"].indexOf(ilju[1] as string)] as string;
        expect(god, ilju).toBe(tenGod(stem, mainHiddenStem(branch)));
      }
    }
  });

  it("names the free 2027 keyword tool next to a few examples, not on every page", () => {
    const naming = DAY_MASTERS.filter((article) => bodyText(article).includes("starlog.yeolmaeapps.kr/2027-keyword"));
    expect(naming.length).toBeGreaterThanOrEqual(3);
    expect(naming.length).toBeLessThanOrEqual(5);
  });

  it.each(DAY_MASTERS.map((article) => [article.slug, article] as const))("%s: links to another day master and a concept", (slug, article) => {
    const related = article.related ?? [];
    expect(related.some((other) => other.startsWith("day-master-")), slug).toBe(true);
    expect(related.some((other) => !other.startsWith("day-master-") && other !== "saju-compatibility"), slug).toBe(true);
  });
});

// ---- concept articles ----

/** The term the page's first sentence answers with (AEO: the first paragraph answers the page's question). */
const MAIN_TERM: Readonly<Record<string, string>> = {
  "heavenly-stems": "천간", "earthly-branches": "띠", "day-master": "일간", "ten-gods": "십신", daewoon: "대운", "saju-vs-astrology": "별자리",
  manseryeok: "만세력", "saju-compatibility": "궁합", "new-year-fortune": "신년운세", "four-pillars": "네 기둥", "ipchun-jeolgi": "입춘",
  "jasi-birth": "자정", "saju-birth-info": "생년월일", "branch-relations": "충", "twelve-stages": "12운성", yongsin: "용신", "wolun-iljin": "월운",
  "bond-score": "인연 점수", "saju-glossary": "말",
};

const tableIn = (article: GuideArticle, caption: string) => {
  const table = tables(article).find((t) => t.caption === caption);
  if (!table) throw new Error(`${article.slug}: no table "${caption}"`);
  return table;
};

/** Each concept article's worked example, recomputed. */
const EXAMPLES: Readonly<Record<string, (article: GuideArticle, text: string) => void>> = {
  "heavenly-stems": (article, text) => {
    const chart = at(1995, 8, 20, 12);
    expect(text).toContain(`1995년 8월 20일 낮 12시`);
    expect(text).toContain(pillarLine(chart));
    const table = tableIn(article, "예시 명식 · 1995년 8월 20일 낮 12시, 천간만 떼어 보면");
    expect(table.rows.map((row) => [row[1], row[3]])).toEqual(
      KEYS.map((k) => {
        const p = chart.pillars[k]!;
        return [p.ko[0], k === "day" ? "일간(나)" : tenGod(chart.pillars.day.stem, p.stem)];
      }),
    );
  },
  "earthly-branches": (article, text) => {
    const chart = at(1995, 8, 20, 12);
    const table = tableIn(article, "예시 명식 · 1995년 8월 20일 낮 12시, 지지만 떼어 보면");
    const animals = ["쥐", "소", "호랑이", "토끼", "용", "뱀", "말", "양", "원숭이", "닭", "개", "돼지"];
    const b = (k: (typeof KEYS)[number]) => chart.pillars[k]!.branch as (typeof BRANCHES)[number];
    expect(table.rows.map((row) => row[1])).toEqual(KEYS.map((k) => `${chart.pillars[k]!.ko[1]}(${b(k)})`));
    expect(table.rows[0]?.[2]).toContain(`${animals[BRANCHES.indexOf(b("year"))]}띠`);
    expect(table.rows[1]?.[2]).toContain(SEASON[b("month")]);
    expect(table.rows[3]?.[2]).toContain(clock(chart.correctedLocalTime as string));
    // The 띠 of a child born on 2024-02-07, after 입춘 (2월 4일 오후 5시 27분) and before 설날.
    expect(at(2024, 2, 7, 12).pillars.year.ko).toBe("갑진");
    expect(text).toContain(kst(at(2024, 2, 20, 12).monthStartTerm!.instantUTC).replace(/^2월 4일 /, ""));
  },
  "day-master": (_article, text) => {
    const chart = at(1995, 8, 20, 12);
    expect(text).toContain(pillarLine(chart));
    expect(text).toContain(`일주는 ${chart.pillars.day.ko}`);
    expect(text).toContain(nameOf(chart.pillars.day.stem));
    expect(text).toContain(SEASON[chart.pillars.month.branch as (typeof BRANCHES)[number]]);
  },
  "ten-gods": (article) => {
    const table = tables(article).find((t) => t.caption.startsWith("예시 명식"));
    if (!table) throw new Error("ten-gods: no example table");
    const chart = exampleChart(table);
    expectPillarTable(table, chart);
    // All five groups (비겁, 식상, 재성, 관성, 인성) stand in it, as the section says.
    const GROUP: Record<string, string> = { 비견: "비겁", 겁재: "비겁", 식신: "식상", 상관: "식상", 편재: "재성", 정재: "재성", 편관: "관성", 정관: "관성", 편인: "인성", 정인: "인성" };
    const gods = KEYS.flatMap((k) => (k === "day" ? [chart.pillars.day.branchGod] : [chart.pillars[k]!.stemGod, chart.pillars[k]!.branchGod]));
    expect(new Set(gods.map((god) => GROUP[god])).size).toBe(5);
    expect(bodyText(article)).toContain("다섯 묶음이 모두");
  },
  daewoon: (article, text) => {
    expect(tableIn(article, "월주가 신사(辛巳)일 때").rows).toEqual([
      ["앞으로 가면", ...[1, 2, 3].map((n) => ganzhiKo(shiftGanzhi("辛巳", n)))],
      ["거꾸로 가면", ...[1, 2, 3].map((n) => ganzhiKo(shiftGanzhi("辛巳", -n)))],
    ]);
    for (const gender of ["female", "male"] as const) {
      const chart = at(1995, 8, 20, 12, 0, gender);
      const { luck } = chart;
      const start = luck.start!;
      const first = new Date(Date.UTC(1995 + start.years, 7 + start.months, 20 + start.days));
      for (const [n, cycle] of luck.pillars.slice(0, 3).entries()) {
        const year = first.getUTCFullYear() + 10 * n;
        expect(text, `${gender} ${cycle.ko}`).toContain(`${cycle.ko}, ${year}년 ${first.getUTCMonth() + 1}월 무렵부터`);
      }
      expect(text).toContain(`대운수 ${luck.startAge}`);
    }
  },
  "saju-vs-astrology": (_article, text) => {
    const [aug5, aug20, aug25] = [5, 20, 25].map((d) => at(1995, 8, d, 12));
    expect([aug5, aug20, aug25].map((c) => c!.pillars.month.ko)).toEqual(["계미", "갑신", "갑신"]);
    expect(text).toContain(`일주는 ${[aug5, aug20, aug25].map((c) => c!.pillars.day.ko).join(", ")}`);
    expect(aug20!.lunarDate).toBe("1995-07-24");
    const wrong = at(1995, 7, 24, 12);
    expect(text).toContain(`월주가 갑신 대신 ${wrong.pillars.month.ko}, 일주가 계미 대신 ${wrong.pillars.day.ko}`);
  },
  manseryeok: (article, text) => {
    const chart = at(1990, 5, 15, 12);
    expect(text).toContain(pillarLine(chart));
    expect(text).toContain(clock(chart.correctedLocalTime as string));
    expect(text).toContain(`${chart.monthStartTerm!.name}(${kstDate(chart.monthStartTerm!.instantUTC)})`);
    // 인월 by the year's stem: each row's stems give that 인월 in the engine.
    const rows = tableIn(article, "해의 천간으로 찾는 인월의 간지").rows;
    for (let year = 2024; year <= 2033; year++) {
      const c = at(year, 2, 20, 12);
      const stem = STEMS_KO[STEMS.indexOf(c.pillars.year.stem as (typeof STEMS)[number])];
      const row = rows.find(([stems = ""]) => stems.replace("년", "").split("·").includes(stem as string));
      expect(row?.[1], String(year)).toBe(c.pillars.month.ko);
    }
    expect(text).toContain(`2024년 갑진년의 인월이 ${at(2024, 2, 20, 12).pillars.month.ko}월`);
    expect(text).toContain(`2027년 정미년의 인월이 ${at(2027, 2, 20, 12).pillars.month.ko}월`);
  },
  "saju-compatibility": (_article, text) => {
    const a = at(1999, 10, 3, 20, 30);
    const b = at(1993, 6, 11, 7, 20);
    expect(text).toContain(pillarLine(a));
    expect(text).toContain(pillarLine(b));
    expect([nameOf(a.pillars.day.stem), nameOf(b.pillars.day.stem)]).toEqual(["무토", "계수"]);
    expect(stemRelations({ glyph: a.pillars.day.stem, at: "" }, { glyph: b.pillars.day.stem, at: "" }).map((r) => r.type)).toContain("천간합(天干合)");
    expect(elementMeeting("토", "수")).toContain("다듬는");
    expect(branchRelations({ glyph: a.pillars.day.branch, at: "" }, { glyph: b.pillars.day.branch, at: "" })).toEqual([]);
    expect(text).toContain("일지끼리는 이름이 붙는 관계가 없어요");
    expect(a.elements).toEqual({ 목: 1, 화: 0, 토: 3, 금: 1, 수: 3 });
    expect(b.elements).toEqual({ 목: 2, 화: 1, 토: 1, 금: 1, 수: 3 });
  },
  "new-year-fortune": (article, text) => {
    const chart = at(1995, 8, 20, 12);
    expect(text).toContain(pillarLine(chart));
    expect(at(2027, 7, 1, 12).pillars.year.ko).toBe("정미");
    expect(text).toContain(`2027년의 정은 계수에게 ${tenGod("癸", "丁")}, 미의 본기인 기는 ${tenGod("癸", mainHiddenStem("未"))}`);
    // The twelve months: each 절 on its date, the month's ganzhi from the next day on.
    const rows = tableIn(article, "2027년 정미년의 열두 달").rows;
    for (const [, starts = "", ganzhi = ""] of rows) {
      const m = /^(\S+), (?:(\d{4})년 )?(\d+)월 (\d+)일$/.exec(starts);
      if (!m) throw new Error(starts);
      const [, term, y, mo, d] = m;
      const next = at(Number(y ?? 2027), Number(mo), Number(d) + 1, 12);
      expect(next.pillars.month.ko, starts).toBe(ganzhi);
      expect(next.monthStartTerm?.name, starts).toBe(term);
      expect(kstDate(next.monthStartTerm!.instantUTC), starts).toBe(`${Number(mo)}월 ${Number(d)}일`);
    }
  },
  "four-pillars": (article, text) => {
    const chart = at(1990, 5, 15, 12);
    expect(text).toContain(pillarLine(chart));
    const table = tableIn(article, "예시 명식 · 1990년 5월 15일 낮 12시 서울 출생 (오른쪽이 연주)");
    const order = ["hour", "day", "month", "year"] as const;
    expect(table.rows).toEqual([
      ["천간", ...order.map((k) => chart.pillars[k]!.ko[0])],
      ["지지", ...order.map((k) => chart.pillars[k]!.ko[1])],
    ]);
    expect(text).toContain(`일지 진은 ${chart.pillars.day.branchGod}`);
  },
  "ipchun-jeolgi": (article, text) => {
    for (const [year = "", instant = ""] of tableIn(article, "해마다 다른 입춘 절입 시각").rows) {
      const c = at(Number(year.replace("년", "")), 2, 20, 12);
      expect(c.monthStartTerm?.name).toBe("입춘");
      expect(kst(c.monthStartTerm!.instantUTC), year).toBe(instant);
    }
    const before = at(2024, 2, 4, 17);
    const after = at(2024, 2, 4, 18);
    expect(text).toContain(`아직 ${before.pillars.year.ko}년 ${before.pillars.month.ko}월`);
    expect(text).toContain(`${after.pillars.year.ko}년 ${after.pillars.month.ko}월`);
  },
  "jasi-birth": (article, text) => {
    const late = at(2026, 3, 10, 23, 40);
    expect(text).toContain(`보정한 시각은 ${clock(late.correctedLocalTime as string)}쯤`);
    expect(text).toContain(`일주는 ${late.pillars.day.ko}, 시주는 다음 날인`);
    expect(text).toContain(`자시인 ${late.pillars.hour!.ko}`);
    // The calendars that read the hour's stem on the same day: 계's 자시, 임자 (갑·기일 갑자 … 무·계일 임자).
    const dayStem = STEMS.indexOf(late.pillars.day.stem as (typeof STEMS)[number]);
    expect(text).toContain(`시주가 ${STEMS_KO[((dayStem % 5) * 2) % 10]}자로 나오니`);
    const rows = tableIn(article, "서울에서 태어났다면 (지금의 표준시)").rows;
    expect(rows[0]?.[1]).toBe(`${clock(at(2026, 3, 10, 23, 20).correctedLocalTime as string)}쯤`);
    expect(rows[1]?.[1]).toBe(`전날 밤 ${clock(at(2026, 3, 11, 0, 20).correctedLocalTime as string)}쯤`);
  },
  "saju-birth-info": (_article, text) => {
    const seoul = at(1990, 5, 15, 7, 25);
    const busan = at(1990, 5, 15, 7, 25, "female", { name: "부산", longitude: 129.075 });
    expect(text).toContain(`서울은 보정한 시각이 ${clock(seoul.correctedLocalTime as string)}쯤이라 ${seoul.pillars.hour!.ko}시`);
    expect(text).toContain(`부산은 ${clock(busan.correctedLocalTime as string)}쯤이라 ${busan.pillars.hour!.ko}시`);
    expect(seoul.pillars.hour!.ko).not.toBe(busan.pillars.hour!.ko);
  },
  "branch-relations": (article) => {
    const table = tables(article).find((t) => t.caption.startsWith("예시 명식"));
    if (!table) throw new Error("branch-relations: no example table");
    const chart = exampleChart({ ...table, caption: table.caption.replace(/, 지지끼리의 관계$/, "") });
    const seat = { 연지: "year", 월지: "month", 일지: "day", 시지: "hour" } as const;
    const expected: string[] = [];
    for (let i = 0; i < 4; i++)
      for (let j = i + 1; j < 4; j++) {
        const [a, b] = [chart.pillars[KEYS[i]!]!, chart.pillars[KEYS[j]!]!];
        const types = branchRelations({ glyph: a.branch, at: "" }, { glyph: b.branch, at: "" }, true).map((r) => r.type.split("(")[0]);
        if (types.length) expected.push(`${KEYS[i]}-${KEYS[j]}: ${[...new Set(types)].sort().join(", ")}`);
      }
    const listed = table.rows.map(([pair = "", types = ""]) => {
      const m = /^(연지|월지|일지|시지) (.)[과와] (연지|월지|일지|시지) (.)$/.exec(pair);
      if (!m) throw new Error(pair);
      const [, s1, g1, s2, g2] = m as unknown as [string, keyof typeof seat, string, keyof typeof seat, string];
      expect(chart.pillars[seat[s1]]!.ko[1], pair).toBe(g1);
      expect(chart.pillars[seat[s2]]!.ko[1], pair).toBe(g2);
      return `${seat[s1]}-${seat[s2]}: ${types.split(", ").sort().join(", ")}`;
    });
    expect(listed.sort()).toEqual(expected.sort());
  },
  "twelve-stages": (article, text) => {
    const chart = at(1995, 8, 20, 12);
    expect(text).toContain(pillarLine(chart));
    const seat = { year: "연지", month: "월지", day: "일지", hour: "시지" } as const;
    for (const k of KEYS) expect(text, k).toMatch(new RegExp(`${seat[k]} ${chart.pillars[k]!.ko[1]}[은는] ${twelveStage(chart.pillars.day.stem, chart.pillars[k]!.branch)}`));
    const BRANCH_KO = ["자", "축", "인", "묘", "진", "사", "오", "미", "신", "유", "술", "해"];
    for (const [stems = "", branch = ""] of tableIn(article, "천간마다 장생이 되는 지지").rows) {
      for (const ko of stems.replace("신(辛)", "신").split("·")) {
        const stem = STEMS[STEMS_KO.indexOf(ko as (typeof STEMS_KO)[number])] as string;
        expect(twelveStage(stem, BRANCHES[BRANCH_KO.indexOf(branch)] as string), `${ko} ${branch}`).toBe("장생");
      }
    }
  },
  yongsin: (article) => {
    const chart = at(1990, 5, 15, 12);
    const rows = tableIn(article, "예시 명식 · 1990년 5월 15일 낮 12시, 겉에 보이는 여덟 글자로 센 오행").rows;
    for (const [element = "", count = ""] of rows) expect(chart.elements[element as keyof SajuChart["elements"]], element).toBe(Number(count));
    expect(chart.pillars.day.hidden.map((h) => h.stem)).toContain("乙");
  },
  "wolun-iljin": (_article, text) => {
    const month = at(2026, 11, 15, 12);
    expect(month.pillars.month.ko).toBe("기해");
    expect(text).toContain(`${kstDate(month.monthStartTerm!.instantUTC)} ${month.monthStartTerm!.name}`);
    expect(text).toContain(`기는 ${tenGod("癸", "己")}, 해의 본기인 임은 ${tenGod("癸", mainHiddenStem("亥"))}`);
    expect(branchRelations({ glyph: "亥", at: "" }, { glyph: "申", at: "" }).map((r) => r.type)).toEqual(["해(害)"]);
    expect(at(2026, 10, 6, 12).pillars.day.ko).toBe("계축");
    expect(at(2026, 9, 20, 12).pillars.month.ko).toBe("정유");
    expect(at(2026, 10, 20, 12).pillars.month.ko).toBe("무술");
    expect(kstDate(at(2026, 9, 20, 12).monthStartTerm!.instantUTC)).toBe("9월 7일");
    expect(kstDate(at(2026, 10, 20, 12).monthStartTerm!.instantUTC)).toBe("10월 8일");
  },
  "bond-score": (_article, text) => {
    const score = bondScore(bondBasis({ calendar: "solar", year: 1999, month: 10, day: 3 }), bondBasis({ calendar: "solar", year: 1993, month: 6, day: 11 }));
    expect(text).toContain(`${score.score}점`);
    for (const part of score.parts) expect(text, part.id).toContain(part.text);
    for (const part of score.parts) expect(text, part.id).toContain(`${part.points > 0 ? "+" : ""}${part.points}`);
  },
  "saju-glossary": (_article, text) => {
    const chart = at(1995, 8, 20, 12);
    expect(text).toContain(pillarLine(chart));
    expect(text).toContain(`일간은 ${chart.pillars.day.ko[0]}`);
    expect(text).toContain(`일지는 ${chart.pillars.day.ko[1]}`);
    expect(text).toContain(`월지는 ${chart.pillars.month.ko[1]}`);
    expect(text).toContain(`연지는 ${chart.pillars.year.ko[1]}`);
  },
};

describe("the saju concept articles answer first and show a worked example", () => {
  it("has a check for every concept article", () => expect(Object.keys(EXAMPLES).sort()).toEqual(CONCEPTS.map((a) => a.slug).sort()));

  it.each(CONCEPTS.map((article) => [article.slug, article] as const))("%s: an example labelled 예시, recomputed", (slug, article) => {
    expect(labels(article).some((label) => label.includes("예시")), labels(article).join(" | ")).toBe(true);
    EXAMPLES[slug]?.(article, bodyText(article));
  });

  it.each(CONCEPTS.map((article) => [article.slug, article] as const))("%s: the first sentence answers with the page's term, FAQ answers open in 120 characters or less", (slug, article) => {
    const opening = firstSentence(article.sections[0]?.body ?? "");
    expect(opening).toContain(MAIN_TERM[slug]);
    expect(opening.length, opening).toBeLessThanOrEqual(120);
    for (const section of article.sections.filter((s) => isQuestion(s.heading))) expect(firstSentence(section.body).length, section.heading).toBeLessThanOrEqual(120);
  });
});

// ---- every saju page ----

/** Filler the owner calls AI-ish Korean. */
const FILLER = /중요합니다|중요해요|다양한|특별한 의미|라고 할 수 있/;
/** Health, money and marriage said as outcomes (YMYL): the guides speak in tendencies. */
const OUTCOMES = /돈이 (모|들어|붙|새)|부자가 되|재물운이|금전운|건강(이|을) (해치|잃|나빠|약해)|병에 걸|아프게 되|수술|단명|장수|결혼(이|을|은) (늦|빨|하게|못)|이혼|배우자 복|자식 복/;
const APP_URL = /starlog\.yeolmaeapps\.kr(\/[\w/-]*)?/g;
function appRouteExists(path: string): boolean {
  if (path === "" || path === "/") return true;
  if (path.startsWith(`${KEYWORD_PATH}/`)) return iljuBySlug(path.slice(KEYWORD_PATH.length + 1)) !== null;
  return existsSync(`${APP}${path}/page.tsx`);
}

describe("every saju guide", () => {
  it("names the app host it means", () => expect(new URL(SITE.url).host).toBe("starlog.yeolmaeapps.kr"));

  it.each(ALL.map((article) => [article.slug, article] as const))("%s: no AI tells, no filler, no outcomes, links that resolve, five related reads, updated today", (slug, article) => {
    const text = [article.summary ?? "", bodyText(article)].join("\n");
    const hits = aiTells(bodyText(article));
    expect(hits.map((hit) => `${hit.id} ${hit.label}`)).toEqual([]);
    expect(proseUnits(article).join("\n")).not.toMatch(FILLER);
    expect(proseUnits(article).join("\n")).not.toMatch(OUTCOMES);
    for (const [, path = ""] of text.matchAll(APP_URL)) expect(appRouteExists(path), `${slug}: ${path}`).toBe(true);
    expect(article.related, slug).toHaveLength(5);
    expect(article.updated, slug).toBe(UPDATED);
  });

  it("leaves no day master unlinked: each is a related read of at least two other pages", () => {
    for (const article of DAY_MASTERS) {
      const from = ALL.filter((other) => other.slug !== article.slug && (other.related ?? []).includes(article.slug)).map((other) => other.slug);
      expect(from.length, `${article.slug} ← ${from.join(", ")}`).toBeGreaterThanOrEqual(2);
    }
  });
});
