import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  BRANCHES, STEMS, STEMS_KO, STEM_ELEMENTS, computeChart, ganzhiKo, mainHiddenStem, shiftGanzhi, type SajuChart,
} from "@starlog/core";
import { describe, expect, it } from "vitest";
import { elementMeeting } from "../ai/prompts/match";
import { DAY_MASTER_IMAGE, SAME_GLYPH, SEASON, branchRelations, stemRelations, tenGod, twelveStage } from "../ai/prompts/saju";
import { buildTopicFactSet } from "../ai/prompts/sajuTopics";
import { aiTells } from "../ai/style";
import { SITE, won } from "../config";
import { findArticle, guideSectionText, type GuideArticle, type GuideBlock, type GuideSection } from "../guide";
import { guidePlainText, inlineParts } from "../guideLinks";
import { guideFaqJsonLd, isQuestion } from "../jsonld";
import { KEYWORD_PATH, iljuBySlug } from "../keyword2027";
import { DAY_MASTER_ARTICLES } from "./day-masters";
import { SAJU_ARTICLES } from "./saju";
import { SAJU_CONCEPT_ARTICLES } from "./saju-concepts";

/**
 * The saju guides as AdSense reads them (scaled content, helpful content): the ten day-master pages are not
 * one outline with the stem swapped, every worked example is what the engine computes, FAQ answers open with
 * the answer, and every page leads on to others.
 */

/**
 * Last content change: the concept pages took links and substance in the saju third review; the day masters' bodies were
 * reworked on 2026-10-23 and their 요약 (answers.ts) on 2026-10-27, so their last change is that day too.
 */
const CONCEPT_UPDATED = "2026-10-27";
const DAY_MASTER_UPDATED = "2026-10-27";
/** Pages written after that: their own date. */
const NEW_PAGES: Readonly<Record<string, string>> = { "reunion-saju": "2026-10-31" };
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

/**
 * What a section is about, read from its heading: E a worked chart, S the seasons, V the 적천수 verse, C how it meets other
 * day masters, L everyday life, M what people get wrong, Q any other question, X anything else. The series once had one
 * sequence of these slots on every page; now no two pages share a sequence.
 */
function slot(heading: string): string {
  if (/예시|명식/.test(heading)) return "E";
  if (/계절|태어난 달|봄|여름|가을|겨울/.test(heading)) return "S";
  if (/적천수|구절/.test(heading)) return "V";
  if (/합|충|궁합|일간끼리|사이|만남|끌리|부딪|긴장|맞서/.test(heading)) return "C";
  if (/생활|일상|장면|하루/.test(heading)) return "L";
  if (/오해|착각|잘못/.test(heading)) return "M";
  return isQuestion(heading) ? "Q" : "X";
}
const slots = (article: GuideArticle) => article.sections.map((section) => slot(section.heading)).join("");
/** The blocks a section is built from, in order ("p+table|list|…"): the page's shape without its words. */
const shape = (article: GuideArticle) => article.sections.map((section) => ["body", ...(section.blocks ?? []).map((block) => block.kind)].join("+")).join("|");
/** The old template's slot words: none may head a section on more than three pages. */
const SLOT_WORDS: ReadonlyArray<readonly [string, RegExp]> = [
  ["예시 명식", /예시 명식/], ["생활", /생활/], ["끌리는", /끌리/], ["긴장", /긴장/], ["가까워지는", /가까워지/], ["부딪히는", /부딪/],
  ["맞물리는", /맞물/], ["손잡는", /손잡/], ["…의 글자", /글자/], ["…일간, …일간", /일간, .*일간/], ["X 일간은 …?", /일간은 .+(\?|나요|가요)$/],
];
/**
 * Length as the reviews count it: what the page shows in its sections (body, paragraphs, list items, steps, callouts, and a
 * table's caption, head and cells), spaces left out.
 */
const shownChars = (article: GuideArticle) =>
  article.sections
    .flatMap((section) => [
      section.body,
      ...(section.blocks ?? []).flatMap((block) =>
        block.kind === "p" ? [block.text] : block.kind === "list" ? [...block.items] : block.kind === "steps" ? block.items.flatMap((step) => [step.title, step.text]) : block.kind === "callout" ? [block.title, block.text] : block.kind === "table" ? [block.caption, ...block.head, ...block.rows.flat()] : [],
      ),
    ])
    .map(guidePlainText)
    .join("")
    .replace(/\s/g, "").length;
/** A table, list or steps block that sets out a classical verse line by line (three or more items quoting hanja). */
const isVerseBlock = (block: GuideBlock) => {
  const items = block.kind === "table" ? block.rows.map((row) => row.join(" ")) : block.kind === "list" ? [...block.items] : block.kind === "steps" ? block.items.map((step) => `${step.title} ${step.text}`) : [];
  return items.filter((item) => /\([\u4e00-\u9fff ]{4,}\)/.test(item)).length >= 3;
};
const KEYWORD_URL = "starlog.yeolmaeapps.kr/2027-keyword";
const blockText = (block: GuideBlock) => (block.kind === "p" ? block.text : block.kind === "list" ? block.items.join(" ") : block.kind === "steps" ? block.items.map((step) => step.text).join(" ") : block.kind === "callout" ? block.text : "");

/** "1996년 2월 7일 오전 7시 20분 서울": a fictional birth the page reads, recomputed. */
const BIRTH = /(\d{4})년 (\d{1,2})월 (\d{1,2})일 (오전|오후) (\d{1,2})시 (\d{1,2})분 서울/g;
const births = (text: string) =>
  [...new Set([...text.matchAll(BIRTH)].map((m) => m[0]))].map((birth) => {
    const [, y, mo, d, half, h, mi] = new RegExp(BIRTH.source).exec(birth) as RegExpExecArray;
    return at(Number(y), Number(mo), Number(d), (Number(h) % 12) + (half === "오후" ? 12 : 0), Number(mi));
  });
/** A section's prose: its body, paragraphs, list items, steps and callouts (no table cells or captions). */
const prose = (section: GuideSection) =>
  [section.body, ...(section.blocks ?? []).flatMap((block) => (block.kind === "p" ? [block.text] : block.kind === "list" ? [...block.items] : block.kind === "steps" ? block.items.map((step) => step.text) : block.kind === "callout" ? [block.text] : []))].map(guidePlainText).join(" ");
const SEAT_GOD = /(연간|월간|시간|연지|월지|일지|시지)[^.,()]{0,8}\((비견|겁재|식신|상관|편재|정재|편관|정관|편인|정인)\)/g;
const SEAT_KEY = { 연간: ["year", "stemGod"], 월간: ["month", "stemGod"], 시간: ["hour", "stemGod"], 연지: ["year", "branchGod"], 월지: ["month", "branchGod"], 일지: ["day", "branchGod"], 시지: ["hour", "branchGod"] } as const;
/** Every question the FAQPage carries and the first sentence of its answer. */
const faq = (article: GuideArticle) =>
  article.sections.flatMap((section) =>
    isQuestion(section.heading)
      ? [{ q: section.heading, first: firstSentence(section.body) }]
      : /자주 묻는 질문/.test(section.heading)
        ? (section.blocks ?? []).flatMap((block) => (block.kind === "steps" ? block.items.filter((step) => isQuestion(step.title)).map((step) => ({ q: step.title, first: firstSentence(guidePlainText(step.text)) })) : []))
        : [],
  );
const guideLinks = (article: GuideArticle) =>
  article.sections
    .flatMap((section) => [section.body, ...(section.blocks ?? []).flatMap((block) => (block.kind === "p" ? [block.text] : block.kind === "list" ? [...block.items] : block.kind === "steps" ? block.items.map((step) => step.text) : block.kind === "callout" ? [block.text] : []))])
    .flatMap((text) => inlineParts(text).filter((part): part is { text: string; url: string } => typeof part !== "string" && part.url.startsWith("/guide/")));

describe("the ten day masters are ten articles, not one template", () => {
  it("covers the ten stems, each page about its own", () => {
    expect(DAY_MASTERS.map((article) => DAY_MASTER_STEM[article.slug])).toEqual([...STEMS]);
    for (const article of DAY_MASTERS) expect(article.title, article.slug).toContain(nameOf(DAY_MASTER_STEM[article.slug] as string));
  });

  it("gives every page its own order of topics and its own shape, at three or more lengths", () => {
    const orders = DAY_MASTERS.map(slots);
    expect(new Set(orders).size, orders.join(" ")).toBe(10);
    expect(new Set(DAY_MASTERS.map(shape)).size).toBe(10);
    expect(new Set(DAY_MASTERS.map((article) => article.sections.length)).size, DAY_MASTERS.map((a) => a.sections.length).join(" ")).toBeGreaterThanOrEqual(3);
    // A pillar table and a section on the other day masters are where a page needs them, not on every page.
    const withTable = DAY_MASTERS.filter((article) => tables(article).some((t) => t.head[0] === "기둥")).length;
    expect(withTable).toBeGreaterThanOrEqual(3);
    expect(withTable).toBeLessThanOrEqual(7);
    expect(DAY_MASTERS.filter((article) => slots(article).includes("C")).length).toBeLessThanOrEqual(7);
  });

  it.each(SLOT_WORDS)("heads a section with %s on three pages at most", (_name, pattern) => {
    const pages = DAY_MASTERS.filter((article) => article.sections.some((section) => pattern.test(section.heading))).map((article) => article.slug);
    expect(pages.length, pages.join(", ")).toBeLessThanOrEqual(3);
  });

  it("never shares a heading, with the stem taken out, across more than two pages", () => {
    const pages = new Map<string, string[]>();
    for (const article of DAY_MASTERS) for (const section of article.sections) pages.set(masked(section.heading), [...(pages.get(masked(section.heading)) ?? []), article.slug]);
    const shared = [...pages].filter(([, slugs]) => slugs.length > 2).map(([heading, slugs]) => `${heading}: ${slugs.join(", ")}`);
    expect(shared).toEqual([]);
  });

  it("runs as long as each day master has things to say: 2,600-4,400 characters, the longest at least 30% of the mean above the shortest", () => {
    const lengths = DAY_MASTERS.map((article) => [article.slug, shownChars(article)] as const);
    for (const [slug, n] of lengths) {
      expect(n, slug).toBeGreaterThanOrEqual(2600);
      expect(n, slug).toBeLessThanOrEqual(4400);
    }
    const ns = lengths.map(([, n]) => n);
    const mean = ns.reduce((a, b) => a + b, 0) / ns.length;
    expect(Math.max(...ns) - Math.min(...ns), lengths.map(([slug, n]) => `${slug} ${n}`).join(", ")).toBeGreaterThanOrEqual(0.3 * mean);
  });

  it("ends the pages in different ways: two at most on the other day masters, four or more kinds of last section", () => {
    const last = DAY_MASTERS.map((article) => slot(article.sections.at(-1)?.heading ?? ""));
    expect(last.filter((s) => s === "C").length, last.join("")).toBeLessThanOrEqual(2);
    expect(new Set(last).size, last.join("")).toBeGreaterThanOrEqual(4);
  });

  it("sets the 적천수 verse out as a table, list or steps on four pages at most (the others tell it in prose)", () => {
    const pages = DAY_MASTERS.filter((article) => blocksOf(article).some(isVerseBlock)).map((article) => article.slug);
    expect(pages.length, pages.join(", ")).toBeLessThanOrEqual(4);
  });

  it.each(DAY_MASTERS.map((article) => [article.slug, article] as const))("%s: the free 2027 keyword tool, where named, closes the page", (slug, article) => {
    const blocks = article.sections.flatMap((section) => [section.body, ...(section.blocks ?? []).map(blockText)]);
    const at = blocks.flatMap((text, i) => (text.includes(KEYWORD_URL) ? [i] : []));
    if (!at.length) return;
    const lastSection = article.sections.at(-1);
    const lastBlock = lastSection?.blocks?.at(-1);
    expect(at, slug).toEqual([blocks.length - 1]);
    expect(lastBlock?.kind, slug).toBe("callout");
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

  it.each(DAY_MASTERS.map((article) => [article.slug, article] as const))("%s: a FAQPage of 2-4 questions of its own, each answered in its first sentence (120 characters or less)", (_slug, article) => {
    const questions = faq(article);
    expect(questions.length, questions.map((x) => x.q).join(" | ")).toBeGreaterThanOrEqual(2);
    expect(questions.length, questions.map((x) => x.q).join(" | ")).toBeLessThanOrEqual(4);
    expect(guideFaqJsonLd(article)).not.toBeNull();
    for (const { q, first } of questions) expect(first.length, q).toBeLessThanOrEqual(120);
  });

  it("asks no question another day master asks with only the stem changed", () => {
    const asked = new Map<string, string>();
    for (const article of DAY_MASTERS) {
      for (const { q } of faq(article)) {
        expect(asked.get(masked(q)), `${article.slug}: ${q}`).toBeUndefined();
        asked.set(masked(q), article.slug);
      }
    }
  });

  it.each(DAY_MASTERS.map((article) => [article.slug, article] as const))("%s: a fictional chart read step by step, the one the 만세력 computes, with this day master", (slug, article) => {
    const withBirth = article.sections.filter((section) => births(guideSectionText(section)).length > 0);
    expect(withBirth.length, slug).toBeGreaterThanOrEqual(1);
    for (const section of withBirth) {
      const text = guideSectionText(section);
      const charts = births(text);
      // Labelled as made up, never a real person.
      expect(text, section.heading).toContain("가상");
      for (const chart of charts) {
        expect(chart.warnings.map((w) => w.code), section.heading).toEqual([]);
        expect(chart.ambiguous, section.heading).toEqual([]);
        expect(chart.pillars.day.stem, section.heading).toBe(DAY_MASTER_STEM[slug]);
        expect(text, section.heading).toContain(pillarLine(chart));
      }
      for (const table of (section.blocks ?? []).filter((block): block is Table => block.kind === "table" && block.head[0] === "기둥")) expectPillarTable(table, exampleChart(table));
      // Each 연간·월지… (십신) the reading names is that seat's ten god in the chart.
      if (charts.length === 1) {
        const chart = charts[0] as SajuChart;
        for (const [, seat = "", god = ""] of text.matchAll(SEAT_GOD)) {
          const [key, field] = SEAT_KEY[seat as keyof typeof SEAT_KEY];
          expect(chart.pillars[key]?.[field], `${slug}: ${seat} ${god}`).toBe(god);
        }
      }
      // Read in prose, not a table and a line.
      expect(sentences(prose(section)).length, section.heading).toBeGreaterThanOrEqual(6);
    }
  });

  it.each(DAY_MASTERS.map((article) => [article.slug, article] as const))("%s: names the 천간합 and 천간충 partners the app's tables give", (slug, article) => {
    const stem = DAY_MASTER_STEM[slug] as string;
    const text = bodyText(article);
    const combine = partner(stem, "천간합");
    const clash = partner(stem, "천간충");
    expect(combine, slug).toBeDefined();
    expect(text).toContain(nameOf(combine as string));
    expect(text).toContain("천간합");
    if (clash) {
      expect(text).toContain(nameOf(clash));
      expect(text).toContain("천간충");
    } else expect(text, "戊·己 have no 천간충 partner").toMatch(/천간충[^.]*없/);
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

  it.each(DAY_MASTERS.map((article) => [article.slug, article] as const))("%s: 3-7 links in the text to other guide pages", (_slug, article) => {
    const links = guideLinks(article);
    expect(links.length, links.map((l) => l.url).join(" ")).toBeGreaterThanOrEqual(3);
    expect(links.length, links.map((l) => l.url).join(" ")).toBeLessThanOrEqual(7);
    expect(links.every((link) => link.url !== `/guide/${article.slug}`)).toBe(true);
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
  "saju-glossary": "말", "reunion-saju": "재회운",
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
    // The ten gods of all ten day masters: each cell is the stem that is that ten god to that day master.
    const all = tableIn(article, "일간마다 십신이 되는 천간");
    for (const [day = "", ...cells] of all.rows) {
      const dayStem = STEMS[STEMS_KO.indexOf(day.replace("일간", "") as (typeof STEMS_KO)[number])] as string;
      cells.forEach((ko, i) => expect(tenGod(dayStem, STEMS[STEMS_KO.indexOf(ko as (typeof STEMS_KO)[number])] as string), `${day} ${ko}`).toBe(all.head[i + 1]));
    }
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
    // 오자둔: the stem of the 자시 by the day stem, and the example's hour pillar counted on from it.
    for (const [days = "", ganzhi = ""] of tableIn(article, "일간으로 찾는 자시의 간지").rows) {
      for (const ko of days.replace("일", "").split("·")) expect(ganzhi, ko).toBe(`${STEMS_KO[((STEMS_KO.indexOf(ko as (typeof STEMS_KO)[number]) % 5) * 2) % 10]}자`);
    }
    const ex = at(1990, 5, 15, 12);
    expect(text).toContain(`${clock(ex.correctedLocalTime as string)}쯤이라 오시`);
    expect(tableIn(article, "예시 명식의 기둥별 십신과 12운성").rows).toEqual(
      KEYS.map((k) => {
        const p = ex.pillars[k]!;
        return [PLACE[k], `${p.ko}(${p.stem}${p.branch})`, k === "day" ? "일간(나)" : p.stemGod, p.branchGod, twelveStage(ex.pillars.day.stem, p.branch)];
      }),
    );
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
    // The same digits read as solar, lunar 평달 and lunar 윤달; and the two directions of 대운.
    const solar = at(1990, 5, 15, 12);
    const lunar = (isLeapMonth: boolean) => computeChart({ calendar: "lunar", year: 1990, month: 5, day: 15, isLeapMonth, time: { hour: 12, minute: 0 }, gender: "female", place: SEOUL });
    expect(text).toContain(pillarLine(solar));
    expect(solar.lunarDate).toBe("1990-04-21");
    for (const [leap, date] of [[false, "6월 7일"], [true, "7월 7일"]] as const) {
      const c = lunar(leap);
      expect(c.solarDate.endsWith(date === "6월 7일" ? "-06-07" : "-07-07"), date).toBe(true);
      expect(text).toContain(`양력 ${date}이라 ${pillarLine(c)}`);
    }
    for (const [gender, word] of [["male", "남자"], ["female", "여자"]] as const) {
      const luck = at(1990, 5, 15, 12, 0, gender).luck;
      expect(text).toMatch(new RegExp(`${word}는 ${gender === "male" ? "순행" : "역행"}이라 첫 대운이 ${luck.pillars[0]!.ko}으?로 ${luck.startAge}세 무렵`));
    }
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
    // Day pillars counted on from 2026-10-06, and the month still 무술 at noon on the day 입동 comes.
    expect(at(2026, 10, 16, 12).pillars.day.ko).toBe("계해");
    expect(at(2026, 12, 5, 12).pillars.day.ko).toBe("계축");
    expect(at(2026, 11, 7, 12).pillars.month.ko).toBe("무술");
    expect(text).toContain("16일은 천간만 같은 계해일");
    expect(text).toContain("11월 7일 낮에는 아직 무술월");
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
  "saju-glossary": (_article, text) => {
    const chart = at(1995, 8, 20, 12);
    expect(text).toContain(pillarLine(chart));
    expect(text).toContain(`일간은 ${chart.pillars.day.ko[0]}`);
    expect(text).toContain(`일지는 ${chart.pillars.day.ko[1]}`);
    expect(text).toContain(`월지는 ${chart.pillars.month.ko[1]}`);
    expect(text).toContain(`연지는 ${chart.pillars.year.ko[1]}`);
  },
  "reunion-saju": (article, text) => {
    const chart = at(1994, 6, 7, 15, 10);
    expect(text).toContain("1994년 6월 7일 오후 3시 10분");
    expect(text).toContain(pillarLine(chart));
    // The example says what the 재회운 reading itself starts from (lib/ai/prompts/sajuTopics.ts focus) on the day it was written.
    const { focus } = buildTopicFactSet(chart, Date.parse("2026-10-31T03:00:00Z"), "reunion");
    const facts = [...focus.s2, ...focus.s3, ...focus.s4, ...focus.s5].join("\n");
    for (const fact of [
      "12운성 목욕", "인성: 겉 1개(일지 子 정인)", "식상: 겉 1개(월지 午 상관)",
      "午(월지)와 子(일지) 사이에 충", "子(일지)와 未(시지) 사이에 해", "庚(월간)와 甲(일간) 사이에 천간충",
      "지금 대운 병인(丙寅) 2024년 11월~2034년 11월: 천간 식신(식상), 지지 본기 비견(비겁)",
      "午(세운 지지)와 子(일지) 사이에 충", "未(다가오는 해 세운 지지)와 子(일지) 사이에 해",
    ]) expect(facts, fact).toContain(fact);
    expect(tableIn(article, "예시 명식 · 1994년 6월 7일 오후 3시 10분 서울 출생 (가상의 인물), 재회운에서 보는 자리").rows).toEqual([
      ["일간과 일지", "갑목 일간, 자수 일지(12운성 목욕)"],
      ["인성", "겉 1개(일지 자수 정인)"],
      ["식상", "겉 1개(월지 오화 상관)"],
      ["일지·일간이 맺는 원국 관계", "월지 오와 일지 자가 충, 일지 자와 시지 미가 해(害), 월간 경과 일간 갑이 천간충"],
      ["지금 대운", "병인, 2024년 11월부터 2034년 11월까지(천간 병이 식신, 지지 인이 비견)"],
      ["2026년 병오", "세운 지지 오가 일지 자와 충"],
      ["2027년 정미", "세운 지지 미가 일지 자와 해(害)"],
    ]);
    // Every 일지 against the 지지 of 2026 (午) and 2027 (未): the app's own branch relations, in its order.
    const NAME: Record<string, string> = { "육합(六合)": "육합", "충(沖)": "충", "해(害)": "해(害)", "파(破)": "파", "형(刑)": "형", [SAME_GLYPH]: "같은 글자" };
    const cell = (branch: string, year: string) => {
      const types = branchRelations({ glyph: branch, at: "일지" }, { glyph: year, at: "세운 지지" }).map((r) => NAME[r.type] ?? r.type.replace(/^반합\(半合, (.+)\)$/, "반합($1)"));
      return types.length ? types.join(", ") : "따로 없음";
    };
    const KO = ["자", "축", "인", "묘", "진", "사", "오", "미", "신", "유", "술", "해"];
    expect(tableIn(article, "일지별로 2026년 병오(丙午)·2027년 정미(丁未)의 지지와 맺는 관계").rows).toEqual(
      BRANCHES.map((branch, i) => [`${KO[i]}(${branch})`, cell(branch, "午"), cell(branch, "未")]),
    );
    expect(chart.pillars.day.branch).toBe("子");
    expect(twelveStage(chart.pillars.day.stem, "子")).toBe("목욕");
    expect(SEASON.子).toBe("겨울의 한가운데");
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
  /** The pages a review found thin (under 1,800 shown characters): each now carries 2,500 or more of its own subject. */
  const DEEPENED = ["wolun-iljin", "four-pillars", "day-master", "ten-gods", "saju-compatibility", "saju-birth-info", "branch-relations", "saju-glossary"];

  it.each(CONCEPTS.map((article) => [article.slug, article] as const))("%s: 1,800 shown characters or more (2,500 for the deepened pages)", (slug, article) => {
    expect(shownChars(article)).toBeGreaterThanOrEqual(DEEPENED.includes(slug) ? 2500 : 1800);
  });

  it.each(CONCEPTS.map((article) => [article.slug, article] as const))("%s: three or more links in the text to other guide pages", (slug, article) => {
    const links = guideLinks(article).filter((link) => link.url !== `/guide/${slug}`);
    expect(links.length, links.map((l) => l.url).join(" ")).toBeGreaterThanOrEqual(3);
  });

  it("new-year-fortune: the product is named in one notice box at the end, without its price (AdSense audit 2026-10-27)", () => {
    const article = full("new-year-fortune");
    const product = SITE.price.premium.find((p) => p.id === "newyear-2027") as { name: string; krw: number };
    const texts = article.sections.flatMap((section) => [section.body, ...(section.blocks ?? []).map(blockText)]);
    expect(texts.flatMap((text, i) => (text.includes(product.name) ? [i] : [])), product.name).toEqual([texts.length - 1]);
    expect(texts.join(" ")).not.toContain(won(product.krw));
    expect(article.sections.at(-1)?.blocks?.at(-1)?.kind).toBe("callout");
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
    expect(article.updated, slug).toBe(NEW_PAGES[slug] ?? (slug.startsWith("day-master-") ? DAY_MASTER_UPDATED : CONCEPT_UPDATED));
  });

  it("leaves no day master unlinked: each is a related read of at least two other pages", () => {
    for (const article of DAY_MASTERS) {
      const from = ALL.filter((other) => other.slug !== article.slug && (other.related ?? []).includes(article.slug)).map((other) => other.slug);
      expect(from.length, `${article.slug} ← ${from.join(", ")}`).toBeGreaterThanOrEqual(2);
    }
  });
});
