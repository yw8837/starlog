/**
 * Plain words for 명리 terms (owner 2026-10-07: "plain words first, the term in brackets", e.g. "내 재주를 꺼내 쓰는
 * 힘(식신)", "바깥에서 오는 압박과 책임(편관)", "기운이 가장 꽉 찬 단계(제왕)"). The saju prompts hand the model this
 * list, the mocks gloss with it, and the validators check the terms of `PLAIN_TERM_PATTERNS`. Each gloss says what the
 * term is, never whether it is good or bad (12운성's 병·사·묘·절 are stages, not misfortune).
 */
export const PLAIN_WORDS: Readonly<Record<string, string>> = Object.freeze({
  // 십성
  비견: "나와 어깨를 나란히 하는 힘",
  겁재: "겨루면서 함께 나누는 힘",
  식신: "내 재주를 꺼내 쓰는 힘",
  상관: "틀 밖으로 드러내는 표현력",
  편재: "넓게 벌이고 굴리는 재물 감각",
  정재: "차곡차곡 모으고 챙기는 살림 감각",
  편관: "바깥에서 오는 압박과 책임",
  정관: "지켜야 할 규칙과 맡은 자리",
  편인: "혼자 깊이 파고드는 배움",
  정인: "나를 받쳐 주는 도움과 배움",
  // 다섯 묶음
  비겁: "대등하게 어울리는 힘",
  식상: "표현하고 만들어 내는 힘",
  재성: "돈과 살림처럼 내가 다루는 것",
  관성: "나를 다잡는 약속과 질서",
  인성: "돌봄과 배움을 받는 힘",
  // 12운성
  장생: "기운이 막 자라기 시작하는 단계",
  목욕: "갓 자라 흔들리며 꾸미는 단계",
  관대: "어른 옷을 입고 나서는 단계",
  건록: "제 몫을 해내는 단단한 단계",
  제왕: "기운이 가장 꽉 찬 단계",
  쇠: "꽉 찬 기운이 차분해지는 단계",
  병: "기운이 느슨해지며 쉬어 가는 단계",
  사: "움직임을 멈추고 안으로 모으는 단계",
  묘: "기운을 거두어 갈무리하는 단계",
  절: "끊고 새로 이을 준비를 하는 단계",
  태: "새 기운이 막 생겨나는 단계",
  양: "새 기운을 품어 기르는 단계",
  // 자리와 흐름
  원국: "태어날 때 받은 글자 전체",
  천간: "기둥의 위 글자",
  지지: "기둥의 아래 글자",
  일간: "나를 나타내는 글자",
  일지: "나와 가장 가까운 관계의 자리",
  월지: "태어난 달의 아래 글자",
  월령: "태어난 계절이 쥔 기운",
  지장간: "글자 속에 숨은 기운",
  본기: "아래 글자를 대표하는 기운",
  십성: "나와 다른 글자 사이의 관계 이름",
  "12운성": "기운이 자라고 저무는 열두 단계",
  대운: "10년마다 바뀌는 큰 흐름",
  세운: "한 해의 흐름",
  월건: "그달의 기운",
});

/** "내 재주를 꺼내 쓰는 힘(식신)": the plain words, then the term in brackets. */
export const glossed = (term: string): string => (PLAIN_WORDS[term] ? `${PLAIN_WORDS[term]}(${term})` : term);

/** A glosser for one text written in reading order: each term in plain words the first time, as itself after that. */
export function glossOnce(): (term: string) => string {
  const seen = new Set<string>();
  return (term) => {
    if (seen.has(term)) return term;
    seen.add(term);
    return glossed(term);
  };
}

/**
 * What may come after (or before) a term when the same letters are an everyday word, each a paid regeneration when
 * misread (review 2026-10-08): 상관없이, a plan 세운 (세우다: "계획을 세운", "목표 세운 뒤"), 관성처럼 (inertia), 식상한 (trite),
 * 인성이 좋은 (character), 천간합·천간충 (a relation's own name). 지지 (support) is `BRANCH_TERM`'s.
 */
const EVERYDAY: Readonly<Record<string, { after?: string; before?: string }>> = {
  상관: { after: "없|이 없|하지|하고|할" },
  세운: {
    before: "[을를]\\s|(?:계획|목표|기준|약속|규칙|원칙|일정|다짐|순서|예산|전략|루틴|방향|방침|경계)\\s",
    after: "\\s?(?:계획|목표|기준|약속|규칙|원칙|일정|다짐|뜻|틀|순서|예산|전략|루틴|방향|방침|경계|선을|뒤|후(?!반)|대로)",
  },
  관성: { after: "처럼|적|대로|에\\s?(?:따라|이끌|젖|기대|빠지|빠져)|으로\\s?(?:굴러|움직|버티|계속|하던)" },
  식상: { after: "하|한|해|할|함|했" },
  인성: { after: "이?\\s?(?:좋|바르|바른|착하|착한|나쁘|나쁜|훌륭|뛰어나|된\\s?사람|못된)|\\s?(?:교육|검사|면접)|을\\s?갖춘" },
  천간: { after: "[합충]" },
};

/**
 * 지지 is support far more often than the 명리 term ("주변의 지지가", "든든한 지지가", "지지를 받는", review 2026-10-08), so it
 * counts only where it is the term: glossed ("기둥의 아래 글자(지지)", so a gloss stays its first appearance), beside 천간 ("천간과
 * 지지", "천간 둘과 지지 하나"), after a pillar or a layer ("대운 지지", "그 기둥의 지지"), or as a place ("지지에 뿌리", "지지 본기",
 * "지지끼리", "지지(地支)"). 월지 is a term of its own.
 */
const BRANCH_TERM = new RegExp([
  "(?<=\\()지지(?=\\))",
  "(?<=천간[^.?!\\n]{0,12})지지",
  "지지(?=[^.?!\\n]{0,12}천간)",
  "(?<=(?:대운|세운|원국|명식|기둥|[년월일시]주|월건)의?\\s)지지",
  "지지(?=\\s?\\(地支\\)|에(?!\\s?(?:힘입|기대|감사|보답))|의?\\s?(?:본기|대표|글자|자리)|끼리)",
].map((context) => `(?<![가-힣\\d])${context}`).join("|"));

/**
 * The terms a check can find without mistaking an everyday word (일지 is also a diary, 관대 generous, 목욕 a bath,
 * and the one-syllable stages are common words): at a word start, and never in the `EVERYDAY` uses of the same letters.
 */
export const PLAIN_TERM_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  "비견", "겁재", "식신", "상관", "편재", "정재", "편관", "정관", "편인", "정인",
  "비겁", "식상", "재성", "관성", "인성",
  "장생", "건록", "제왕",
  "원국", "천간", "지지", "일간", "월지", "월령", "지장간", "본기", "십성", "12운성", "대운", "세운", "월건",
].map((term) => {
  if (term === "지지") return [term, BRANCH_TERM] as const;
  const { after, before } = EVERYDAY[term] ?? {};
  return [term, new RegExp(`(?<![가-힣\\d]${before ? `|${before}` : ""})${term}${after ? `(?!${after})` : ""}`)] as const;
});

/** Text without its bracketed parts ("내 재주를 꺼내 쓰는 힘(식신)" → "내 재주를 꺼내 쓰는 힘"). */
export const outsideBrackets = (text: string) => text.replace(/\([^()]*\)/g, "");

/** The first index of each listed term in `text` that stands outside brackets there, in list order. */
export function bareFirstTerms(text: string): string[] {
  const spans = [...text.matchAll(/\([^()]*\)/g)].map((m) => [m.index, m.index + m[0].length] as const);
  return PLAIN_TERM_PATTERNS.filter(([, pattern]) => {
    const at = text.search(pattern);
    return at >= 0 && !spans.some(([from, to]) => from < at && at < to);
  }).map(([term]) => term);
}

/** `text` (a facts line copied into a reading) with each listed term glossed where `say` meets it first, outside brackets. */
export function glossText(text: string, say: (term: string) => string): string {
  let out = text;
  for (const [term, pattern] of PLAIN_TERM_PATTERNS) {
    const at = out.search(pattern);
    if (at < 0 || [...out.matchAll(/\([^()]*\)/g)].some((m) => m.index < at && at < m.index + m[0].length)) continue;
    out = `${out.slice(0, at)}${say(term)}${out.slice(at + term.length)}`;
  }
  return out;
}

/** The glossary as prompt lines ("- 식신: 내 재주를 꺼내 쓰는 힘"). */
export const plainWordsBlock = () => Object.entries(PLAIN_WORDS).map(([term, plain]) => `- ${term}: ${plain}`).join("\n");
