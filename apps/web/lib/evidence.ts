import "server-only";
import evidence from "@content/evidence.json";
import bookT from "@content/kb/sources/book-t.json";
import pkt from "@content/kb/sources/pkt.json";
import { BIRTH_PLACE_CREDIT_URL } from "./birthPlaces";
import { INFO_PAGES } from "./infoPages";

/**
 * What 스타로그의 근거 (/evidence) and the source lines under guide articles say: the facts in
 * content/evidence.json (each names the research section it comes from) and the two public-domain
 * books in content/kb/sources (method: docs/research/kb-source-verification-2026-10.md). Server side
 * only: pkt.json carries Waite's full text.
 */

export type EvidenceArea = "tarot" | "saju";

export interface EvidenceFact {
  id: string;
  area: EvidenceArea;
  labelKo: string;
  valueKo: string;
  detailKo: string;
  /** The repo document and section the fact comes from (not shown). */
  doc: string;
}

/** One card on the evidence page: a fact, or one of the two source books with a link to its scan. */
export interface EvidenceItem {
  id: string;
  labelKo: string;
  valueKo: string;
  detailKo: string;
  link?: { href: string; label: string };
}

const FACTS = evidence as EvidenceFact[];
const PKT_CARDS: Readonly<Record<string, { loc: string; quoteKo: string } | undefined>> = pkt.cards;
const CARD_COUNT = Object.keys(pkt.cards).length;

/** "The Pictorial Key to the Tarot", without the subtitle. */
const PKT_TITLE = pkt.source.title.split(":")[0] ?? pkt.source.title;
const PKT_AUTHOR = pkt.source.author.split(" ").at(-1) ?? pkt.source.author;
/** The printing whose pages the locators count (the Wikisource scan). */
const PKT_REPRINT = /Reprinted (\d{4})/.exec(pkt.source.edition)?.[1];

/** The evidence page's section for an area (its id is the area). */
export const evidenceHref = (area: EvidenceArea): string => `${INFO_PAGES.evidence.path}#${area}`;

const SOURCE_BOOKS: readonly EvidenceItem[] = [
  {
    id: "pkt",
    labelKo: "웨이트 원전",
    valueKo: `『${PKT_TITLE}』 ${pkt.source.year}년`,
    detailKo: [
      `덱을 구성한 웨이트가 직접 쓴 해설서예요. ${CARD_COUNT}장의 그림 설명과 뜻을 원문 그대로 두고, 카드마다 몇 쪽에 있는지 적었어요.`,
      "위키문헌 전사본을 프로젝트 구텐베르크 판과 대조했고, 서로 다른 곳은 인쇄본 스캔으로 확인했어요.",
      PKT_REPRINT ? `쪽수는 스캔이 있는 ${PKT_REPRINT}년 재쇄본 기준이에요.` : "",
    ]
      .filter(Boolean)
      .join(" "),
    link: { href: pkt.source.urls.find((url) => url.includes("Index:")) ?? pkt.source.urls[0] ?? "", label: "원전 스캔 보기" },
  },
  {
    id: "book-t",
    labelKo: "골든 던 Book T 대응",
    valueKo: `『Book T』 ${bookT.source.year}년 인쇄본`,
    detailKo: `골든 던의 타로 문서 『Book T』를 『The Equinox』에 실린 인쇄본 스캔으로 읽었어요. ${Object.keys(bookT.cards).length}장의 이름과 점성 대응을 쪽수와 함께 정리했고, 카드 데이터에 적은 점성 대응은 모두 이 문서와 같아요.`,
    link: { href: bookT.source.urls[0] ?? "", label: "Book T 스캔 보기" },
  },
];

/** Reading order on the page; a fact missing here still shows, after these, in the file's order. */
const ORDER: Record<EvidenceArea, readonly string[]> = {
  tarot: ["tarot-scan-basis", "pkt", "book-t", "tarot-modern-sources", "tarot-modern-agreement", "tarot-yes-no-sources"],
  saju: [
    "saju-engine", "saju-kasi-lunar", "saju-jpl-horizons", "saju-iau-sofa", "saju-solar-term-max", "saju-kasi-solar-terms", "saju-birth-crosscheck",
    "saju-wide-sweep", "saju-standard-time", "saju-daylight-saving", "saju-birth-places",
  ],
};

/** Every fact of the area, word for word, with the source books among the tarot ones. */
export function evidenceItems(area: EvidenceArea): EvidenceItem[] {
  const items: EvidenceItem[] = [...(area === "tarot" ? SOURCE_BOOKS : []), ...FACTS.filter((fact) => fact.area === area)];
  const rank = (id: string) => (ORDER[area].includes(id) ? ORDER[area].indexOf(id) : ORDER[area].length);
  return items.sort((a, b) => rank(a.id) - rank(b.id));
}

/** How many modern references the cross-check used: the count the tarot-modern-sources fact states. */
export function modernSourceCount(): number {
  const count = Number(/(\d+)곳/.exec(FACTS.find((fact) => fact.id === "tarot-modern-sources")?.valueKo ?? "")?.[1]);
  if (!Number.isInteger(count) || count <= 0) throw new Error("content/evidence.json: tarot-modern-sources must state a count such as '7곳'");
  return count;
}

/**
 * Waite's sentence about the card's picture (quoteKo, a translation of quoteEn) and where it stands:
 * the picture part of `loc` (Part II §2 for a trump, Part III §2 for a minor card).
 */
export function cardQuote(cardId: string): { ko: string; loc: string; author: string; title: string } | null {
  const card = PKT_CARDS[cardId];
  if (!card) return null;
  return { ko: card.quoteKo, loc: card.loc.split("; ")[0] ?? card.loc, author: PKT_AUTHOR, title: PKT_TITLE };
}

/** The line under a card article: the picture, Waite's book with the card's full locator, the modern references. */
export function cardSourceLine(cardId: string): string | null {
  const card = PKT_CARDS[cardId];
  if (!card) return null;
  return `그림: 1909년 원판 · 원전: 웨이트 『${PKT_TITLE}』 ${card.loc} · 현대 해석 ${modernSourceCount()}곳 대조`;
}

/** The line under a saju article: the calendar the chart is built on and what its solar terms were checked against. */
export const SAJU_SOURCE_LINE = "달력: 한국천문연구원 음력 · NASA JPL 절입 시각 검증";

/** A fact's value, word for word; a missing fact is a data error. */
function factValue(id: string): string {
  const found = FACTS.find((item) => item.id === id);
  if (!found) throw new Error(`content/evidence.json: missing ${id}`);
  return found.valueKo;
}

/** The four numbers at the top of the evidence page: each one is a value the facts or the source files state. */
export function evidenceHighlights(): { value: string; label: string }[] {
  return [
    { value: `${CARD_COUNT}장`, label: "1909년 원판 그림과 웨이트 원전으로 대조" },
    { value: `${modernSourceCount()}곳`, label: "요즘 해석 레퍼런스와 하나씩 대조" },
    { value: factValue("saju-wide-sweep"), label: "출생 정보로 만세력 교차검증" },
    { value: factValue("saju-solar-term-max"), label: "절기 시각 최대 차이(1929~2026년)" },
  ];
}

/** The modern references of the cross-check, as tarot-modern-sources names them. */
export const MODERN_SOURCES = ["Biddy Tarot", "Astrala", "Tarot with Gord", "Sibyl Tarot", "Learning the Tarot", "Mark McElroy", "Tarotoo"] as const;

/** 주요 원전·자료: what each part of a reading rests on, one row per source; `href` links the title (a license page). */
export function evidenceSources(): { kind: string; title: string; note: string; href?: string }[] {
  return [
    { kind: "원전", title: `A. E. Waite 『${PKT_TITLE}』 (${pkt.source.year})`, note: "카드 그림 설명과 정방향·역방향 뜻의 원전" },
    { kind: "원판", title: "라이더-웨이트-스미스 덱 (1909)", note: "78장 카드 그림의 기준" },
    { kind: "원전", title: `골든 던 『Book T』 (${bookT.source.year}년 인쇄본)`, note: "카드 이름과 점성 대응" },
    { kind: "대조", title: `요즘 해석 레퍼런스 ${modernSourceCount()}곳`, note: MODERN_SOURCES.join(" · ") },
    { kind: "만세력", title: `${factValue("saju-engine")} (오픈소스 만세력 엔진)`, note: "명식(연·월·일·시 네 기둥) 계산 · 엔진 11종을 비교해 고름" },
    { kind: "공공 데이터", title: "한국천문연구원(KASI) 음양력", note: "음력 날짜와 일진의 기준" },
    { kind: "천문 데이터", title: "NASA JPL Horizons (DE441)", note: "절기가 바뀌는 순간" },
    { kind: "천문 계산", title: "IAU SOFA (ERFA)", note: "절기 시각을 따로 구한 독립 계산" },
    { kind: "역사 자료", title: "한국 표준시·서머타임 변경 이력", note: "1908년 이후 표준시가 바뀐 때와 서머타임 시기를 출생 시각에 반영" },
    // ODbL attribution for the birthplace longitudes (lib/birthPlaces.ts); the count is the saju-birth-places fact's
    { kind: "지도 데이터", title: "OpenStreetMap 기여자 (ODbL 1.0)", note: `출생지 ${factValue("saju-birth-places")}의 경도`, href: BIRTH_PLACE_CREDIT_URL },
  ];
}

/** Which guide category each kind of source in evidenceSources() backs. */
const SOURCE_AREA: Readonly<Record<string, EvidenceArea>> = {
  원전: "tarot",
  원판: "tarot",
  대조: "tarot",
  만세력: "saju",
  "공공 데이터": "saju",
  "천문 데이터": "saju",
  "천문 계산": "saju",
  "역사 자료": "saju",
  "지도 데이터": "saju",
};

/**
 * 참고한 자료 on a guide article: the rows of evidenceSources() its category rests on, in the evidence page's order,
 * so an article's list is driven by its category and never typed per article.
 */
export function guideReferences(area: EvidenceArea): ReturnType<typeof evidenceSources> {
  return evidenceSources().filter((row) => {
    const of = SOURCE_AREA[row.kind];
    if (!of) throw new Error(`lib/evidence.ts: no guide category for the source kind ${row.kind}`);
    return of === area;
  });
}
