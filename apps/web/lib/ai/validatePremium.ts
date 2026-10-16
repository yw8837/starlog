import "server-only";
import type {
  DeepPartA, DeepPartB, DeepTeaserDraft, MatchPartA, MatchPartB, MatchTeaserDraft, NewYearPartA, NewYearPartB, NewYearPartC, NewYearTeaserDraft,
} from "./premiumSchemas";
import { MATCH_HEADINGS, ROMANTIC_RELATIONS, matchUserText, type MatchFacts } from "./prompts/match";
import { NEWYEAR_HEADINGS, type MonthFact, type NewYearFacts } from "./prompts/newyear";
import { ROMANCE_WORDS, cardLabel, mentionsWord, type TarotContext } from "./prompts/tarot";
import { SOFT_PREFIX, aiTellViolations } from "./style";
import {
  HEDGE, TOLERANCE, actionVarietyViolations, allowedFactViolations, cardIdentityViolations, cardSectionViolations, cardSubjectCount, charCount,
  chosenChips, commonTarotViolations, foreignCardViolations, inputRepeatViolations, inputUseViolations, inventedAmountViolations, lengthCheck, marriageContext,
  mentions, modelNameViolations, namesOf, profileUseViolations, quotedInputs, sentences, sharedMisdescriptionHits, userTextOf, voiceViolations,
  withoutDrawnNames,
} from "./validate";
import { maskGanzhiReadings } from "./ganzhi";
import type { FollowUpAnswer } from "./schemas";

/**
 * Premium validators (P5 spec §5). Same contract as validate.ts: a list of Korean violations, soft
 * ones prefixed with [문체]. Every validator starts with the model-name check (Task A) and the
 * premium-wide bans: the 10-card spread's traditional name and service talk ("베타").
 */

const TRADITION_NAME = /켈틱|셀틱|celtic/i;
const SERVICE_TALK = /베타/;

export function premiumCommonViolations(draft: unknown, texts: string[], out: string[]): void {
  modelNameViolations(draft, out);
  const all = texts.join("\n");
  if (TRADITION_NAME.test(all)) out.push("이 배열에 전통 배열의 이름을 붙이지 마세요. 자리 이름으로만 말해 주세요.");
  if (SERVICE_TALK.test(all)) out.push("서비스 이야기('베타')를 본문에 쓰지 마세요.");
}

/** 간지 readings that spell a banned word (임신 for 壬申): shared with the standard saju validators. */
export { maskGanzhiReadings } from "./ganzhi";

function followUpViolations(followUps: string[], out: string[]): void {
  if (followUps.length < 1 || followUps.length > 3 || followUps.some((q) => !q.trim() || charCount(q) > 40)) out.push("followUps는 30자 이하 질문 2개로 써 주세요.");
}

/** At least `need` of the cards in `slots` named in `text` (crossing, axes, staff). */
function namedCards(label: string, text: string, slots: number[], need: number, ctx: TarotContext, out: string[]): void {
  const named = slots.filter((slot) => namesOf(ctx.cards[slot]!.kb).some((name) => text.includes(name)));
  if (named.length < need) {
    out.push(`${label}에서 ${slots.map((s) => `${s + 1}번 ${ctx.cards[s]!.name}`).join(", ")} 가운데 ${need}장 이상을 이름으로 불러 주세요.`);
  }
}

// ---- 심층 타로 ----

export function validateDeepTeaser(d: DeepTeaserDraft, ctx: TarotContext): string[] {
  const out: string[] = [];
  const body = d.now.body;
  premiumCommonViolations(d, [body], out);
  const first = ctx.cards[0]!;
  lengthCheck("지금의 나 풀이", body, 300, 400, out);
  cardSectionViolations(`지금의 나(${cardLabel(first)})`, body, first, out);
  const hasInputs = chosenChips(ctx).length > 0 || ctx.note !== "";
  const usesInput = chosenChips(ctx).some((c) => mentions(body, c.value)) || (ctx.note !== "" && mentions(body, ctx.note, 0.3));
  if (hasInputs && !usesInput) out.push("미리보기에 사용자가 고른 조건이나 메모가 하나도 반영되지 않았어요.");
  commonTarotViolations(body, ctx, out);
  voiceViolations(body, out);
  inputRepeatViolations(body, quotedInputs(ctx), out);
  aiTellViolations([body], out);
  return out;
}

export function validateDeepPartA(a: DeepPartA, ctx: TarotContext): string[] {
  const out: string[] = [];
  const bodies = a.positions.map((p) => p.body);
  premiumCommonViolations(a, [a.verdict, ...bodies], out);
  cardIdentityViolations(a.positions, ctx, out);
  const verdict = charCount(a.verdict);
  if (verdict === 0 || verdict > 75) out.push(`한 줄 결론은 60자 이하 한 문장으로 써 주세요(지금 ${verdict}자).`);
  a.positions.forEach((section, i) => {
    const card = ctx.cards[i];
    if (!card) return;
    lengthCheck(`${card.position} 절`, section.body, 260, 340, out);
    cardSectionViolations(`${card.position} 절`, section.body, card, out);
  });
  const text = [a.verdict, ...bodies].join("\n");
  inputUseViolations(text, ctx, out);
  commonTarotViolations(text, ctx, out);
  voiceViolations(text, out);
  inputRepeatViolations(text, quotedInputs(ctx), out);
  inventedAmountViolations(text, userTextOf(ctx), out);
  if (cardSubjectCount(text, ctx.cards) > 4) out.push(`${SOFT_PREFIX}카드를 주어로 세운 문장('~는 ~라고 말해요')이 많아요. 자리별 풀이에서는 4번 이하로 줄여 주세요.`);
  aiTellViolations([text], out);
  return out;
}

export function validateDeepPartB(b: DeepPartB, ctx: TarotContext): string[] {
  const out: string[] = [];
  const texts = [b.crossing.body, b.axes.vertical, b.axes.horizontal, b.staff.body, b.timing.body, b.action.body, b.observation.body];
  premiumCommonViolations(b, [...texts, ...b.followUps], out);
  lengthCheck("교차 절", b.crossing.body, 350, 450, out);
  lengthCheck("세로 갈래", b.axes.vertical, 220, 300, out);
  lengthCheck("가로 갈래", b.axes.horizontal, 220, 300, out);
  lengthCheck("기둥 절", b.staff.body, 380, 500, out);
  lengthCheck("시기 절", b.timing.body, 150, 250, out);
  lengthCheck("행동 절", b.action.body, 80, 160, out);
  lengthCheck("관찰 절", b.observation.body, 80, 180, out);
  namedCards("교차 절", b.crossing.body, [0, 1], 2, ctx, out);
  namedCards("세로 갈래", b.axes.vertical, [2, 0, 4], 2, ctx, out);
  namedCards("가로 갈래", b.axes.horizontal, [3, 0, 5], 2, ctx, out);
  namedCards("기둥 절", b.staff.body, [6, 7, 8, 9], 3, ctx, out);
  followUpViolations(b.followUps, out);
  const text = texts.join("\n");
  const shared = sharedMisdescriptionHits(text, ctx.cards.map((c) => c.kb));
  if (shared.length) out.push(`그림에 없는 묘사가 있어요: ${shared.join(", ")}.`);
  commonTarotViolations([text, ...b.followUps].join("\n"), ctx, out);
  voiceViolations([text, ...b.followUps].join("\n"), out);
  actionVarietyViolations([b.action.body, b.timing.body, b.observation.body], out);
  inventedAmountViolations(text, userTextOf(ctx), out);
  if (cardSubjectCount(text, ctx.cards) > 3) out.push(`${SOFT_PREFIX}카드를 주어로 세운 문장이 많아요. 엮어 읽기에서는 3번 이하로 줄여 주세요.`);
  aiTellViolations([text], out);
  return out;
}

// ---- 우리 사이 궁합 ----

/** Marriage/divorce/reunion talk, 궁합 verdicts and scores, gender stereotypes (spec §5.2 hard bans). */
const MATCH_FORBIDDEN: Array<[RegExp, string]> = [
  [/결혼(할|하게|하면 좋|시기|운이)|이혼|재회|헤어지(게|면|는 게|기 쉬|자)|이별(하게|할|수)|다시 만나(게|요|는)|인연이 끝/, "결혼·이혼·재회·이별을 말하거나 암시하는 문장"],
  [/궁합\s?(점수|지수)|천생연분|찰떡|상극(이라|이에요|이어서|인)|두 사람(은|이)?\s?(잘|안)\s?맞/, "궁합 판정이나 점수"],
  [/(남자|여자|남성|여성)(는|은|들은)\s?(원래|대개|보통)/, "성별 고정관념"],
];
/** A feeling stated as a fact ("민지는 나를 좋아해요"). */
const FEELING = /(좋아해|사랑해|싫어해|그리워해|원해|후회해|관심\s?있어|마음이\s?있어|마음이\s?식었어|기다리고\s?있어|미안해해)요/;

/**
 * The 궁합 bans. The user's own concern may be quoted back verbatim; the same words written by the
 * model ("헤어지게 돼요") are a hard violation.
 */
export function matchSafetyViolations(text: string, m: MatchFacts, out: string[]): void {
  const judged = m.concern.length >= 2 ? text.split(m.concern).join(" ") : text;
  for (const [pattern, label] of MATCH_FORBIDDEN) {
    if (pattern.test(judged)) out.push(`쓰지 않는 표현이 있어요: ${label}. 조건과 행동으로 바꿔 주세요.`);
  }
  const subjects = ["그 사람", "상대", ...(m.label ? [m.label] : [])];
  if (sentences(judged).some((s) => subjects.some((who) => s.includes(who)) && FEELING.test(s) && !HEDGE.test(s))) {
    out.push("상대의 마음이나 감정을 사실처럼 단정한 문장이 있어요. 기질의 결과 분위기, 확인할 수 있는 신호로만 말해 주세요.");
  }
  if (!ROMANTIC_RELATIONS.has(m.relation)) {
    const words = ROMANCE_WORDS.filter((w) => mentionsWord(judged, w) && !mentionsWord(m.concern, w));
    if (words.length) out.push(`이 관계에 맞지 않는 연애 어휘가 있어요: ${words.join(", ")}.`);
  }
}

export function validateMatchTeaser(d: MatchTeaserDraft, m: MatchFacts): string[] {
  const out: string[] = [];
  premiumCommonViolations(d, [d.summary], out);
  lengthCheck("두 사람 첫인상", d.summary, 300, 400, out);
  allowedFactViolations(maskGanzhiReadings(d.summary), m.allowed, out, matchUserText(m));
  matchSafetyViolations(d.summary, m, out);
  voiceViolations(d.summary, out);
  aiTellViolations([d.summary], out);
  return out;
}

export function validateMatchPartA(a: MatchPartA, m: MatchFacts): string[] {
  const out: string[] = [];
  const keys = ["dayMasters", "elements", "pillars", "luck"] as const;
  const bodies = keys.map((k) => a[k].body);
  premiumCommonViolations(a, bodies, out);
  keys.forEach((k) => lengthCheck(MATCH_HEADINGS[k], a[k].body, 550, 750, out));
  const text = bodies.join("\n");
  allowedFactViolations(maskGanzhiReadings(text), m.allowed, out, matchUserText(m));
  matchSafetyViolations(text, m, out);
  const mine = m.me.dayMaster.display.slice(0, 2);
  const theirs = m.partner.dayMaster.display.slice(0, 2);
  if (!a.dayMasters.body.includes(mine) || !a.dayMasters.body.includes(theirs)) out.push(`${MATCH_HEADINGS.dayMasters} 절에서 두 일간(${mine}, ${theirs})을 모두 불러 주세요.`);
  if (m.pair.pillars.length && !/합|충|형|파|해\(|같은 글자|같은 간지/.test(a.pillars.body)) out.push(`${MATCH_HEADINGS.pillars} 절에 계산된 관계(합·충·형·파·해, 같은 글자·같은 간지)가 보이지 않아요.`);
  for (const ko of m.pair.luck.currentKo) if (!a.luck.body.includes(ko)) out.push(`${MATCH_HEADINGS.luck} 절에 지금 대운(${ko})이 보이지 않아요.`);
  voiceViolations(text, out);
  if (m.concern && !mentions(text, m.concern, 0.3)) out.push(`${SOFT_PREFIX}사용자의 한 줄 고민이 사주 풀이에 보이지 않아요. 그 고민에 닿는 장면을 하나 골라 주세요.`);
  aiTellViolations([text], out);
  return out;
}

export function validateMatchPartB(b: MatchPartB, m: MatchFacts, ctx: TarotContext): string[] {
  const out: string[] = [];
  const texts = [b.verdict, ...b.cards.map((c) => c.body), b.connection.body, b.bridge.body, b.action.body, b.observation.body];
  premiumCommonViolations(b, [...texts, ...b.followUps], out);
  cardIdentityViolations(b.cards, ctx, out);
  const verdict = charCount(b.verdict);
  if (verdict === 0 || verdict > 88) out.push(`${MATCH_HEADINGS.verdict}은 70자 이하 한 문장으로 써 주세요(지금 ${verdict}자).`);
  b.cards.forEach((section, i) => {
    const card = ctx.cards[i];
    if (!card) return;
    lengthCheck(`${card.position} 절`, section.body, 200, 280, out);
    cardSectionViolations(`${card.position} 절`, section.body, card, out);
  });
  lengthCheck(MATCH_HEADINGS.connection, b.connection.body, 220, 320, out);
  lengthCheck(MATCH_HEADINGS.bridge, b.bridge.body, 250, 380, out);
  lengthCheck(MATCH_HEADINGS.action, b.action.body, 80, 160, out);
  lengthCheck(MATCH_HEADINGS.observation, b.observation.body, 80, 180, out);
  if (!b.bridge.body.includes("사주") || !b.bridge.body.includes("카드")) out.push(`${MATCH_HEADINGS.bridge} 절은 "사주로는 ~, 카드로는 ~"처럼 두 출처를 밝혀 나란히 놓아 주세요.`);
  followUpViolations(b.followUps, out);
  const text = texts.join("\n");
  commonTarotViolations(maskGanzhiReadings([text, ...b.followUps].join("\n")), ctx, out, { topic: true, extraUserText: matchUserText(m) });
  // Card names are not claims: "죽음" and "연인" are cards here, not a death topic or a romance word.
  const plain = withoutDrawnNames(maskGanzhiReadings(text), ctx.cards.map((c) => c.kb));
  allowedFactViolations(plain, m.allowed, out, matchUserText(m), { cardText: true });
  matchSafetyViolations(plain, m, out);
  voiceViolations([text, ...b.followUps].join("\n"), out);
  actionVarietyViolations([b.action.body, b.observation.body], out);
  if (cardSubjectCount(text, ctx.cards) > 3) out.push(`${SOFT_PREFIX}카드를 주어로 세운 문장이 많아요. 3번 이하로 줄여 주세요.`);
  aiTellViolations([text], out);
  return out;
}

// ---- 2027 신년운세 ----

const ORGANS = /(?<![가-힣])(간장|위장|폐|심장|신장|갑상선|자궁|대장|혈관|혈압|당뇨|관절|척추|두통|위염|질환|증상|병원)/;
const LUCKY_FORBIDDEN = /(행운의|럭키)\s?(숫자|번호)|로또|복권|방위|동쪽|서쪽|남쪽|북쪽/;
const DATE = /(\d{1,2})\s?월\s?(\d{1,2})\s?일/g;

const newyearUserText = (n: NewYearFacts) => [n.facts.profile?.loveStatus, n.facts.profile?.workStatus, n.facts.profile?.concern].filter(Boolean).join(" ");

function titleViolations(title: string, out: string[]): void {
  const n = charCount(title);
  if (n < 3 || n > 18) out.push(`title은 4~14자로 써 주세요(지금 ${n}자).`);
}

/** Dates other than the 절입 days the facts give are invented. */
function dateViolations(text: string, n: NewYearFacts, out: string[]): void {
  const known = new Set(n.year.months.flatMap((m) => (m.term ? [m.term.kst.replace(/ \d\d:\d\d$/, "")] : [])));
  const bad = [...text.matchAll(DATE)].map((m) => `${Number(m[1])}월 ${Number(m[2])}일`).filter((d) => !known.has(d));
  if (bad.length) out.push(`날짜를 지정한 문장이 있어요(${bad[0]}). 달과 국면으로만 말해 주세요.`);
}

function monthViolations(items: Array<{ body: string }>, n: NewYearFacts, start: 0 | 6, out: string[]): void {
  if (items.length !== 6) out.push(`${start + 1}월부터 ${start + 6}월까지 정확히 6개를 써 주세요(지금 ${items.length}개).`);
  items.slice(0, 6).forEach((item, i) => {
    const m: MonthFact = n.year.months[start + i]!;
    lengthCheck(`${m.month}월`, item.body, 280, 380, out);
    if (![m.ko, m.gz, m.stemTenGod, m.branchMainTenGod].some((w) => item.body.includes(w))) out.push(`${m.month}월 문단에 그 달 월건(${m.display})이나 그 십성을 불러 주세요.`);
  });
  if (start === 0 && items[0] && !items[0].body.includes(n.year.january.ko)) out.push(`1월 문단에서 아직 ${n.year.january.ko}년이라는 점을 밝혀 주세요.`);
}

/** Facts, dates, voice and AI tells over the prose; 결혼 is a subject when the user's love status makes it one. */
function newyearProse(texts: string[], n: NewYearFacts, out: string[]): void {
  const text = texts.join("\n");
  allowedFactViolations(maskGanzhiReadings(text), n.allowed, out, newyearUserText(n), { marriage: marriageContext(n.facts) });
  dateViolations(text, n, out);
  voiceViolations(text, out);
  aiTellViolations([text], out);
}

export function validateNewYearTeaser(d: NewYearTeaserDraft, n: NewYearFacts): string[] {
  const out: string[] = [];
  premiumCommonViolations(d, [d.title, d.summary], out);
  titleViolations(d.title, out);
  lengthCheck("미리보기", d.summary, 300, 400, out);
  if (!d.summary.includes(n.facts.annual.ko)) out.push(`미리보기에서 2027 세운(${n.facts.annual.ko})을 불러 주세요.`);
  newyearProse([d.title, d.summary], n, out);
  return out;
}

export function validateNewYearPartA(a: NewYearPartA, n: NewYearFacts): string[] {
  const out: string[] = [];
  const h = NEWYEAR_HEADINGS;
  const areas = (["work", "money", "relations", "health"] as const).map((k) => a.areas[k].body);
  const texts = [a.title, a.overview.body, a.luck.body, ...areas, a.lucky.body];
  premiumCommonViolations(a, texts, out);
  titleViolations(a.title, out);
  lengthCheck(h.overview, a.overview.body, 500, 700, out);
  lengthCheck(h.luck, a.luck.body, 300, 450, out);
  (["work", "money", "relations", "health"] as const).forEach((k) => lengthCheck(h[k], a.areas[k].body, 280, 400, out));
  lengthCheck(h.lucky, a.lucky.body, 120, 220, out);
  const annual = n.facts.annual;
  if (!a.overview.body.includes(annual.ko)) out.push(`${h.overview} 절에서 2027 세운(${annual.ko})을 불러 주세요.`);
  if (!a.overview.body.includes(annual.stemTenGod) && !a.overview.body.includes(annual.branchMainTenGod)) out.push(`${h.overview} 절에 세운의 십성(${annual.stemTenGod} 또는 ${annual.branchMainTenGod})을 써 주세요.`);
  const current = n.facts.luck?.current;
  if (current && !a.luck.body.includes(current.ko)) out.push(`${h.luck} 절에 2027년의 대운(${current.ko})을 불러 주세요.`);
  if (n.year.luckChange && !/바뀌|넘어가|접어들/.test(a.luck.body)) out.push(`${h.luck} 절에서 2027년 안에 대운이 바뀐다는 점을 분명하게 써 주세요.`);
  if (ORGANS.test(a.areas.health.body)) out.push(`${h.health} 절은 생활 습관으로만 써 주세요. 장기·질병·증상 이름은 쓰지 않아요.`);
  if (LUCKY_FORBIDDEN.test(a.lucky.body)) out.push(`${h.lucky} 절에 행운의 숫자·방위·복권 이야기는 쓰지 않아요.`);
  if (!/재미/.test(a.lucky.body)) out.push(`${h.lucky} 절에서 재미로 보는 제안이라는 점을 밝혀 주세요.`);
  profileUseViolations(texts.join("\n"), n.facts, out);
  newyearProse(texts, n, out);
  return out;
}

export function validateNewYearPartB(b: NewYearPartB, n: NewYearFacts): string[] {
  const out: string[] = [];
  const texts = b.firstHalf.map((m) => m.body);
  premiumCommonViolations(b, texts, out);
  monthViolations(b.firstHalf, n, 0, out);
  newyearProse(texts, n, out);
  return out;
}

export function validateNewYearPartC(c: NewYearPartC, n: NewYearFacts): string[] {
  const out: string[] = [];
  const texts = [...c.secondHalf.map((m) => m.body), c.closing.body, c.observation.body];
  premiumCommonViolations(c, [...texts, ...c.followUps], out);
  monthViolations(c.secondHalf, n, 6, out);
  lengthCheck(NEWYEAR_HEADINGS.closing, c.closing.body, 250, 380, out);
  lengthCheck(NEWYEAR_HEADINGS.observation, c.observation.body, 80, 180, out);
  followUpViolations(c.followUps, out);
  newyearProse([...texts, ...c.followUps], n, out);
  return out;
}

/**
 * A follow-up on a 궁합 reading (P5 spec §6.3): the standard length, the pair's allowed facts (the
 * question's own words may be quoted), the 궁합 bans, no card outside the five drawn.
 */
export function validateMatchFollowUp(a: FollowUpAnswer, m: MatchFacts, ctx: TarotContext, question = ""): string[] {
  const out: string[] = [];
  premiumCommonViolations(a, [a.answer], out);
  lengthCheck("answer", a.answer, 150, 450, out);
  allowedFactViolations(maskGanzhiReadings(a.answer), m.allowed, out, `${matchUserText(m)} ${question}`);
  matchSafetyViolations(a.answer, m, out);
  foreignCardViolations(a.answer, ctx.cards.map((c) => c.kb), out);
  voiceViolations(a.answer, out);
  aiTellViolations([a.answer], out);
  return out;
}

// TOLERANCE is re-exported for the premium tests' length bands.
export { TOLERANCE };
