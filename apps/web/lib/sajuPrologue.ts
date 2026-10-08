/** 7절 (owner 2026-10-08, saju enrichment spec §3): the 살·귀인 names this chart carries, the only section that names them. */
export const SAJU_NAMES_HEADING = "이름표 풀이 · 이 명식에 붙는 이름들";
/** 8절: the scarcest element kept close (개운), as everyday choices. */
export const SAJU_GAEUN_HEADING = "기운 채우기 · 적은 기운을 곁에 두는 법";

/**
 * The saju reading's section headings, worded so they hold for any chart (the gold sample's
 * headings with its specifics removed) and in plain words first (owner 2026-10-07: a reader who
 * knows no 명리 terms). The server writes the reading under exactly these; the waiting screen
 * names them while they are written. Client-safe.
 */
export const SAJU_PROLOGUE_SECTIONS: readonly string[] = Object.freeze([
  "타고난 바탕 · 태어난 계절이 나에게 주는 힘",
  "많은 기운·적은 기운 · 다섯 기운이 놓인 모양과 숨은 기운",
  "나를 움직이는 힘 · 자주 꺼내 쓰는 두 힘과 그 사이의 긴장",
  "가까운 관계 속 나 · 가까운 사람 곁에서 드러나는 모습",
  "일할 때·쉴 때 · 두 장면으로 확인하기",
  "지금의 10년과 올해 · 10년마다 바뀌는 흐름 속 올해",
  SAJU_NAMES_HEADING,
  SAJU_GAEUN_HEADING,
  "계산 기준 · 보지 않은 것과 달라질 수 있는 것",
]);

/**
 * 한눈에 보기 (owner 2026-10-07): the card on top of every saju full reading, 전체 흐름 and each 운. It
 * answers in plain sentences where things go well, what to watch, one everyday way to make up for
 * it, and this year's flow with one thing to do. The model writes the sentences; these words are
 * code-owned (the card, the locked list).
 */
export const SAJU_GLANCE_HEADING = "한눈에 보기 · 잘 풀리는 쪽과 조심할 쪽, 올해 흐름";

export const SAJU_GLANCE_LABELS = Object.freeze({
  goesWell: "잘 풀리는 쪽",
  watchOut: "조심할 쪽",
  remedy: "이렇게 보완",
  thisYear: "올해 흐름",
});

/** The year's one thing to do sits under 올해 흐름 with an arrow; a screen reader hears it by this name. */
export const SAJU_GLANCE_ACTION_LABEL = "올해 해 볼 일";
