import "server-only";
import { BRANCHES, STEMS, ganzhiKo } from "@starlog/core";
import { PLAIN_TERM_PATTERNS } from "./plainWords";
import { SAJU_VOICE_EXAMPLES } from "./prompts/saju";
import type { SajuGlance, TarotReading } from "./schemas";
import { VOICE_PREFIX, boldPhraseOk, boldSpans, stripBold } from "./style";

/**
 * The reading voice's soft checks (docs/research/reading-voice-2026-10.md §4.3, owner 2026-10-08). Every finding carries
 * VOICE_PREFIX: soft, and never a regeneration of its own (style.ts). They read the text with its bold marks; the hard
 * checks read it without them.
 */

const sentencesOf = (text: string) => text.split(/(?<=[.?!])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
const count = (text: string, re: RegExp) => [...text.matchAll(re)].length;
const QUOTED = /'[^'\n]*'|"[^"\n]*"|“[^”]*”|‘[^’]*’/g;

// ---- W1: 명리 terms ----

const TERMS = PLAIN_TERM_PATTERNS.map(([, re]) => new RegExp(re.source, `${re.flags}g`));
const GLYPH_NAME = /(?<![가-힣])(?:갑목|을목|병화|정화|무토|기토|경금|신금|임수|계수|자수(?!성가)|축토|인목|묘목|진토|사화|오화|미토|유금|술토|해수(?!욕))/g;
const RELATION = /육합|천간합|천간충|반합|삼합|방합|자형|(?<![가-힣])(?:충|형|파|해)\((?:沖|刑|破|害)\)|(?<![가-힣])충(?=[,.]|\s관계|이|을|의)/g;
/** Place words the glossary leaves out (일지 is also a diary there). */
const PLACE_EXTRA = /(?<![가-힣])(?:일지|월간|년간|년지|시지|명식)/g;
const SIXTY = Array.from({ length: 60 }, (_, i) => STEMS[i % 10]! + BRANCHES[i % 12]!);
const GANZHI_NAMES = [...SIXTY.map(ganzhiKo), ...SIXTY].join("|");
/** A 간지 named as a layer ("무오 대운", "무오(戊午) 대운", "戊戌 월건"): a name the section must call, not a term. */
const NAMED_LAYER = new RegExp(`(?:${GANZHI_NAMES})(?:\\([^()]*\\))?\\s?(?:대운|세운|월건)`, "g");
/** A 간지 by its Hangul name where it reads as one ("병오년", "병오(", "무오 대운"), never 갑자기. */
const GANZHI_KO = new RegExp(`(?<![가-힣])(?:${SIXTY.map(ganzhiKo).join("|")})(?=년|월(?!요)|\\(|\\s?(?:대운|세운))`);

/** The 명리 terms in a text (§4.3 W1): the glossary's terms, glyph names, relation names and place words; a 간지's own name is none. */
export function termCount(text: string): number {
  const t = stripBold(text).replace(NAMED_LAYER, "□");
  return TERMS.reduce((sum, re) => sum + count(t, re), 0) + count(t, GLYPH_NAME) + count(t, RELATION) + count(t, PLACE_EXTRA);
}

// ---- W3, W4 ----

/** A scene or a question in a section's first two sentences (§4.3 W3). */
const SCENE = /\?|(?:할|한|했을|하던|받을|생길|올) (?:때|적)|적(?: 이)? (?:많|있)/;
/**
 * The confirmation formula, disclaimers, previews and glyphs as subjects (§2.5): none in the body. Read outside quotes,
 * and the disclaimers as they are said ("판단하지 않았어요"), never everyday advice ("혼자 판단하지 않고").
 */
const STOCK = /맞물리|맞물려|덜 맞는|덜 들어맞|비켜 간|비껴가|빗나간|이 읽기와 이어|이 읽기가 들어맞|이 읽기에 가깝|맞게 읽힌|라벨(?:은|을)? 붙이지|판단하지(?:는)? 않았|따지지(?:는)? 않았|사건으로 (?:읽|보)지|사건이 아니라|불운이 아니라|있다는 사실만|부터 (?:살펴)?볼게요|짚을 것이 있어요|다음 이야기예요|고개를 들|곁을 지켜/g;
/** "힘이 붙어요", "힘(비겁)이 실려서", "무게가 실려요": three times at most in a reading, the card included. */
const STOCK_POWER = /힘(?:\([^)]*\))?이 (?:잘 )?붙|힘(?:\([^)]*\))?이 (?:겹으로 )?(?:실리|실려|실린)|무게가 실/g;
/**
 * Phrases a reading may say a set number of times (§2.4, §2.5), the new template's own included: three, as the prompt's
 * "같은 표현·문형은 풀이 전체에서 두세 번까지" allows (review 2026-10-08), and the one 빗나감 line once.
 */
const LIMITED: ReadonlyArray<readonly [RegExp, number, string]> = [
  [/셈이죠/g, 3, "셈이죠"],
  [/결이에요/g, 3, "결이에요"],
  [/구조예요/g, 3, "구조예요"],
  [/국면이에요/g, 3, "국면이에요"],
  [/가볍게 넘겨도 돼요/g, 1, "가볍게 넘겨도 돼요"],
  [/잠시 숨을 고르/g, 3, "잠시 숨을 고르고"],
  [/적 많지 않나요/g, 3, "적 많지 않나요"],
  [/이번 주(?:에는|에)?\s[^.?!]{0,40}보세요/g, 3, "이번 주에는 ~해 보세요"],
  // the template's own second scene, advice and tendency (review 2026-10-08: the next stock phrases, §5)
  [/식이죠/g, 3, "식이죠"],
  [/나쁘지 않아요|나쁜 건 아니에요/g, 3, "나쁘지 않아요"],
  [/편이에요/g, 3, "편이에요"],
];
/** A 대운 or 세운 change as the facts once gave it ("2027-09"), not as a reader says it ("2027년 9월 무렵"). */
const YEAR_MONTH = /(?<!\d)(?:19|20)\d{2}-(?:0[1-9]|1[0-2])(?!\d)/;

// ---- W5 ----

const PAREN_OPEN = /\(/g;
/** A 간지 or a glyph in hanja ("(丙午)", "(辛金)", "(木)"): the name's own brackets, not the section's one. */
const HANJA_PAREN = /\([一-鿿·\s]+\)/g;
const parenCount = (text: string) => count(text, PAREN_OPEN) - count(text, HANJA_PAREN);

/** What is wrong with a part's bold (`max` phrases at most, `min` at least): "" when nothing. */
function boldIssue(text: string, min: number, max: number): string {
  const { phrases, paired } = boldSpans(text);
  if (!paired) return "짝이 맞지 않는 굵게 표시";
  if (phrases.length < min) return "굵게 없음";
  if (phrases.length > max) return max === 0 ? "굵게 쓰지 않는 칸에 굵게" : `굵게 ${phrases.length}개`;
  const bad = phrases.find((p) => !boldPhraseOk(p) || termCount(p) > 0 || GANZHI_KO.test(p));
  return bad === undefined ? "" : `굵게 '${bad.slice(0, 12)}'(4~20자, 용어·간지·질문 없이)`;
}

// ---- example reuse ----

const WINDOW = 12;
const normalize = (text: string) => stripBold(text).replace(/[^가-힣A-Za-z0-9]/g, "");
/** Each example sentence with its 12-character windows; its [ ] slots are this chart's facts, so windows stop at them. */
const EXAMPLE_WINDOWS = SAJU_VOICE_EXAMPLES.flatMap(sentencesOf).map((sentence) => ({
  sentence,
  windows: sentence.split(/\[[^\]]*\]/).flatMap((part) => {
    const p = normalize(part);
    return Array.from({ length: Math.max(0, p.length - WINDOW + 1) }, (_, i) => p.slice(i, i + WINDOW));
  }),
}));

/** The prompt example sentence a text reuses word for word (12 characters or more in a row), or null. */
export function exampleReuse(text: string): string | null {
  const t = normalize(text);
  return EXAMPLE_WINDOWS.find((e) => e.windows.some((w) => t.includes(w)))?.sentence ?? null;
}

// ---- saju ----

export interface SajuVoiceParts {
  /** the body sections' headings, in order (the 계산 기준 절 is `basis`) */
  headings: readonly string[];
  bodies: string[];
  basis: string;
  observation: string;
  glance: SajuGlance;
  /**
   * The terms and brackets each body section may hold, by section; one where not given. A 운's 2절·3절 must name each
   * group counted 0, and their place besides when it is not one of them (validateSajuTopics' anchors).
   */
  budget?: readonly number[];
}

const label = (heading: string) => `'${heading.split(" · ")[0]}'`;

/** §4.3 W1–W5 and §4.2's dates and examples, for a saju full reading (전체 흐름 or a 운). */
export function sajuVoiceViolations(p: SajuVoiceParts, out: string[]): void {
  const sections = p.bodies.map((body, i) => ({ name: label(p.headings[i] ?? `${i + 1}번째 절`), body }));
  const observation = { name: "'관찰'", body: p.observation };
  const card = [p.glance.goesWell, p.glance.watchOut, p.glance.remedy, p.glance.thisYear, p.glance.thisYearAction];
  const all = [...card, ...p.bodies, p.observation].join("\n");
  // one term and one bracket a section, or as many as the section must name (the observation's index has none)
  const budget = (i: number) => Math.max(1, p.budget?.[i] ?? 1);

  // W1: one 명리 term a section; a sentence listing more glyph names than the prompt's three
  const heavy = [...sections, observation].map((s, i) => [s.name, termCount(s.body), budget(i)] as const).filter(([, n, max]) => n > max);
  const listing = [...sections, observation].some((s) => sentencesOf(s.body).some((sentence) => count(sentence, GLYPH_NAME) > 3));
  if (heavy.length || listing) {
    out.push(`${VOICE_PREFIX}명리 용어가 한 절에 둘 이상 나왔어요${heavy.length ? `: ${heavy.map(([name, n, max]) => `${name} ${n}개${max > 1 ? `(${max}개까지)` : ""}`).join(", ")}` : ""}.${listing ? " 한 문장에 글자 이름을 셋 넘게 늘어놓지 마세요." : ""} 절마다 용어는 하나까지 쓰고 나머지는 쉬운 말로 바꿔 주세요. 꼭 밝혀야 하는 자리와 묶음 이름은 그대로 두세요.`);
  }
  // W2
  const frames = count(all, /명리에서/g);
  if (frames > 1) out.push(`${VOICE_PREFIX}'명리에서는 ~로 읽어요'를 ${frames}번 썼어요. 풀이 전체에서 한 번까지만 쓰고, 해석은 장면 질문과 '~하는 편이에요' 같은 끝맺음으로 드러내 주세요.`);
  // W3 (not the observation)
  const flat = sections.filter((s) => !SCENE.test(sentencesOf(s.body).slice(0, 2).join(" "))).map((s) => s.name);
  if (flat.length) out.push(`${VOICE_PREFIX}장면이나 질문으로 시작하지 않은 절이 있어요: ${flat.join(", ")}. 첫 문장은 그 사람이 겪었을 법한 장면을 묻는 질문으로 열어 주세요.`);
  // W4 (not the 계산 기준 절, which keeps the disclaimers)
  const stock = [...sections, observation, { name: "카드", body: card.join("\n") }]
    .flatMap((s) => [...new Set([...s.body.replace(QUOTED, "''").matchAll(STOCK)].map((m) => `${s.name} "${m[0]}"`))]);
  const power = count(all, STOCK_POWER);
  if (power > 3) stock.push(`힘이 붙어요·힘이 실려요 ${power}번`);
  for (const [re, max, name] of LIMITED) {
    const n = count(all, re);
    if (n > max) stock.push(`"${name}" ${n}번`);
  }
  if (stock.length) out.push(`${VOICE_PREFIX}상투 문구가 있어요: ${stock.slice(0, 6).join(", ")}. 확인 공식·해명·예고는 빼고(해명은 계산 기준 절에 한 번만), 정해진 횟수를 넘긴 문구는 다른 말로 바꿔 주세요.`);
  // W5: bold 1–2 a body section and none in 계산 기준 or the observation; one bracket a section; the card's own budget
  const over = [
    ...sections.map((s, i) => [s.name, boldIssue(s.body, 1, 2), parenCount(s.body), budget(i)] as const),
    [observation.name, boldIssue(p.observation, 0, 0), parenCount(p.observation), 1] as const,
    ["'계산 기준'", boldIssue(p.basis, 0, 0), 0, 1] as const,
  ].flatMap(([name, bold, parens, max]) => [bold ? `${name} ${bold}` : "", parens > max ? `${name} 괄호 ${parens}개` : ""]).filter(Boolean);
  const cardBold = boldIssue(`${p.glance.goesWell}\n${p.glance.watchOut}`, 0, 2) || boldIssue([p.glance.remedy, p.glance.thisYear, p.glance.thisYearAction].join("\n"), 0, 0);
  if (cardBold) over.push(`카드 ${cardBold}`);
  const cardParens = card.reduce((sum, text) => sum + parenCount(text), 0);
  if (cardParens > 1) over.push(`카드 괄호 ${cardParens}개`);
  if (over.length) out.push(`${VOICE_PREFIX}굵게·괄호 예산을 넘었어요: ${over.slice(0, 6).join(", ")}. 본문 절마다 경향과 행동의 핵심 구 한두 개(4~20자)만 굵게 하고 용어·간지·질문은 굵게 하지 말아 주세요. 카드는 잘 풀리는 쪽과 조심할 쪽에 두 개까지, 괄호는 절마다 하나까지예요.`);
  // the date form, everywhere
  const ym = YEAR_MONTH.exec([all, p.basis].join("\n"))?.[0];
  if (ym) out.push(`${VOICE_PREFIX}날짜를 '${ym}'처럼 썼어요. 대운·세운이 바뀌는 때는 '2027년 9월 무렵'처럼 사람의 말로 써 주세요.`);
  // example reuse
  const reused = exampleReuse(all);
  if (reused) out.push(`${VOICE_PREFIX}프롬프트의 형식 예시 문장을 그대로 옮겼어요("${reused.slice(0, 24)}…"). 예시는 형식만 참고하고 이 사람의 장면과 말로 새로 써 주세요.`);
}

// ---- tarot ----

/** The position frame (§2.5: once a reading), maxim endings, a lone reversed opener, an element pair, 합쇼체. */
const POSITION_FRAME = /자리(?:에서는|는) /g;
const MAXIM = /한 줄로 (?:말하|정리하)면|이 자리의 (?:핵심|열쇠)(?:이에요|예요)/;
const LONE_REVERSED = /역방향으로 나왔어요[.!]?$/;
const ELEMENT_PAIR = /(?:불|물|흙|공기)의 (?:카드|두 장|한 장)|장의 (?:불|물)/;
const HASIPSIO = /니다(?=[.!?]|\s*$)/m;
/** "평소처럼", "지금처럼": a 처럼 every text uses, not a picture's simile ("월계관 기수처럼", "등불 든 노인처럼"). */
const EVERYDAY_LIKE = new Set(["평소", "지금", "예전", "처음", "이전", "오늘", "어제", "내일", "언제나", "늘", "원래", "이", "그", "저", "전", "말", "생각", "계획", "약속", "마음", "뜻", "바람", "기대", "습관"]);
const pictureSimile = (text: string) => [...text.matchAll(/([가-힣]+)처럼/g)].some((m) => !EVERYDAY_LIKE.has(m[1]!));

/** §2.5's tarot rows and §2.2's one bold phrase a card section, for the standard tarot reading. */
export function tarotVoiceViolations(r: TarotReading, out: string[]): void {
  const others = [
    r.verdict, r.connection.body, r.timing.body, r.observation.body, ...r.scenarios.items.flatMap((i) => [i.label, i.body]),
    ...r.messages.items, r.messages.hint, ...r.avoid.items, r.alternatives.body, r.action.body,
  ];
  const all = [...r.cards.map((c) => c.body), ...others].join("\n");
  const stock: string[] = [];
  const frames = count(all, POSITION_FRAME);
  if (frames > 1) stock.push(`'X 자리에서는' ${frames}번`);
  const maxim = MAXIM.exec(all)?.[0];
  if (maxim) stock.push(`"${maxim}"`);
  const lone = r.cards.find((c) => {
    const first = sentencesOf(c.body)[0] ?? "";
    return LONE_REVERSED.test(first) && first.replace(/\s/g, "").length <= 40;
  });
  if (lone) stock.push(`'${lone.position}' 절의 첫 문장 "역방향으로 나왔어요"`);
  const similes = r.scenarios.items.filter((i) => pictureSimile(i.body)).length;
  if (similes > 1) stock.push(`그림 비유로 시작하는 갈래 ${similes}개`);
  const pair = ELEMENT_PAIR.exec(r.connection.body)?.[0];
  if (pair) stock.push(`"${pair}"`);
  if (HASIPSIO.test(all.replace(QUOTED, "''"))) stock.push("'~입니다'");
  if (stock.length) out.push(`${VOICE_PREFIX}타로 상투 문구가 있어요: ${stock.join(", ")}. 카드 절은 그림 한 컷으로 열고 역방향은 다음 문장에서 말하며, 자리 프레임과 격언 맺기는 리딩 전체에서 한 번까지만 써 주세요.`);
  const bold = [
    ...r.cards.map((c) => [c.position, boldIssue(c.body, 0, 1)] as const),
    ["카드 절 밖", boldIssue(others.join("\n"), 0, 0)] as const,
  ].filter(([, issue]) => issue).map(([where, issue]) => `'${where}' ${issue}`);
  if (bold.length) out.push(`${VOICE_PREFIX}굵게가 예산을 넘었어요: ${bold.join(", ")}. 굵게는 카드 절마다 핵심 구 하나(4~20자)까지만 써 주세요.`);
}
