import { stemElement, type PillarKey, type SajuChart, type SajuElement, type Sinsal, type SinsalBasis, type SinsalName } from "@starlog/core";

/**
 * 살·귀인 name chips and 개운 (docs/superpowers/specs/2026-10-08-saju-enrichment-design.md §2, §5). Code-owned: the chart page
 * shows them free without a model, and the 정통 reading's facts carry the same lines. They name what a chart leans toward,
 * never an event, a fear or a cure. Client-safe.
 */

// ---- 이 명식에 붙는 이름 ----

export const SAJU_NAMES_TITLE = "이 명식에 붙는 이름";
/** Chips at most: the three 귀인 come first, so the rare sixth name left off is 화개. */
export const SAJU_NAMES_MAX = 5;

export const SINSAL_MEANINGS: Readonly<Record<SinsalName, string>> = Object.freeze({
  천을귀인: "막힐 때 도움을 청하고 받는 데 마음이 열린 배치에 붙는 이름",
  문창귀인: "글과 말, 공부로 생각을 꺼내는 쪽에 붙는 이름",
  학당귀인: "배움이 자라기 쉬운 자리에 붙는 이름",
  도화: "사람의 시선을 끄는 매력과 표현에 붙는 이름",
  역마: "움직임과 변화에 열린 배치에 붙는 이름",
  화개: "혼자 깊이 파고드는 몰입에 붙는 이름",
});

/** With no name found: what was looked for, without making it a lack. */
export const SAJU_NAMES_NONE = "흔히 보는 여섯 이름(천을·문창·학당귀인, 도화·역마·화개)은 이 명식에 붙지 않았어요.";

const BASIS_WORD: Readonly<Record<SinsalBasis, string>> = { 일간: "일간", 연지: "태어난 해", 일지: "태어난 날" };
const PLACE_WORD: Readonly<Record<PillarKey, string>> = { year: "태어난 해", month: "태어난 달", day: "태어난 날", hour: "태어난 시" };

/** Where a name was found, one clause a basis: "태어난 해 辰 기준 → 태어난 날 寅 · 태어난 날 寅 기준 → 태어난 달 申". */
export function sinsalBasisLine(s: Sinsal): string {
  const byBasis = new Map<string, string[]>();
  for (const hit of s.hits) {
    const basis = `${BASIS_WORD[hit.basis]} ${hit.basisGlyph} 기준`;
    byBasis.set(basis, [...(byBasis.get(basis) ?? []), `${PLACE_WORD[hit.pillar]} ${hit.branch}`]);
  }
  return [...byBasis].map(([basis, places]) => `${basis} → ${places.join(", ")}`).join(" · ");
}

// ---- 개운: the scarcest element ----

/** Traditional correspondences, used as labels only: never a cure, a number or a big move. */
export interface GaeunRow {
  colours: readonly string[];
  /** for small choices only (a walking route, the side of the desk) */
  direction: string;
  habits: readonly string[];
  environment: readonly string[];
}

export const GAEUN: Readonly<Record<SajuElement, GaeunRow>> = Object.freeze({
  목: { colours: ["초록", "청록"], direction: "동쪽", habits: ["화분 가꾸기", "숲길 산책", "스트레칭"], environment: ["창가에 식물 한 개"] },
  화: { colours: ["빨강", "주황"], direction: "남쪽", habits: ["낮 햇볕 10분", "땀 나는 걷기", "먼저 인사하기"], environment: ["따뜻한 색 조명"] },
  토: { colours: ["노랑", "베이지"], direction: "집 안 가운데", habits: ["정해진 시간 식사", "책상 정리"], environment: ["책상 위 한 칸 비우기"] },
  금: { colours: ["흰색", "은색", "회색"], direction: "서쪽", habits: ["비우기·청소", "정해 둔 마감", "천천히 호흡"], environment: ["물건 줄인 한 구역"] },
  수: { colours: ["검정", "남색"], direction: "북쪽", habits: ["물 자주 마시기", "반신욕", "충분한 잠"], environment: ["조용한 시간 한 칸"] },
});

/** Shown under the paid section 기운 채우기. */
export const GAEUN_NOTE = "오행 개수로 고른 재미로 보는 생활 제안이에요. 해 보고 안 맞으면 그만둬도 돼요.";

const ELEMENTS: readonly SajuElement[] = ["목", "화", "토", "금", "수"];

export interface ScarceElement {
  element: SajuElement;
  count: number;
  /** none among the visible glyphs, but in a visible branch's 지장간 ("숨은 불씨는 있어요") */
  hidden: boolean;
}

/** The fewest of the visible glyphs' elements (the counts the chart shows; 0 first): every element on that count. */
export function scarceElements(chart: Pick<SajuChart, "elements" | "pillars">): ScarceElement[] {
  const min = Math.min(...ELEMENTS.map((e) => chart.elements[e]));
  const inside = new Set(Object.values(chart.pillars).flatMap((p) => (p ? p.hidden.map((h) => stemElement(h.stem)) : [])));
  return ELEMENTS.filter((e) => chart.elements[e] === min).map((element) => ({ element, count: min, hidden: min === 0 && inside.has(element) }));
}

/** "곁에 두면 좋은 것: 빨강 포인트 · 낮 햇볕 10분": a tie names two colours at most, and the habit of the first. */
export function gaeunLine(scarce: readonly ScarceElement[]): string {
  const shown = scarce.slice(0, 2);
  return `곁에 두면 좋은 것: ${shown.map((s) => GAEUN[s.element].colours[0]).join("·")} 포인트 · ${GAEUN[shown[0]!.element].habits[0]}`;
}
