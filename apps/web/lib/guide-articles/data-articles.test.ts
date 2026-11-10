// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { render } from "@testing-library/react";
import { KASI_DST_DISAGREEMENTS, KOREA_CIVIL_PERIODS, SajuError, computeChart } from "@starlog/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import GuideArticlePage from "@/app/guide/[slug]/page";
import { aiTells } from "../ai/style";
import { BIRTH_PLACE_ROWS } from "../birthPlaces";
import { ALL_GUIDE_ARTICLES, GUIDE_ARTICLES, findArticle, guideSectionText, type GuideArticle, type GuideBlock } from "../guide";
import { inlineParts } from "../guideLinks";
import { publishInstant } from "../guideMeta";
import { sitemapEntries } from "../seo";
import { GUIDE_DATES } from "./answers";
import {
  DATA_ARTICLES, ENGINE_ERRORS, ENGINE_FIRST_MINUTE, ENGINE_LIST, JPL_VS_KASI, KASI_EQUAL_BY_YEAR, KASI_TERMS, LUNAR_DAYS, LUNAR_MISMATCH, after2000, before2000, lmtMinutes,
} from "./data-articles";

/**
 * The 원본 자료 articles (AdSense audit 2026-11-06, task C): every number they print is checked here against the file it
 * came from, and their release is checked on both sides of each publishAt day.
 */

vi.mock("next/script", async () => {
  const { createElement } = await import("react");
  return { default: ({ src }: { src: string }) => createElement("script", { "data-ads-src": src }) };
});
afterEach(() => vi.useRealTimers());

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const EVAL = read("../../../../docs/research/saju-engine-eval.md");
const REFS = read("../../../../docs/research/manseryeok-references-2026-10.md");
const KASI = JSON.parse(read("../../../../packages/core/tests/fixtures/kasi-solar-terms-2021-2028.json")) as {
  terms: Record<string, Array<[string, string]>>;
  notes: { knownPlusOneMinute: Array<{ year: number; name: string; kasi: string; manseryeok: string }> };
};
const article = (slug: string) => DATA_ARTICLES.find((a) => a.slug === slug) as GuideArticle;
const blocks = (a: GuideArticle) => a.sections.flatMap((s) => s.blocks ?? []);
const tables = (a: GuideArticle) => blocks(a).filter((b): b is Extract<GuideBlock, { kind: "table" }> => b.kind === "table");
const table = (a: GuideArticle, caption: string) => tables(a).find((t) => t.caption.startsWith(caption)) as Extract<GuideBlock, { kind: "table" }>;
const text = (a: GuideArticle) => [a.summary ?? "", ...(a.keyPoints ?? []), ...a.sections.map(guideSectionText)].join("\n");
const mdRow = (doc: string, first: string) => {
  const line = doc.split("\n").map((l) => l.trimStart()).find((l) => l.startsWith(`| ${first} |`) || l.startsWith(`| **${first}** |`));
  if (!line) throw new Error(`no row ${first}`);
  return line.split("|").slice(1, -1).map((cell) => cell.trim().replaceAll("**", ""));
};

describe("만세력 엔진 11종 비교: the numbers of docs/research/saju-engine-eval.md", () => {
  it("lists the eleven engines and the versions §2 installed", () => {
    expect(ENGINE_LIST).toHaveLength(11);
    for (const [name, version] of ENGINE_LIST) expect(EVAL, name).toContain(`\`${name}@${version}\``);
  });

  it("counts each engine's 연·월·일주 errors as §4.3's total line does", () => {
    const line = EVAL.split("\n").find((l) => l.startsWith("**연·월·일주 오류 합계(13케이스):**")) as string;
    const totals = new Map([...line.matchAll(/([a-z-]+(?: 그대로)?) (\d+)/g)].map((m) => [m[1]?.replace("lunar-js 그대로", "lunar-javascript"), Number(m[2])]));
    expect(ENGINE_ERRORS.map(([name, n]) => [name, totals.get(name)])).toEqual(ENGINE_ERRORS.map(([name, n]) => [name, n]));
    expect(totals.size).toBe(ENGINE_ERRORS.length);
  });

  it("copies §4.2's first minutes and the JPL instants", () => {
    const jpl = mdRow(EVAL, "엔진");
    expect(ENGINE_FIRST_MINUTE.head.slice(1).map((h) => h.replace(" ", " "))).toHaveLength(5);
    for (const row of ENGINE_FIRST_MINUTE.rows.slice(1, 6)) expect(row.slice(1), row[0]).toEqual(mdRow(EVAL, row[0] as string).slice(1));
    expect(ENGINE_FIRST_MINUTE.rows.at(-1)?.slice(1)).toEqual(mdRow(EVAL, "lunar-js 그대로 / openfate / krdn").slice(1));
    // The JPL row is the instant in each column head of §4.2.
    for (const [i, instant] of (ENGINE_FIRST_MINUTE.rows[0] ?? []).slice(1).entries()) expect(jpl[i + 1], instant).toContain(instant);
  });

  it("copies §4.4's 150-year lunar counts", () => {
    expect(EVAL).toContain(`${LUNAR_DAYS.toLocaleString("en-US")}일`);
    expect(LUNAR_MISMATCH).toEqual([["korean-lunar-calendar", 0], ["lunar-javascript", 1948], ["ssaju", 3824]]);
    expect(EVAL).toContain("manseryeok과 korean-lunar-calendar: 불일치 **0**");
    expect(EVAL).toContain("manseryeok과 lunar-js(중국력): 불일치 **1,948일**");
    expect(EVAL).toContain("manseryeok과 ssaju: 불일치 3,824일");
  });

  it("computes the 2000 입춘 example with the app's engine, as G06 and G07 of §9 give it", () => {
    const glyphs = (p: { stem: string; branch: string }) => `${p.stem}${p.branch}`;
    expect([glyphs(before2000.pillars.year), glyphs(before2000.pillars.month)]).toEqual(["己卯", "丁丑"]);
    expect([glyphs(after2000.pillars.year), glyphs(after2000.pillars.month)]).toEqual(["庚辰", "戊寅"]);
    // §9 G06 and G07, profile R: the same 연·월.
    expect(mdRow(EVAL, "G06")[2]?.startsWith("己卯 丁丑")).toBe(true);
    expect(mdRow(EVAL, "G07")[2]?.startsWith("庚辰 戊寅")).toBe(true);
  });
});

describe("2026·2027 절입 시각표: the KASI fixture and the engine", () => {
  const a = article("jeolip-times-2026-2027");

  it("prints KASI's 2026 and 2027 terms exactly as the fixture holds them", () => {
    expect(KASI_TERMS["2026"]).toEqual(KASI.terms["2026"]);
    expect(KASI_TERMS["2027"]).toEqual(KASI.terms["2027"]);
    for (const year of ["2026", "2027"] as const) {
      const rows = table(a, `${year}년 24절기`).rows;
      expect(rows.map((row) => row[0])).toEqual(KASI.terms[year]?.map(([name]) => name));
      for (const [i, [, kst]] of (KASI.terms[year] ?? []).entries()) {
        const [, m, d] = kst.split(" ")[0]?.split("-").map(Number) as number[];
        expect(rows[i]?.[1]).toBe(`${m}월 ${d}일 ${kst.split(" ")[1]}`);
      }
    }
  });

  it("says where the app's engine differs: none in 2026, 청명 in 2027 one minute later, as the fixture notes", () => {
    expect(table(a, "2026년 24절기").rows.every((row) => row[3] === "같음")).toBe(true);
    const differing = table(a, "2027년 24절기").rows.filter((row) => row[3] !== "같음");
    expect(differing).toEqual([["청명", "4월 5일 09:17", "진월", "09:18 (1분 늦음)"].map((cell, i) => (i === 2 ? (differing[0]?.[2] as string) : cell))]);
    expect(KASI.notes.knownPlusOneMinute.filter((n) => n.year === 2027).map((n) => n.name)).toEqual(["청명"]);
  });

  it("counts the equal terms per year from the fixture, and lists its five +1 minute cases", () => {
    const plus = KASI.notes.knownPlusOneMinute;
    expect(KASI_EQUAL_BY_YEAR).toEqual(Object.keys(KASI.terms).map((year) => [Number(year), 24 - plus.filter((n) => n.year === Number(year)).length]));
    expect(table(a, "앱 계산값이 다른 5개").rows.map((row) => [Number(row[0]), row[1], row[3]])).toEqual(plus.map((n) => [n.year, n.name, n.manseryeok.slice(11)]));
  });

  it("copies the JPL-against-KASI rows of docs/research/manseryeok-references-2026-10.md §3", () => {
    for (const [term, jpl, kasi] of JPL_VS_KASI) expect(mdRow(REFS, term).slice(1)).toEqual([jpl, kasi]);
  });

  it("names the month each 절 opens, as the engine gives it an hour later", () => {
    const rows = table(a, "2026년 24절기").rows;
    expect(rows[2]?.[2]).toBe(`${computeChart({ calendar: "solar", year: 2026, month: 2, day: 4, time: { hour: 6, minute: 2 }, gender: "female", place: { name: "서울", longitude: 126.978 } }).pillars.month.ko}월`);
    expect(rows.filter((_, i) => i % 2 === 1).every((row) => row[2] === "중기(월 그대로)")).toBe(true);
  });
});

describe("한국 서머타임·표준시 연표: the engine's own table", () => {
  const a = article("korea-dst-standard-time");

  it("prints four standard-time eras and the twelve DST years of KOREA_CIVIL_PERIODS, and KASI's ten disagreements", () => {
    expect(table(a, "표준시 시기").rows.map((row) => row[2])).toEqual(["UTC+8:30", "UTC+9", "UTC+8:30", "UTC+9"]);
    const dst = table(a, "서머타임 기간").rows;
    expect(dst.map((row) => row[0])).toEqual(["1948년", "1949년", "1950년", "1951년", "1955년", "1956년", "1957년", "1958년", "1959년", "1960년", "1987년", "1988년"]);
    expect(dst.filter((row) => row[3] === "UTC+9:30").map((row) => row[0])).toEqual(["1955년", "1956년", "1957년", "1958년", "1959년", "1960년"]);
    expect(KOREA_CIVIL_PERIODS.filter(([, offset, standard]) => offset > standard)).toHaveLength(12);
    expect(table(a, "두 자료가 다른 열 구간").rows).toHaveLength(KASI_DST_DISAGREEMENTS.length);
  });

  it("computes the 1988-05-10 01:30 example as G08 of the engine evaluation (profiles D and R)", () => {
    const rows = table(a, "같은 입력").rows;
    expect(rows[0]?.[2]).toBe("무진(戊辰) 정사(丁巳) 갑자(甲子) 병자(丙子)");
    expect(rows[1]?.[2]).toBe("무진(戊辰) 정사(丁巳) 을축(乙丑) 정축(丁丑)");
    const g08 = mdRow(EVAL, "G08");
    expect(g08[2]).toBe("戊辰 丁巳 乙丑 丁丑");
    expect(g08[3]).toBe("戊辰 丁巳 甲子 丙子");
  });

  it("says what the engine does with a skipped and a repeated hour", () => {
    const at = (month: number, day: number) => computeChart({ calendar: "solar", year: 1987, month, day, time: { hour: 2, minute: 30 }, gender: "female", place: { name: "서울", longitude: 126.978 } });
    expect(() => at(5, 10)).toThrow(SajuError);
    try {
      at(5, 10);
    } catch (error) {
      expect((error as SajuError).code).toBe("NONEXISTENT_CIVIL_TIME");
    }
    expect(at(10, 11).warnings.map((w) => w.code)).toContain("AMBIGUOUS_CIVIL_TIME");
  });
});

describe("출생지별 경도 보정표: lib/birthPlaces.ts", () => {
  const a = article("birthplace-longitude-table");

  it("prints all 161 places once, each with its longitude and (longitude − 135) × 4 minutes", () => {
    const rows = tables(a).filter((t) => /\(\d+곳\)$/.test(t.caption)).flatMap((t) => t.rows);
    expect(rows).toHaveLength(161);
    expect(BIRTH_PLACE_ROWS).toHaveLength(161);
    for (const place of BIRTH_PLACE_ROWS) {
      const row = rows.find((r) => r[0] === place.label);
      expect(row, place.label).toEqual([place.label, `동경 ${place.longitude.toFixed(3)}도`, `${lmtMinutes(place.longitude).toFixed(1)}분`]);
    }
    const chart = blocks(a).find((b) => b.kind === "chart" && b.chart === "bar") as Extract<GuideBlock, { kind: "chart"; chart: "bar" }>;
    expect(chart.rows.reduce((sum, row) => sum + row.value, 0)).toBe(161);
  });

  it("works the Seoul and Busan example with the engine: the same clock, two 시진", () => {
    const rows = table(a, "1990년 5월 15일 07:25").rows;
    expect(rows[0]?.[2]).not.toBe(rows[1]?.[2]);
    // The credit the list's license (ODbL 1.0) asks for.
    expect(text(a)).toContain("Open Database License 1.0");
    expect(text(a)).toContain("© OpenStreetMap 기여자");
  });
});

describe("every 원본 자료 article", () => {
  it.each(DATA_ARTICLES.map((a) => [a.slug, a] as const))("%s: written to the guide's rules", (slug, a) => {
    expect(a.category).toBe("saju");
    expect(a.sections.length).toBeGreaterThanOrEqual(4);
    expect(a.sections.length).toBeLessThanOrEqual(7);
    for (const section of a.sections) expect(section.body, section.heading).toMatch(/요[.?]$/);
    for (const block of blocks(a)) if (block.kind === "p" || block.kind === "callout") expect(block.text, slug).toMatch(/[요죠][.?]$/);
    for (const t of tables(a)) for (const row of t.rows) expect(row, t.caption).toHaveLength(t.head.length);
    expect(a.description.length).toBeLessThanOrEqual(80);
    expect(`${a.title} · 스타로그`.length).toBeLessThanOrEqual(60);
    for (const point of a.keyPoints ?? []) expect(point.length, point).toBeLessThanOrEqual(60);
    expect(blocks(a).some((b) => b.kind === "chart"), "a chart from its data").toBe(true);
    expect(blocks(a).some((b) => b.kind === "table"), "a table from its data").toBe(true);
    expect(JSON.stringify(a)).not.toMatch(/Claude|GPT|Gemini|OpenAI|Anthropic|베타|보장|확률|적중|100%|가상의/);
    expect(aiTells(a.sections.map(guideSectionText).join("\n")).length, slug).toBeLessThan(3);
    expect(a.madeHow?.short).toContain("AI 도구로");
    expect(GUIDE_DATES[slug]).toEqual({ published: a.publishAt, updated: a.publishAt });
  });

  it("come out about two a week from 2026-11-12, never two on one day", () => {
    const days = DATA_ARTICLES.map((a) => a.publishAt as string);
    expect(days[0]).toBe("2026-11-12");
    expect(new Set(days).size).toBe(days.length);
    for (let i = 1; i < days.length; i++) {
      const gap = (publishInstant(days[i] as string) - publishInstant(days[i - 1] as string)) / 86_400_000;
      expect(gap, days[i]).toBeGreaterThanOrEqual(3);
      expect(gap, days[i]).toBeLessThanOrEqual(4);
    }
  });

  it.each(DATA_ARTICLES.map((a) => [a.slug, a] as const))("%s: links and related reads only to pages out by its own day", (_slug, a) => {
    const day = publishInstant(a.publishAt as string);
    const linked = a.sections.flatMap((s) => [s.body, ...(s.blocks ?? []).map((b) => JSON.stringify(b))]).flatMap(inlineParts).flatMap((part) => (typeof part === "string" ? [] : [part.url]));
    for (const url of [...linked.filter((u) => u.startsWith("/guide/")), ...(a.related ?? []).map((s) => `/guide/${s}`)]) {
      const target = url.slice("/guide/".length).split("#")[0] as string;
      expect(findArticle(target, day), `${a.slug} → ${target}`).toBeDefined();
    }
    expect(linked.filter((u) => !u.startsWith("/guide/")).every((u) => /^https:\/\/(astro\.kasi\.re\.kr|ssd\.jpl\.nasa\.gov|www\.openstreetmap\.org)\//.test(u))).toBe(true);
  });

  it("are pointed at by no article out before them", () => {
    for (const data of DATA_ARTICLES) {
      for (const other of ALL_GUIDE_ARTICLES.filter((o) => !o.publishAt || o.publishAt < (data.publishAt as string))) {
        expect(JSON.stringify(other.sections).includes(`/guide/${data.slug}`), `${other.slug} → ${data.slug}`).toBe(false);
        expect(other.related ?? [], `${other.slug} → ${data.slug}`).not.toContain(data.slug);
      }
    }
  });
});

describe("release on both sides of each day", () => {
  it.each(DATA_ARTICLES.map((a) => [a.slug, a] as const))("%s: no list, no sitemap and a 404 the minute before; all three from 00:00 KST", async (slug, a) => {
    const day = publishInstant(a.publishAt as string);
    vi.useFakeTimers({ toFake: ["Date"] });

    vi.setSystemTime(day - 60_000);
    expect(findArticle(slug)).toBeUndefined();
    expect(sitemapEntries().map((e) => e.path)).not.toContain(`/guide/${slug}`);
    await expect(GuideArticlePage({ params: Promise.resolve({ slug }) } as PageProps<"/guide/[slug]">)).rejects.toThrow();

    vi.setSystemTime(day);
    expect(findArticle(slug)?.slug).toBe(slug);
    expect(sitemapEntries().map((e) => e.path)).toContain(`/guide/${slug}`);
    const { container } = render(await GuideArticlePage({ params: Promise.resolve({ slug }) } as PageProps<"/guide/[slug]">));
    expect(container.querySelector("h1")?.textContent).toBe(a.title);
    expect(container.querySelector("svg[role='img']")).not.toBeNull();
    expect(container.textContent).toContain(`만든 방법 ${a.madeHow?.short}`);
  });

  it("join the lists built at or after their day only (GUIDE_ARTICLES is read when the module loads: guidePublish.test.ts)", () => {
    for (const a of GUIDE_ARTICLES.filter((g) => g.publishAt)) expect(DATA_ARTICLES.map((d) => d.slug)).toContain(a.slug);
  });
});

describe("review fixes (2026-11-10)", () => {
  const dst = article("korea-dst-standard-time");
  const lon = article("birthplace-longitude-table");

  it("claims nothing about neighbouring 시·군 that the list cannot show", () => {
    expect(text(lon)).not.toContain("이웃한 시·군");
  });

  it("says the standard time was set in 1908 and changed three times after, in a table made from the 28-line chronology", () => {
    expect(dst.summary).toContain("1908년");
    expect(dst.summary).toContain("세 번");
    expect(dst.summary).not.toContain("그대로 옮기고");
    expect(dst.summary).toContain("28줄로 만든 표");
    expect(dst.sections.map((s) => s.heading)).not.toContain("표준시가 바뀐 네 번");
    expect(KOREA_CIVIL_PERIODS).toHaveLength(28);
  });

  it("names a one-year DST span by its year once, never as 1948–1948", () => {
    const lines = dst.sections.map(guideSectionText).join("\n");
    expect(lines).not.toMatch(/(\d{4})–\1(?!\d)/);
    expect(lines).toContain("1948");
  });
});
