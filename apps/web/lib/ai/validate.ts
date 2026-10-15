import "server-only";
import { BRANCHES, STEMS, ganzhiKo } from "@starlog/core";
import { KB_CARDS, type KbCard } from "@/lib/kb";
import {
  SAJU_GAEUN_HEADING, SAJU_GLANCE_ACTION_LABEL, SAJU_GLANCE_HEADING, SAJU_GLANCE_LABELS, SAJU_MAIN_SECTIONS, SAJU_NAMES_HEADING, SAJU_PART_A_SECTIONS,
  SAJU_PART_B_SECTIONS, SAJU_PROLOGUE_SECTIONS,
} from "@/lib/sajuPrologue";
import { maskGanzhiReadings } from "./ganzhi";
import { bareFirstTerms, glossed, outsideBrackets } from "./plainWords";
import type { SajuFactSet } from "./prompts/saju";
import { UNSURE_OPTIONS, cardLabel, mentionsWord, tarotHeadings, type TarotCardContext, type TarotContext } from "./prompts/tarot";
import type {
  DailyDraft, FollowUpAnswer, SajuEnrichment, SajuGlance, SajuReading, SajuReadingPartA, SajuReadingPartB, SajuTeaserDraft, TarotReading, TarotTeaserDraft,
} from "./schemas";
import { MODEL_NAMES, SOFT_PREFIX, aiTellViolations, allowBold } from "./style";
import { sajuVoiceViolations, tarotVoiceViolations } from "./voice";

/**
 * Post-generation checks. Each returns a list of violations in Korean (fed back to the model on the
 * one regeneration); an empty list passes. Code catches what code can: structure, lengths, the
 * blocklists, topic drift, card fidelity, KB image facts and misdescriptions, chip and note use.
 * Whether every visual claim is in the KB beyond the misdescription list needs a judge model (P2 B6a).
 */

// ---- text utilities ----

/** Characters without whitespace or bold marks (the unit of every length target). */
export const charCount = (text: string) => text.replace(/\s|\*\*/g, "").length;

/** A draft as every check but the voice's reads it: its words, without the bold marks (reading-voice-2026-10 §2.2). */
const withoutBold = <T>(draft: T): T => JSON.parse(JSON.stringify(draft).replaceAll("**", "")) as T;

export const TOLERANCE = 0.25;

/** Length target with the plan's ±25% band. */
export function lengthCheck(label: string, text: string, min: number, max: number, out: string[], tolerance = TOLERANCE): void {
  const n = charCount(text);
  const lo = Math.floor(min * (1 - tolerance));
  const hi = Math.ceil(max * (1 + tolerance));
  if (n < lo || n > hi) out.push(`${label} 길이가 공백 제외 ${n}자예요. ${min}~${max}자로 맞춰 주세요.`);
}

const PARTICLE = /(으로|에서|에게|까지|부터|처럼|하고|이다|한다|된다|있다|이|가|은|는|을|를|에|의|로|와|과|도|만|엔|고|며|다)$/;
const STOP_STEMS = new Set(["모습", "그림", "카드", "하나", "있어", "있는", "있고", "그리", "보인"]);

/** Rough Korean stems: particles stripped, then the last syllable dropped from longer words. */
export function stems(text: string): string[] {
  const out = new Set<string>();
  for (const word of text.split(/[\s,.·!?'"()~/:;“”‘’…\-[\]]+/)) {
    let w = word.replace(PARTICLE, "");
    if (w.length >= 3) w = w.slice(0, -1);
    if (w.length >= 2 && !STOP_STEMS.has(w)) out.add(w);
  }
  return [...out];
}

/** True when `phrase` (a chip value, a note) shows up verbatim or by at least half of its stems. */
export function mentions(text: string, phrase: string, share = 0.5): boolean {
  if (text.includes(phrase)) return true;
  const s = stems(phrase);
  if (s.length === 0) return true;
  const found = s.filter((stem) => text.includes(stem)).length;
  return found >= Math.max(1, Math.ceil(s.length * share));
}

export const sentences = (text: string) => text.split(/(?<=[.?!])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
const hasHangul = (text: string) => /[가-힣]/.test(text);
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---- blocklists ----

/** Guarantees, fate talk, medical/death claims, pressure (spec §15, research R10). */
const BLOCKLIST: Array<[RegExp, string]> = [
  [/확률/, "'확률'"],
  [/반드시|무조건|틀림없|절대로/, "단정 부사(반드시·무조건·틀림없이·절대로)"],
  [/100\s*%|백\s*퍼센트/, "'100%'"],
  [/운명(?!의\s*(수레)?바퀴)/, "'운명'"],
  [/우주가|에너지가\s*흐르|모든 일에는 이유가|때가 되면/, "상투적인 운명론 문구"],
  [/(병|질병|질환|암)(에|이|을|를)?\s?(걸리|걸릴|진단|발병)/, "질병 예언"],
  [/죽(게 되|을 거|는다|을 수도)|사망|수명/, "죽음·수명 예언"],
  [/임신|출산/, "임신·출산 언급"],
  [/사고(가 나|가 날|를 당)/, "사고 예언"],
  [/(지금|당장)\s?(결제|구매)/, "결제 압박"],
  [/때도 있지만[^.?!]{0,40}때도/, "양면 성격 문장(바넘)"],
  [/생각보다 강(해요|한 사람)/, "무조건적 위로(바넘)"],
];

/**
 * Money: only direct buy/invest/borrow orders and profit promises. Advice the prompt asks for
 * ("무리한 투자보다는 지출 점검부터", "대출 이자부터 확인", "공부에 시간을 투자") passes.
 */
const MONEY_ORDERS = [
  /(투자|매수)(를|을)?\s?(하세요|해\s?보세요|하셔도|해도\s?(돼요|좋아요)|할\s?때예요|하기\s?좋은)/,
  /(주식|코인|로또|복권|부동산|청약|펀드|종목)[^.?!]{0,12}(사세요|사\s?(보세요|두세요)|넣(어\s?보세요|으세요)|하세요|해\s?보세요|시작하기\s?좋)/,
  /대출(을|를)?\s?(받으세요|받아\s?보세요|받아도\s?(돼요|좋아요)|받기\s?좋)/,
];
const MONEY_PROMISE = /(수익|돈|목돈|큰돈)(이|을)?\s?(나요|날\s?거|생겨요|생길\s?거|벌\s?수\s?있|들어와요|들어올\s?거)|(값|주가|시세)(이|가)?\s?(오를|오릅|뛸)|대박/;
/** Contrastive or preparatory sentences ("~보다는", "~대신", "~말고", "~전에") are advice, not orders. */
const CONTRAST = /보다는|대신|말고|전에/;
const NON_FINANCIAL = /(시간|노력|정성|마음|에너지|공부)[^.?!]{0,8}투자/;

export function moneyPushSentences(text: string): string[] {
  return sentences(text).filter((s) => (MONEY_ORDERS.some((re) => re.test(s)) || MONEY_PROMISE.test(s)) && !CONTRAST.test(s) && !NON_FINANCIAL.test(s));
}

/** Matches of `pattern` that the user did not write themselves (their own words may be quoted back). */
export function matchesBeyondUser(pattern: RegExp, text: string, userText: string): string[] {
  const global = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  return [...text.matchAll(global)].map((m) => m[0]).filter((hit) => !userText.includes(hit));
}

/** Who "the other person" can be, a partner or spouse included (marriage readings). */
export const OTHER = "그 사람|상대방?|그분|걔|그 친구|그녀|그는|그가|배우자|남자\\s?친구|여자\\s?친구|남친|여친|예비\\s?(?:신랑|신부)";
const OTHER_MIND = new RegExp(`(${OTHER})[^.?!]{0,15}(마음|속마음|감정|생각|진심)[^.?!]{0,20}(이에요|예요|확실|분명|거예요|있어요)`);
const OTHER_FEELS = new RegExp(`(${OTHER.replace("그는|그가", "그")})(은|는|이|가)\\s[^.?!]{0,30}(좋아해|사랑해|싫어해|그리워해|원해|후회해|관심 있어)요`);

/**
 * Marriage verdicts: that it will or will not happen, or when (owner: 결혼운 readings never promise
 * or deny a marriage). Judged outside quotes, so quoting the user's own question is fine.
 */
const MARRIAGE_VERDICT = new RegExp([
  // declaratives only: "결혼하게 될지", "결혼할 수 있을지", "못 할까 봐" are worries, not verdicts
  "결혼(?:을|은|이|도)?\\s?(?:하게\\s?(?:돼요|됩니다|될\\s?(?:거|것))|할\\s?(?:거예요|것이에요|수\\s?있어요|운명)|하겠어요|하실\\s?거|못\\s?(?:해요|할\\s?(?:거|것))|안\\s?(?:돼요|될\\s?(?:거|것))|어려워요|어려울\\s?(?:거|것)|늦어(?:져|질)?요|빨라(?:져|질)?요|성사|확정|운이\\s?(?:들어|와|있|없))",
  // a year, month or count of months with a marriage that happens then
  "(?:올해|내년|후년|이번\\s?(?:달|해)|\\d+\\s?(?:년|월|개월))\\s?(?:안에|뒤에|후에|에|쯤)?\\s?(?:[가-힣]+\\s)?결혼(?:해요|하게|할\\s?(?:거|것)|식을\\s?올)",
].join("|"));
/** 궁합 claims belong to the paid 궁합 product; declining to read it is fine. */
const GUNGHAP_CLAIM = /궁합(?:이|은|도)?\s?[^.?!]{0,6}(?:좋|나쁘|맞|최고|최악|높|낮)/;
const GUNGHAP_DECLINED = /궁합\s?풀이|보지\s?않|말하지\s?않|다루지\s?않|따로/;
/** A sentence with one of these is a boundary or a possibility, not an assertion. */
export const HEDGE = /(없|아니|알 수|확인|모르|수도|지도 몰라|일 수|가능성|단정|읽은 것|처럼 보|혹시|라면)/;

const ABSOLUTE_DATE = /\d{1,2}\s?월\s?\d{1,2}\s?일|[월화수목금토일]요일|\d{1,2}\s?시\s?(에|쯤|경|까지|부터)/;

// ---- time windows (every 운's checks, and the 한눈에 보기 card of every saju reading) ----

export const COUNTDOWN = /(?<!\d)\d{1,3}\s?(?:일|주일?|개월|달|년)\s?(?:뒤|후(?!반)|안에|이내|만에)|D\s?-\s?\d+|디데이|D데이/i;
export const CLOCK_DATE = /\d{1,2}\s?월\s?\d{1,2}\s?일|[월화수목금토일]요일|\d{1,2}\s?시\s?(?:에|쯤|경|까지|부터)/;
export const SEASON_TIMING = /(?:올해|내년|다음\s?해|다가오는\s?해|이번|오는|새해)\s?(?:봄|여름|가을|겨울)|(?:봄|여름|가을|겨울)\s?(?:쯤|무렵|부터|까지)|(?:봄|여름|가을|겨울)(?:이|가)\s?(?:오면|되면)/;
/** A month by name, or a half or a quarter of the year (a 분기점, a turning point, is neither). */
export const MONTH_NAME = /(?<!\d)(?:1[0-2]|[1-9])\s?월|상반기|하반기|분기(?!점)/;
/** A window counted in Hangul words: "한 달 안에", "몇 주 뒤", "두 해 이내", "일주일 안에", "열흘 안에" (the card's and the observation's own checks). */
export const HANGUL_WINDOW = /(?<![가-힣])(?:(?:한|두|세|몇)\s?(?:달|주일?|해)|하루|이틀|사흘|나흘|열흘|보름|며칠|일주일)\s?(?:안에|뒤|후(?!반)|이내|만에)/;
/** A month by where it stands: "이번 달", "이달", "다음 달", "그다음 달" (the 월건 shift makes them wrong; a month goes by 절기 and 간지). */
export const NAMED_MONTH = /(?:이번|다음|그다음)\s?달(?!력)|(?<![가-힣])이달(?!력)/;

export function blocklistViolations(text: string, userText: string, out: string[]): void {
  for (const [pattern, label] of BLOCKLIST) {
    if (matchesBeyondUser(pattern, text, userText).length) out.push(`금지 표현이 있어요: ${label}. 부정문으로도 쓰지 마세요.`);
  }
  if (moneyPushSentences(text).length) out.push("투자·매수·대출을 권하거나 수익을 약속하는 문장이 있어요. 흐름과 점검할 점까지만 말해 주세요.");
  for (const sentence of sentences(text)) {
    if ((OTHER_MIND.test(sentence) || OTHER_FEELS.test(sentence)) && !HEDGE.test(sentence)) {
      out.push("다른 사람의 마음이나 감정을 사실처럼 단정한 문장이 있어요. 분위기·가능성으로만 말해 주세요.");
      break;
    }
  }
  if (MARRIAGE_VERDICT.test(text.replace(QUOTED, "''"))) out.push("결혼의 성사·불발이나 시기를 단정한 문장이 있어요. 결혼을 둘러싼 흐름과 준비, 마음가짐까지만 말해 주세요.");
  if (sentences(text).some((s) => GUNGHAP_CLAIM.test(s) && !GUNGHAP_DECLINED.test(s))) out.push("궁합을 단정한 문장이 있어요. 두 사람이 잘 맞는지는 말하지 말고 지금의 흐름만 읽어 주세요.");
  if (ABSOLUTE_DATE.test(text) && !ABSOLUTE_DATE.test(userText)) out.push("날짜·요일·시각을 지정한 문장이 있어요. 고른 시기 안에서 조건으로만 말해 주세요.");
  if (!hasHangul(text)) out.push("한국어로 써 주세요.");
}

// ---- model blinding (owner order) ----

/** Hard: a model, vendor or technology name anywhere in the draft (every text field, any language). */
export function modelNameViolations(draft: unknown, out: string[]): void {
  const hit = MODEL_NAMES.exec(JSON.stringify(draft));
  if (hit) out.push(`AI 모델·회사·기술 이름("${hit[0]}")을 쓰지 않아요. 풀이 도우미가 무엇으로 만들어졌는지는 밝히지 않아요.`);
}

// ---- voice, repetition, action variety (judge findings 2026-09-30) ----

/** Spans in quotes are the user's words or a suggested message; they keep their own voice. */
export const QUOTED = /'[^'\n]*'|"[^"\n]*"|“[^”]*”|‘[^’]*’/g;
/** 해라체 endings ("~한다", "~이다"): the reading voice is 해요체. */
const HAERACHE = /(한다|는다|했다|였다|이다|았다|었다|겠다|된다|인다|린다|진다|간다|온다|본다|낸다|준다|있다|없다|같다)$/;
/** 합쇼체 endings ("~습니다", "~입니다", "~습니까"): the reading voice is 해요체 (a real teaser on 2026-10-14 wrote "낫습니다."). */
const HASIPSIO = /(니다|니까)$/;
/** Unmistakable 반말 endings (a lone "해" is the sun, so single words are not judged). */
const BANMAL = /(할게|볼게|줄게|낼게|갈게|올게|보낼게|거야|이야|잖아|거든|했어|있어|없어|하자|보자|해줘|할래|볼래|같아|좋아|싫어|해봐|알아|몰라|했지|하지 마)$/;
/**
 * Words ending in 해 that are not 반말 verbs: nouns (새해, 견해…) and the fragments a noun ending
 * can leave ("나를 위해.", "빛을 향해."). The style rules invite noun endings, so these must pass.
 */
const HAE_NOUNS = new Set([
  "올해", "새해", "지난해", "이듬해", "그해", "첫해", "매해", "작년해", "피해", "이해", "방해", "손해", "오해", "견해", "재해", "침해",
  "무해", "유해", "위해", "통해", "대해", "향해", "의해", "인해", "관해",
]);

/** Sentences that are not 해요체 (quotes removed first). */
export function nonHaeyoSentences(text: string): string[] {
  return sentences(text.replace(QUOTED, "''")).filter((sentence) => {
    const bare = sentence.replace(/[.?!…"'’”)\]\s]+$/, "");
    if (bare.endsWith("요") || bare.length === 0) return false;
    if (HAERACHE.test(bare) || BANMAL.test(bare) || HASIPSIO.test(bare)) return true;
    const last = bare.split(/\s+/).at(-1) ?? "";
    return last.length >= 2 && last.endsWith("해") && !HAE_NOUNS.has(last);
  });
}

export function voiceViolations(text: string, out: string[]): void {
  const off = nonHaeyoSentences(text);
  if (off.length) out.push(`해요체가 아닌 문장이 있어요: "${off[0]!.slice(0, 40)}". 모든 문장을 해요체로 맺어 주세요(관계 주제의 보낼 문장 예시만 예외).`);
}

const occurrences = (text: string, phrase: string) => (phrase ? text.split(phrase).length - 1 : 0);

/** Soft: a chip or the note quoted verbatim more than once (the judge's "입력 되풀이 공식"). */
export function inputRepeatViolations(text: string, phrases: string[], out: string[]): void {
  const repeated = phrases.filter((p) => p.length >= 2 && occurrences(text, p) > 1);
  if (repeated.length) {
    out.push(`${SOFT_PREFIX}같은 입력을 여러 번 그대로 되풀이했어요: ${repeated.map((p) => `'${p.slice(0, 20)}'`).join(", ")}. 한 번만 인용하고 나머지는 그 상황에서 나오는 구체적인 말로 바꿔 주세요.`);
  }
}

/** Asking the user to write something down ("출생 기록" and other nouns are not). */
const WRITING = /적어|적고|적는|적을|써\s?(보|두)|기록(해|하|을\s?남)|메모해|메모장/;
/** Not moves of their own: "해 보세요", "~지 마세요". */
const GENERIC_VERBS = new Set(["해", "하", "보", "봐", "두", "마", "지 마"]);

/** The verbs of the suggested actions in a field ("연락해 보세요" → 연락, "확인하세요" → 확인). */
export function actionVerbs(text: string): string[] {
  const verbs: string[] = [];
  for (const m of text.matchAll(/([가-힣]+)\s?(?:보세요|두세요)/g)) verbs.push(m[1]!.replace(/(해|어|아|여)$/, ""));
  for (const m of text.matchAll(/([가-힣]+?)(?:하세요|세요)(?=[.!?\s]|$)/g)) if (!/(보|두|주)$/.test(m[1]!)) verbs.push(m[1]!);
  return verbs.filter((v) => v && !GENERIC_VERBS.has(v));
}

/** Soft: two or more action fields end in the same move, or keep asking the user to write things down. */
export function actionVarietyViolations(fields: string[], out: string[]): void {
  const writing = fields.filter((f) => WRITING.test(f)).length;
  const counts = new Map<string, number>();
  for (const field of fields) for (const verb of new Set(actionVerbs(field))) counts.set(verb, (counts.get(verb) ?? 0) + 1);
  const repeated = [...counts].filter(([, n]) => n >= 2).map(([verb]) => verb);
  if (writing >= 2 || repeated.length) {
    const what = [writing >= 2 ? `적어 보기 ${writing}곳` : "", ...repeated.map((v) => `'${v}'`)].filter(Boolean).join(", ");
    out.push(`${SOFT_PREFIX}행동 제안이 비슷하게 되풀이돼요(${what}). 이 사람 상황에 맞게 연락하기, 찾아보기, 신청하기, 확인하기, 직접 가 보기처럼 섞어 주세요.`);
  }
}

const MONEY_AMOUNT = /\d[\d,]*\s?(?:만|천|백)?\s?원/g;

/** Soft: money amounts the user never gave (the reading must not assume numbers). */
export function inventedAmountViolations(text: string, userText: string, out: string[]): void {
  const invented = [...text.matchAll(MONEY_AMOUNT)].map((m) => m[0]).filter((amount) => !userText.includes(amount));
  if (invented.length) out.push(`${SOFT_PREFIX}입력에 없는 금액을 썼어요: ${[...new Set(invented)].join(", ")}. 금액은 사용자가 적은 것만 쓰거나 빼 주세요.`);
}

export const observationViolations = (body: string, out: string[]) => lengthCheck("observation", body, 60, 200, out);

// ---- card fidelity ----

/** Card names that are also everyday words; they cannot be checked by string match. */
const AMBIGUOUS_NAMES = new Set(["별", "달", "힘", "탑", "바보", "연인", "정의", "죽음", "절제", "태양", "세계", "심판", "용기", "우주", "부활", "광대", "사신"]);

export const namesOf = (card: KbCard) => [card.names.ko, ...(card.names.koAliases ?? [])];
const nameRegex = (name: string) => new RegExp(escapeRegex(name) + (/\d$/.test(name) ? "(?!\\d)" : ""), "g");

/** Removes the drawn cards' names (longest first), so a drawn "여황제" never reads as "황제". */
export function withoutDrawnNames(text: string, drawn: KbCard[]): string {
  const names = drawn.flatMap(namesOf).sort((a, b) => b.length - a.length);
  return names.reduce((t, name) => t.replace(nameRegex(name), "□"), text);
}

export function foreignCardViolations(text: string, drawn: KbCard[], out: string[]): void {
  const stripped = withoutDrawnNames(text, drawn);
  const drawnIds = new Set(drawn.map((c) => c.id));
  const found = new Set<string>();
  for (const card of KB_CARDS) {
    if (drawnIds.has(card.id)) continue;
    for (const name of namesOf(card)) {
      if (!AMBIGUOUS_NAMES.has(name) && nameRegex(name).test(stripped)) found.add(name);
    }
  }
  if (found.size) out.push(`뽑히지 않은 카드 이름이 나왔어요: ${[...found].join(", ")}. 뽑힌 카드만 말해 주세요.`);
}

function topicDriftViolations(text: string, drawn: KbCard[], banned: string[], out: string[]): void {
  const stripped = withoutDrawnNames(text, drawn);
  const hits = banned.filter((word) => mentionsWord(stripped, word));
  if (hits.length) out.push(`이 주제와 무관한 관계 어휘가 나왔어요: ${hits.join(", ")}. 고른 주제에 대해서만 써 주세요.`);
}

/** True when the section carries at least one KB image fact (two or more of its stems). */
export function citesImagery(section: string, card: KbCard): boolean {
  const nameStems = new Set(namesOf(card).flatMap(stems));
  return card.imagery.facts.some((fact) => {
    const factStems = stems(fact.ko).filter((s) => !nameStems.has(s));
    const found = factStems.filter((s) => section.includes(s)).length;
    return found >= Math.min(2, factStems.length);
  });
}

export function misdescriptionHits(text: string, card: KbCard): string[] {
  return card.imagery.misdescriptions.filter((m) => new RegExp(m.regex).test(text)).map((m) => m.wrong);
}

const legitimate = new Map<string, string>();

/** A card's KB text without its misdescription list (what a reading may legitimately echo). */
function legitimateText(card: KbCard): string {
  let text = legitimate.get(card.id);
  if (text === undefined) {
    text = JSON.stringify({ ...card, imagery: { ...card.imagery, misdescriptions: [] } });
    legitimate.set(card.id, text);
  }
  return text;
}

/**
 * Misdescription regexes run on text about several cards (story, connection, follow-ups). A regex
 * that another drawn card's own KB text matches is skipped: 검 2's woman is blindfolded, so "눈을
 * 가린" in the story is not an invented detail of 정의.
 */
export function sharedMisdescriptionHits(text: string, drawn: KbCard[]): string[] {
  return drawn.flatMap((card) => {
    const others = drawn.filter((c) => c.id !== card.id).map(legitimateText).join("\n");
    return card.imagery.misdescriptions.filter((m) => {
      const re = new RegExp(m.regex);
      return !re.test(others) && re.test(text);
    }).map((m) => m.wrong);
  });
}

/** Upright sections must not say "역방향" (거꾸로/뒤집힌 also describe upright images, e.g. 매달린 사람). */
const REVERSED_MARK = /역방향/;
/** A reversed card counts as read reversed when it says so, or reads it through its KB reversed mode. */
const REVERSED_READ = /역방향|거꾸로|뒤집/;

/** Image grounding, misdescriptions and the reversed marker for one card's own section. */
export function cardSectionViolations(label: string, body: string, card: TarotCardContext, out: string[]): void {
  if (!citesImagery(body, card.kb)) out.push(`${label}에 그 카드의 그림 사실(imageryFacts)이 인용되지 않았어요. 그림 사실 하나를 거의 그대로 써 주세요.`);
  const wrong = misdescriptionHits(body, card.kb);
  if (wrong.length) out.push(`${label}에 그림에 없는 묘사가 있어요: ${wrong.join(", ")}. imageryFacts대로 고쳐 주세요.`);
  if (card.orientation === "reversed") {
    const gloss = card.reversedMode ? card.kb.reversedModes.gloss[card.reversedMode] ?? "" : "";
    const readReversed = REVERSED_READ.test(body) || (gloss !== "" && mentions(body, gloss, 0.5));
    if (!readReversed) out.push(`${label}은 역방향 카드인데 역방향으로 읽지 않았어요. 그림 다음 문장에서 '역방향으로 나와서 ~'처럼 밝히고 reversedMode의 뜻으로 읽어 주세요.`);
  }
  if (card.orientation === "upright" && REVERSED_MARK.test(body)) out.push(`${label}은 정방향 카드인데 역방향처럼 썼어요.`);
}

export function cardSubjectCount(text: string, cards: TarotCardContext[]): number {
  const names = cards.flatMap((c) => namesOf(c.kb)).map(escapeRegex).join("|");
  const re = new RegExp(`(${names}|이 카드)(은|는|이|가)\\s[^.?!]{0,60}(말해요|말하고|뜻해요|뜻이에요|뜻일|보여줘요|알려줘요|의미해요|약속하지|카드라)`, "g");
  return [...text.matchAll(re)].length;
}

// ---- user inputs ----

export function chosenChips(ctx: TarotContext): Array<{ label: string; value: string }> {
  return ctx.conditions.filter((c) => !UNSURE_OPTIONS.includes(c.value));
}

export const userTextOf = (ctx: TarotContext) => [ctx.question, ...ctx.conditions.map((c) => c.value), ctx.note, ctx.custom.topic, ctx.custom.who, ctx.custom.when].join(" ");

export const quotedInputs = (ctx: TarotContext) => [...chosenChips(ctx).map((c) => c.value), ...(ctx.note ? [ctx.note] : [])];

export function inputUseViolations(text: string, ctx: TarotContext, out: string[]): void {
  const missing = chosenChips(ctx).filter((c) => !mentions(text, c.value)).map((c) => `'${c.value}'`);
  if (missing.length) out.push(`고른 조건이 본문에 반영되지 않았어요: ${missing.join(", ")}. 칩 문구를 그대로 인용해 주세요.`);
  if (ctx.note && !mentions(text, ctx.note, 0.3)) out.push("사용자가 적은 메모가 본문에 반영되지 않았어요. '~라고 적었죠'처럼 돌려 말해 주세요.");
}

export function commonTarotViolations(text: string, ctx: TarotContext, out: string[], opts: { topic: boolean; extraUserText?: string } = { topic: true }): void {
  const drawn = ctx.cards.map((c) => c.kb);
  const userText = `${userTextOf(ctx)} ${opts.extraUserText ?? ""}`;
  blocklistViolations(text, userText, out);
  foreignCardViolations(text, drawn, out);
  if (opts.topic) topicDriftViolations(text, drawn, ctx.bannedWords.filter((word) => !mentionsWord(userText, word)), out);
}

export function cardIdentityViolations(cards: Array<{ position: string; cardId: string }>, ctx: TarotContext, out: string[]): void {
  const same = cards.length === ctx.cards.length && cards.every((c, i) => c.position === ctx.cards[i]!.position && c.cardId === ctx.cards[i]!.cardId);
  if (!same) out.push(`cards는 뽑힌 순서대로 ${ctx.cards.map((c) => `${c.position}=${c.cardId}`).join(", ")}여야 해요.`);
}

// ---- tarot ----

export function validateTarotTeaser(draft: TarotTeaserDraft, ctx: TarotContext): string[] {
  const out: string[] = [];
  modelNameViolations(draft, out);
  cardIdentityViolations(draft.cards, ctx, out);
  for (const c of draft.cards) {
    const n = charCount(c.keyword);
    if (n < 2 || n > 24) out.push(`키워드 '${c.keyword}'는 6~18자로 써 주세요.`);
  }
  const first = ctx.cards[0]!;
  const body = draft.firstCard.body;
  lengthCheck("첫 장 풀이", body, 250, 350, out);
  cardSectionViolations(`첫 장(${cardLabel(first)})`, body, first, out);
  const inputs = [...chosenChips(ctx).map((c) => ({ text: c.value, share: 0.5 })), ...(ctx.note ? [{ text: ctx.note, share: 0.3 }] : [])];
  const usedFirst = inputs.filter((input) => mentions(body, input.text, input.share));
  if (inputs.length && !usedFirst.length) out.push("첫 장 풀이에 사용자가 고른 조건이나 메모가 하나도 반영되지 않았어요.");
  // 감질맛 (owner 2026-10-14): the second card by the first card's rules. It reflects an input too, unless the first already
  // used every one (it may not quote one again); a chip quoted in both is the soft repeat below.
  const second = ctx.cards[1];
  const secondBody = draft.secondCard?.body ?? "";
  if (second && !draft.secondCard) out.push("둘째 장 풀이(secondCard)를 써 주세요.");
  if (second && draft.secondCard) {
    lengthCheck("둘째 장 풀이", secondBody, 250, 350, out);
    cardSectionViolations(`둘째 장(${cardLabel(second)})`, secondBody, second, out);
    const usesInput = inputs.some((input) => mentions(secondBody, input.text, input.share));
    if (usedFirst.length < inputs.length && !usesInput) out.push("둘째 장 풀이에 사용자가 고른 조건이나 메모가 반영되지 않았어요. 첫 장에서 쓰지 않은 것 하나를 인용해 주세요.");
  }
  const bodies = secondBody ? [body, secondBody] : [body];
  commonTarotViolations([...bodies, ...draft.cards.map((c) => c.keyword)].join("\n"), ctx, out);
  voiceViolations(bodies.join("\n"), out);
  inputRepeatViolations(bodies.join("\n"), quotedInputs(ctx), out);
  aiTellViolations(bodies, out);
  return out;
}

/** Every string of the paid body except headings. */
function paidBodyText(r: TarotReading): string[] {
  return [
    r.verdict, ...r.cards.map((c) => c.body), r.connection.body, r.timing.body, r.observation.body,
    ...r.scenarios.items.flatMap((i) => [i.label, i.body]), ...r.messages.items, r.messages.hint,
    ...r.avoid.items, r.alternatives.body, r.action.body,
  ];
}

/**
 * `written`: how many leading cards the teaser already wrote (감질맛, owner 2026-10-14). The draft comes merged with their
 * bodies; per-card rules skip them (they passed as teaser sections, 250–350 characters), the whole-reading rules read it all.
 */
export function validateTarotReading(draft: TarotReading, ctx: TarotContext, opts: { written?: number } = {}): string[] {
  const out: string[] = [];
  const r = withoutBold(draft);
  modelNameViolations(r, out);
  cardIdentityViolations(r.cards, ctx, out);

  const verdictLength = charCount(r.verdict);
  if (verdictLength === 0 || verdictLength > 75) out.push(`한 줄 결론은 60자 이하 한 문장으로 써 주세요(지금 ${verdictLength}자).`);
  r.cards.forEach((section, i) => {
    const card = ctx.cards[i];
    if (!card) return;
    if (!section.heading.trim()) out.push(`${card.position} 카드 절의 heading이 비었어요.`);
    if (i < (opts.written ?? 0)) return;
    lengthCheck(`${card.position} 카드 절`, section.body, 150, 250, out);
    cardSectionViolations(`${card.position} 카드 절`, section.body, card, out);
  });
  for (const [key, min] of [["connection", 100], ["timing", 60], ["alternatives", 80], ["action", 40]] as const) {
    if (charCount(r[key].body) < Math.floor(min * (1 - TOLERANCE))) out.push(`${tarotHeadings(ctx)[key]} 절이 너무 짧거나 비었어요.`);
  }
  if (r.scenarios.items.length < 2 || r.scenarios.items.some((i) => !i.label.trim() || charCount(i.body) < 20)) out.push("시나리오는 3~4개, 각각 label과 40~120자 본문으로 써 주세요.");
  if (r.messages.items.length !== 2 || r.messages.items.some((m) => !m.trim()) || !r.messages.hint.trim()) out.push("messages.items는 정확히 2개, hint도 채워 주세요.");
  if (r.avoid.items.length < 2 || r.avoid.items.some((m) => !m.trim())) out.push("피할 것은 3~4개로 써 주세요.");
  observationViolations(r.observation.body, out);
  if (r.followUps.length < 1 || r.followUps.length > 3 || r.followUps.some((q) => !q.trim() || charCount(q) > 40)) out.push("followUps는 30자 이하 질문 2개로 써 주세요.");

  const paid = paidBodyText(r).join("\n");
  const total = charCount(paid);
  if (total < 1200 * (1 - TOLERANCE) || total > 1800 * (1 + TOLERANCE)) out.push(`전체 풀이 분량이 공백 제외 ${total}자예요. 1,200~1,800자로 맞춰 주세요.`);

  const all = [paid, ...r.followUps, ...r.cards.map((c) => c.heading)].join("\n");
  const shared = sharedMisdescriptionHits([r.connection.body, r.observation.body, ...r.scenarios.items.map((i) => i.body), r.alternatives.body].join("\n"), ctx.cards.map((c) => c.kb));
  if (shared.length) out.push(`그림에 없는 묘사가 있어요: ${shared.join(", ")}.`);
  inputUseViolations(paid, ctx, out);
  if (cardSubjectCount(all, ctx.cards) > 3) out.push("카드를 주어로 세운 문장('~는 ~라고 말해요')이 너무 많아요. 전체 3번 이하로 줄여 주세요.");
  commonTarotViolations(all, ctx, out);
  // Suggested first messages may be 반말 in relationship spreads; everything else is 해요체.
  const prose = paidBodyText(r).filter((text) => !(ctx.relational && r.messages.items.includes(text)));
  voiceViolations([...prose, ...r.followUps].join("\n"), out);
  inputRepeatViolations(paid, quotedInputs(ctx), out);
  actionVarietyViolations([r.action.body, r.timing.body, r.observation.body, r.messages.hint, ...r.scenarios.items.map((i) => i.body), ...(ctx.relational ? [] : r.messages.items)], out);
  inventedAmountViolations(paid, userTextOf(ctx), out);
  // one bold phrase a card section is not formatting; any other bold is, and the voice check says where
  aiTellViolations([paidBodyText({ ...draft, cards: draft.cards.map((c) => ({ ...c, body: allowBold(c.body, 1) })) }).join("\n")], out);
  tarotVoiceViolations(draft, out);
  return out;
}

export function validateDaily(d: DailyDraft, ctx: TarotContext): string[] {
  const out: string[] = [];
  modelNameViolations(d, out);
  const card = ctx.cards[0]!;
  const summaryLength = charCount(d.summary);
  if (summaryLength < 5 || summaryLength > 30) out.push(`summary는 공백 제외 30자 이하 한 문장으로 써 주세요(지금 ${summaryLength}자).`);
  if (sentences(d.summary).length > 1) out.push("summary는 한 문장으로 써 주세요.");
  const keywordLength = charCount(d.keyword);
  if (keywordLength < 2 || keywordLength > 24) out.push("keyword는 6~18자로 써 주세요.");
  lengthCheck("body", d.body, 250, 400, out);
  for (const [key, text] of Object.entries(d.areas)) {
    const n = charCount(text);
    if (n < 8 || n > 60) out.push(`areas.${key}는 15~50자 한 줄로 써 주세요(지금 ${n}자).`);
  }
  const colorLength = charCount(d.color);
  if (colorLength < 1 || colorLength > 12) out.push("color는 '노란색'처럼 색 이름 하나로 써 주세요.");
  const tipLength = charCount(d.tip);
  if (tipLength < 15 || tipLength > 100) out.push(`tip은 20~80자로 써 주세요(지금 ${tipLength}자).`);
  cardSectionViolations("body", d.body, card, out);
  commonTarotViolations([d.summary, d.body, d.areas.love, d.areas.money, d.areas.work, d.tip, d.keyword].join("\n"), ctx, out, { topic: false });
  voiceViolations([d.body, d.areas.love, d.areas.money, d.areas.work, d.tip].join("\n"), out);
  actionVarietyViolations([d.tip, d.areas.love, d.areas.money, d.areas.work], out);
  aiTellViolations([d.summary, d.body, d.areas.love, d.areas.money, d.areas.work, d.tip], out);
  return out;
}

export function validateTarotFollowUp(a: FollowUpAnswer, ctx: TarotContext, question = ""): string[] {
  const out: string[] = [];
  modelNameViolations(a, out);
  lengthCheck("answer", a.answer, 150, 450, out);
  const wrong = sharedMisdescriptionHits(a.answer, ctx.cards.map((c) => c.kb));
  if (wrong.length) out.push(`그림에 없는 묘사가 있어요: ${wrong.join(", ")}.`);
  commonTarotViolations(a.answer, ctx, out, { topic: true, extraUserText: question });
  voiceViolations(a.answer, out);
  aiTellViolations([a.answer], out);
  return out;
}

// ---- saju ----

/**
 * Held (공망, 홍염, 양인, 괴강) and hidden (백호, 원진, 삼재 …) 살 (spec 2026-10-08 §1). Never in the 정통 이름표 풀이, not even
 * declined; everywhere else only in a sentence that declines them, like the labels the 해명 rule names (review A4).
 * 임원진, "양인지", "적은 양인 물" are not 원진 or 양인 (review A5); 바탕화면 is not 탕화, "양인이 있어" is 양인 (review of v2).
 */
const SINSAL_NEVER = /백호|(?<![가-힣])원진|귀문관|삼재|겁살|(?<![가-힣])재살(?![림펴피핌])|(?<![가-힣])천살|망신살|육해살|(?<![가-힣])탕화|(?<![가-힣])상문|조객|(?<![가-힣])고신|과숙|공망|홍염|(?<![가-힣])양인(?=살|\(|[·,]|\s?(?:같은|이나|과|와|도)\s|(?:이|은|을|의)\s)|괴강/;
/**
 * A name read as an event or a cause: a 귀인 met, appearing or helping; "역마살이 있어서", "도화가 있으면" (a cause or a condition
 * only: "학당귀인이 있어요" is a fact, review A5), the connective "있어 " included, and a name as the reason ("역마 때문에",
 * "문창귀인 덕분에", review of v2). Never in the 이름표 풀이; elsewhere only declined (review A1).
 */
const SINSAL_EVENT = new RegExp([
  "귀인(?:을|이|과|의|에게|한테)?\\s?(?:만나|만날|만난|나타나|나타날|나타난|찾아오|찾아올|찾아와|도와|도움)",
  "(?:[가-힣]{2,3}살|귀인|도화|역마|화개)(?:이|가)\\s?(?:붙어\\s?|들어\\s?)?(?:있어서|있어(?=[\\s,])|있으니|있으면|있기\\s?때문)",
  "(?:[가-힣]{0,2}귀인|(?<![가-힣])(?:역마|도화|화개)살?)\\s?(?:덕분|덕에|때문)",
].join("|"));
/**
 * The six names a reading may show where its facts hold them (the 정통 이름표 풀이), and 신살 itself; anywhere else only in a
 * sentence that declines them, as before the split. 고도화·제도화·도화지·도화선 are not 도화.
 */
const SINSAL_NAME = /천을귀인|문창귀인|학당귀인|(?<![가-힣])도화(?![지선])|(?<![가-힣])역마|(?<![가-힣])화개|귀인|신살/;

/** The names `text` uses outside a declining sentence, but those in `allowed` (and the user's own words). */
function sinsalNameHits(text: string, userText: string, allowed: readonly string[] = []): string[] {
  const own = allowed.reduce((t, name) => t.replaceAll(name, "□"), text);
  // a bare 귀인 goes with a 귀인 of the facts' own, never with 천을·문창·학당귀인 the facts do not hold
  const left = allowed.some((name) => name.endsWith("귀인")) ? own.replace(/(?<!천을|문창|학당)귀인/g, "□") : own;
  return [...new Set(sentences(left).filter((s) => !NEGATED.test(s)).flatMap((s) => matchesBeyondUser(SINSAL_NAME, s, userText)))];
}

/** [pattern, label, negatable]: a negatable topic may be named in a sentence that declines it. */
const SAJU_BLOCKLIST: Array<[RegExp, string, boolean]> = [
  [/반드시|무조건|확실히|틀림없|정해져 있|100\s*%|확률|퍼센트|점수/, "단정·수치 표현(반드시·무조건·확실히·확률·점수)", false],
  [/운명(?!의\s*(수레)?바퀴)/, "'운명'", false],
  [/질병|질환|진단|수술|병(에|이)\s?(걸|나)/, "건강·질병", true],
  [/사고(가 나|가 날|를 당|수)/, "사고", true],
  [/임신|출산/, "임신·출산", true],
  [/이혼|재회/, "이혼·재회", true],
  [/투자|로또|복권|부동산|주식|코인/, "투자", true],
  [/소송|재판/, "소송", true],
  [/수명|죽음|사망|요절/, "수명·죽음", true],
  // 살·귀인 (spec 2026-10-08 §4): the held and hidden names and a name read as an event, declined only (strict in the 정통
  // 이름표 풀이: allowedFactViolations' `strictSinsal`); the six names a reading may show are SINSAL_NAME's, below
  [SINSAL_NEVER, "숨기거나 보류한 살 이름(백호·원진·삼재·공망 같은 것)", true],
  [SINSAL_EVENT, "살·귀인을 사건이나 까닭으로 읽는 말(귀인을 만난다, ~살이 있어서)", true],
  // 같은 글자·같은 간지 between layers keep those words; these names are never needed, not even to decline them
  [/복음|伏吟|반음|反吟|병림|並臨/, "복음·반음·병림 같은 이름", false],
  [/액땜|부적|굿을/, "주술 권유", false],
  [/(좋은|나쁜|최고의|최악의)\s?(해|달|날|시기|운)|(조심|주의)해야 할 (해|달|시기)/, "시기 등급", false],
];

/** School-dependent labels: allowed only in a sentence that says they were not applied. */
const SCHOOL_LABELS = /신강|신약|용신|희신|기신|격국|종격/;
/** A sentence that declines or says something was not applied ("말하기 어려워요", "쓰지 않았어요"). */
const NEGATED = /않|없|아니|달라|붙이지|쓰지|어려|어렵|말하지|다루지/;
/**
 * A sentence that really declines a 살 name, a 살 read as an event, or a 개운 claim (review of v2, M2): "쓰지 않았어요",
 * "예고는 아니에요", "단정할 수는 없어요", "말하기 어려워요", "상관없어요". A stray 않·없 elsewhere ("걱정하지 않아도 돼요",
 * "부담 없이") excuses nothing.
 */
const DECLINED = /(?<![가-힣])(?:쓰지|붙지|붙이지|보지|따지지|다루지|말하지)\s?않|(?:뜻|예고|말|이름|라벨)(?:은|는)?\s?아니|단정할\s?수(?:는)?\s?없|말하기\s?어려|상관\s?없/;

const STEM_OR_BRANCH = /[甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥]/g;
/** Ten-god names at a word start (so 결정인지 never reads as 정인, 상관없이 never as 상관). */
const TEN_GOD_PATTERNS: Array<[string, RegExp]> = ["비견", "겁재", "식신", "상관", "편재", "정재", "편관", "정관", "편인", "정인"].map((name) => [
  name,
  new RegExp(`(?<![가-힣])${name}${name === "상관" ? "(?!없|이 없|하지|하고|할)" : ""}`),
]);
const CHECKED_STAGES = ["장생", "건록", "제왕"];
const YEAR = /(?<!\d)(1[89]\d\d|20\d\d)(?!\d)/g;

/**
 * Glyphs, ten gods, stages and years must come from an allow-list (a FactSet's, or a merged one for
 * two charts or a year); forbidden topics appear only in a sentence that declines them, or in the
 * user's own words (`userText`, a follow-up question).
 * - `marriage`: the user's love status makes 결혼 the reading's subject (verdicts stay banned either way).
 * - `cardText`: the text is card prose (a premium card part that also cites saju facts). It skips the
 *   saju blocklist and the 결혼 topic, which the tarot blocklist judges there ("좋은 시기" and the
 *   card 죽음 are fine in a card reading); the facts, verdict and label checks still apply.
 * - `names: false`: the caller checks the 살·귀인 names part by part (the 정통 reading, whose 이름표 풀이 may name its own).
 * - `strictSinsal`: the held and hidden 살 and a name read as an event are not allowed even declined (the 이름표 풀이).
 */
export function allowedFactViolations(
  text: string, allowed: SajuFactSet["allowed"], out: string[], userText = "",
  opts: { marriage?: boolean; cardText?: boolean; names?: boolean; strictSinsal?: boolean } = {},
): void {
  const { marriage = false, cardText = false, names = true, strictSinsal = false } = opts;
  const glyphs = new Set(allowed.glyphs);
  const invented = [...new Set(text.match(STEM_OR_BRANCH) ?? [])].filter((g) => !glyphs.has(g));
  if (invented.length) out.push(`명식에 없는 간지 글자가 나왔어요: ${invented.join(", ")}. <facts>에 있는 글자만 써 주세요.`);
  const gods = new Set(allowed.tenGods);
  const strayGods = TEN_GOD_PATTERNS.filter(([name, re]) => re.test(text) && !gods.has(name)).map(([name]) => name);
  if (strayGods.length) out.push(`명식에 없는 십성이 나왔어요: ${strayGods.join(", ")}.`);
  const stages = new Set(allowed.stages);
  const strayStages = CHECKED_STAGES.filter((stage) => text.includes(stage) && !stages.has(stage));
  if (strayStages.length) out.push(`명식에 없는 12운성이 나왔어요: ${strayStages.join(", ")}.`);
  const years = new Set(allowed.years);
  const strayYears = [...new Set([...text.matchAll(YEAR)].map((m) => Number(m[1])))].filter((y) => !years.has(y));
  if (strayYears.length) out.push(`명식에서 나오지 않은 연도가 있어요: ${strayYears.join(", ")}.`);
  for (const [pattern, label, declinable] of cardText ? [] : SAJU_BLOCKLIST) {
    const sinsal = pattern === SINSAL_NEVER || pattern === SINSAL_EVENT;
    const negatable = declinable && !(strictSinsal && sinsal);
    const declines = sinsal ? DECLINED : NEGATED;
    const offending = sentences(text).filter((s) => matchesBeyondUser(pattern, s, userText).length > 0 && !(negatable && declines.test(s)));
    if (offending.length) {
      // the words themselves, so a retry knows what to change (review of v2, M3)
      const words = [...new Set(offending.flatMap((s) => matchesBeyondUser(pattern, s, userText)))].slice(0, 3).map((w) => `"${w}"`).join(", ");
      out.push(negatable
        ? `쓰지 않는 주제가 있어요: ${label}(${words}). 이 풀이로는 말하기 어렵다고 짧게 밝히는 문장에서만 쓰세요.`
        : `쓰지 않는 표현이 있어요: ${label}(${words}). 부정문으로도 쓰지 마세요.`);
    }
  }
  const named = !cardText && names ? sinsalNameHits(text, userText) : [];
  if (named.length) out.push(`쓰지 않는 주제가 있어요: 살·귀인 이름(${named.join(", ")}). 이 풀이로는 말하기 어렵다고 짧게 밝히는 문장에서만 쓰세요.`);
  // 결혼 is the reading's subject when the user is dating, engaged or married; otherwise it is a
  // topic this reading only declines. Verdicts (it will / won't happen, when) are never allowed.
  if (!cardText && !marriage && sentences(text).some((s) => matchesBeyondUser(/결혼/, s, userText).length > 0 && !NEGATED.test(s))) {
    out.push("쓰지 않는 주제가 있어요: 결혼. 이 풀이로는 말하기 어렵다고 짧게 밝히는 문장에서만 쓰세요.");
  }
  if (MARRIAGE_VERDICT.test(text.replace(QUOTED, "''"))) out.push("결혼의 성사·불발이나 시기를 단정한 문장이 있어요. 결혼을 다루는 방식까지만 말해 주세요.");
  if (sentences(text).some((s) => GUNGHAP_CLAIM.test(s) && !GUNGHAP_DECLINED.test(s))) out.push("궁합을 단정한 문장이 있어요. 두 사람이 잘 맞는지는 말하지 마세요.");
  if (sentences(text).some((s) => SCHOOL_LABELS.test(s) && !NEGATED.test(s))) out.push("신강·신약·용신·격국 같은 라벨을 단정했어요. 라벨을 쓰지 않았다는 말은 계산 기준 절에서 한 번만 해 주세요.");
  if (!hasHangul(text)) out.push("한국어로 써 주세요.");
}

function sajuFactViolations(text: string, facts: SajuFactSet, out: string[], userText = "", names = true): void {
  allowedFactViolations(text, facts.allowed, out, userText, { marriage: marriageContext(facts), names });
}

/**
 * The 정통 reading's 살·귀인 names, part by part (spec 2026-10-08 §4): the 이름표 풀이 names what facts.sinsal holds, the 계산
 * 기준 절 the names its basis sentence gives, a follow-up answer the reading's own names (review A3), and every other part (the
 * card, the other sections, the observation, the suggested questions) a name only in a sentence that declines it.
 */
function sinsalPartViolations(
  parts: ReadonlyArray<readonly [label: string, text: string, place: "nameplate" | "basis" | "answer" | "other"]>, facts: SajuFactSet, userText: string, out: string[],
): void {
  const own = facts.sinsal.map((s) => s.name);
  for (const [label, text, place] of parts) {
    if (place === "basis") continue;
    const hits = sinsalNameHits(text, userText, place === "other" ? [] : own);
    if (!hits.length) continue;
    out.push(place === "nameplate"
      ? `'${label}'에 이 명식에 붙지 않은 이름(${hits.join(", ")})이 나왔어요. <facts>의 sinsal에 있는 이름만 불러 주세요.`
      : place === "answer"
        ? `${label}에 이 풀이에 없는 살·귀인 이름(${hits.join(", ")})이 나왔어요. 이름표 풀이에 나온 이름만 불러 주세요.`
        : `'${label}'에 살·귀인 이름(${hits.join(", ")})이 나왔어요. 이름은 '${SAJU_NAMES_HEADING}' 절에서 이 명식에 붙은 것만 불러 주세요.`);
  }
}

// ---- 기운 채우기 (8절, spec 2026-10-08 §2, §4): a lifestyle suggestion for fun, chosen by counting the 오행 ----

/** Each in a sentence that does not decline it ("이사 같은 큰 결정과는 상관없어요" is fine), as the saju blocklist's topics. */
const GAEUN_BANNED: ReadonlyArray<readonly [RegExp, string]> = [
  // a count of glyphs is not a number for luck ("숫자로 세면 0개"), nor is a bus number (review A2); "행운의 색" is the
  // prompt's own word, "1과 6이 물 기운의 숫자" is a lucky number (review of v2)
  [/행운의?\s?(?:숫자|번호)|럭키|(?:좋은|맞는|길한)\s?숫자|숫자\s?\d|\d\s?이라는\s?숫자|(?:좋은|맞는)\s?번호|(?:기운|오행)의?\s?숫자|\d\s?(?:과|와|·)\s?\d/, "행운의 숫자를 쓰는 말"],
  [
    // "적은 기운을 채워 준다" is the section's own idea (기운 채우기), not a promise (review A2)
    /효과|효능|필수|(?<![가-힣])운(?:이|을)?\s?(?:트이|트여|틔우|틔워|열리|열려|좋아지|좋아져|올라|들어오|들어와|불러|부르)|(?:돈|재물|금전)(?:이|을)?\s?(?:들어오|들어와|모이|모여|붙|불러|부르)|기운(?:이|을)?\s?(?:살아나|북돋|좋아지|좋아져)/,
    "효과를 약속하는 말",
  ],
  [
    /건강|면역|혈액|혈압|심장|숙면|불면|우울|증상|질환|치유|치료|디톡스|해독|다이어트|피로(?:가|를)?\s?(?:풀|회복|가시)|몸(?:이|에)\s?(?:좋|가벼|따뜻|건강|살아)|소화(?:가|를)?\s?(?:잘|편|돕)/,
    "몸이나 마음 건강과 잇는 말",
  ],
  // 사이사이 is not 이사, and a bed against a wall is not where the head lies (review A2)
  [/(?<![가-힣])이사\s?(?:를|하|해|가)|이주|이민|해외|유학|머리\s?방향|(?:머리|베개|잠자리)[^.?!]{0,10}(?:동|서|남|북)(?:쪽|향)|정(?:동|서|남|북)향|(?:동|서|남|북)향\s?집/, "큰 방향 결정(이사·해외·머리 방향)을 권하는 말"],
];

function gaeunViolations(body: string, out: string[]): void {
  for (const [pattern, what] of GAEUN_BANNED) {
    // a real decline only: "부담 없이 시작할 수 있어요" declines nothing (review of v2, M2)
    const hit = sentences(body).filter((s) => !DECLINED.test(s)).map((s) => pattern.exec(s)?.[0]).find(Boolean);
    if (hit) {
      out.push(`'${SAJU_GAEUN_HEADING}' 절에 ${what}이 있어요("${hit}"). 오행 개수로 고른 재미로 보는 생활 제안으로만, '곁에 두면'·'가볍게 해 보면'처럼 써 주세요. 방향은 산책 길이나 책상에 앉는 쪽 같은 작은 선택으로만 써요.`);
    }
  }
}

/**
 * The pillars the limits name besides the chart's own (`allowed.limitGlyphs`: another hour or day pillar near a boundary)
 * belong where the limits are copied (review 2026-10-08). `text` (masked by maskGanzhiReadings) with them blanked where it
 * may name them: all of a part that copies the limits (`copiesLimits`: the 계산 기준 절, an answer to a `BASIS_QUESTION`), and elsewhere a limit sentence
 * quoted word for word. The allow-list check then finds them anywhere else, as 乙卯 on the card or in 4절.
 */
export function allowLimitPillars(text: string, facts: { limits: readonly string[]; allowed: { limitGlyphs?: readonly string[] } }, copiesLimits = false): string {
  const glyphs = facts.allowed.limitGlyphs ?? [];
  if (glyphs.length === 0) return text;
  const blank = (t: string) => t.replace(new RegExp(`[${glyphs.join("")}]`, "g"), "□");
  if (copiesLimits) return blank(text);
  return facts.limits.map(maskGanzhiReadings).reduce((t, limit) => (limit ? t.split(limit).join(blank(limit)) : t), text);
}

/**
 * A follow-up question about the pillars' basis ("다른 앱은 일주가 계미던데요?"): its answer copies the limits in its own words, so it may
 * name their other pillars (`copiesLimits`); any other answer names them only in a limit quoted word for word (review 2026-10-08).
 * Not every follow-up: an answer about this year must not present 癸未 as the chart's own. "일주일" is a week, not 일주.
 */
export const BASIS_QUESTION = /일주(?!일)|시주|만세력|시각|기준|다른\s?앱|다르게/;

export const TIME_UNKNOWN_LINE = /시를 몰라|시각을 몰라|시주 없이|시주를 비워|여섯 글자/;

/**
 * This and next month's 월건 (`monthly`) belongs to the observation alone (both reading formats say so): a section that says
 * 월건, or names a 월건's 간지 the facts give nowhere else (in hanja, or in Hangul as a month: 무술월), is flagged.
 */
export function monthlyViolations(
  headings: readonly string[], bodies: string[], facts: { monthly?: { current: { gz: string; ko: string }; next: { gz: string; ko: string } } }, out: string[],
): void {
  const m = facts.monthly;
  if (!m) return;
  const elsewhere = JSON.stringify({ ...facts, monthly: undefined });
  const marks = ["월건", ...[m.current, m.next].filter((month) => !elsewhere.includes(month.gz)).flatMap((month) => [month.gz, `${month.ko}월`])];
  const i = bodies.findIndex((body) => marks.some((mark) => body.includes(mark)));
  if (i >= 0) out.push(`'${headings[i] ?? `${i + 1}번째 절`}' 절에 이번 달·다음 달 월건이 나왔어요. 월건은 observation에서만 써 주세요.`);
}

// ---- 한눈에 보기 (owner 2026-10-07) ----

/** The card's name where a finding points at it (the 월건 check names the part it found one in). */
export const GLANCE_LABEL = SAJU_GLANCE_HEADING.split(" · ")[0]!;

/** The card's five sentences in reading order: [key, the label it answers under, length target]. */
const GLANCE_ITEMS = [
  ["goesWell", SAJU_GLANCE_LABELS.goesWell, 20, 60],
  ["watchOut", SAJU_GLANCE_LABELS.watchOut, 20, 60],
  ["remedy", SAJU_GLANCE_LABELS.remedy, 20, 60],
  ["thisYear", SAJU_GLANCE_LABELS.thisYear, 20, 60],
  ["thisYearAction", SAJU_GLANCE_ACTION_LABEL, 10, 45],
] as const;

export const glanceTexts = (g: SajuGlance): string[] => GLANCE_ITEMS.map(([key]) => g[key]);

/** Scores, stars, percentages and 길흉 grades: the card says which side goes well, never how good a person or a year is. */
const GLANCE_GRADE = new RegExp([
  // "최악의 경우부터 떠올리는" and "최고를 고집하는" are habits, not grades
  "대길|소길|대흉|소흉|길흉|최고(?!(?:를|만)\\s?(?:고집|추구|바라|노리))|최악(?!의\\s?경우)|만점|별점|등급|점수|퍼센트|[★☆]",
  "(?<![가-힣])길(?:한|하게|해요|합니다|운)",
  "(?<![가-힣])흉(?:한|하게|해요|합니다|운|일|년|달|조)",
  "\\d+\\s?점|\\d+(?:\\.\\d+)?\\s?%",
  "(?<![가-힣])(?:운|운세)(?:이|가)\\s?(?:좋|나쁘|최고|최악)",
].join("|"));
/** School-dependent verdicts: never on the card, not even to decline them (the body says so where it must). */
const GLANCE_SCHOOL = /신강|신약|용신|희신|기신|격국|종격|조후/;
/** 검정 is also a test (자격 검정, 검정고시). */
const COLOURS = "빨간|빨강|붉은|파란|파랑|푸른|노란|노랑|초록|녹색|연두|하얀|하양|흰|검은|(?<!(?:자격|능력|기능|실력|인증)\\s?)검정(?!고시|\\s?시험)|까만|보라|분홍|주황|회색|남색|금색|은색|갈색";
/** Filling, mending, raising or saving a 기운 or the 오행. */
const RAISE = "채우|채워|보충|보태|더하|더해|메우|메워|북돋|살리|살려";
/** A make-up that is not an everyday act: a colour, a direction, a thing, a number, raising a missing 오행 (owner 2026-10-07). */
const GLANCE_REMEDY = new RegExp([
  `(?<![가-힣])(?:${COLOURS})`,
  "(?<![가-힣])(?:동|서|남|북|동남|동북|서남|서북)\\s?(?:쪽|방향|방위)",
  "방위|행운의|럭키",
  "소품|화분|식물|액세서리|팔찌|향초|부적|숫자\\s?\\d",
  `(?:부족한|모자란|없는|약한|적은)\\s?(?:[가-힣]+\\s)?(?:오행|기운)(?:을|를)?\\s?(?:${RAISE})`,
  `(?<![가-힣])(?:나무|불|흙|쇠|물|목|화|토|금|수)\\s?(?:\\([^)]*\\)\\s?)?기운(?:을|를)?\\s?(?:${RAISE})`,
  `오행(?:을|를)?\\s?(?:${RAISE}|맞추|맞춰)`,
].join("|"));

const SIXTY = Array.from({ length: 60 }, (_, i) => STEMS[i % 10]! + BRANCHES[i % 12]!);
const GANZHI_OF_KO = new Map(SIXTY.map((gz) => [ganzhiKo(gz), gz]));
/** A 간지 on the card: in hanja, or in Hangul where it reads as one (정미년, 병오(丙午), 경진 대운), never 갑자기 or 정해진. */
const CARD_GANZHI = new RegExp(
  `[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]|(?<![가-힣])(${[...GANZHI_OF_KO.keys()].join("|")})(?=년|월(?!요)|\\(|\\s?(?:대운|세운|일주|월주|년주|시주|기둥))`,
  "g",
);

/** The 간지 the card may name: the chart's pillars, its 대운 and the 세운 (a 운's coming one too); a 월건 is monthlyViolations' to find. */
export function cardGanzhi(facts: {
  pillars: ReadonlyArray<{ gz: string }>; luck: { cycles: ReadonlyArray<{ gz: string }> } | null; annual: { gz: string };
  monthly?: { current: { gz: string }; next: { gz: string } }; nextAnnual?: { gz: string };
}): string[] {
  return [
    ...facts.pillars.map((p) => p.gz), ...(facts.luck?.cycles ?? []).map((c) => c.gz), facts.annual.gz,
    ...(facts.nextAnnual ? [facts.nextAnnual.gz] : []), ...(facts.monthly ? [facts.monthly.current.gz, facts.monthly.next.gz] : []),
  ];
}

/**
 * The card's own rules (owner 2026-10-07): one plain sentence per item, no grade, no school verdict, an everyday
 * make-up, 명리 terms only in brackets, no 간지 but `opts.ganzhi`, this year's 세운 by its 간지 (not "올해" before 입춘),
 * and no window or month by where it stands (이번·다음 달); unless a topic's checks read the card's time words
 * themselves (`timing: false`), no month name, season, date or numbered window either. The reading validators also run
 * their shared checks on it (the facts' glyphs, ten gods and years, the blocklists, 해요체, 월건).
 */
export function glanceViolations(
  g: SajuGlance, annual: SajuFactSet["annual"], out: string[], opts: { timing: boolean; ganzhi: readonly string[] },
): void {
  for (const [key, label, min, max] of GLANCE_ITEMS) {
    lengthCheck(`${GLANCE_LABEL} '${label}'`, g[key], min, max, out);
    if (g[key].trim() && sentences(g[key]).length !== 1) out.push(`${GLANCE_LABEL}의 '${label}'은 한 문장으로 써 주세요.`);
  }
  const texts = glanceTexts(g);
  const all = texts.join("\n");
  const grade = GLANCE_GRADE.exec(all)?.[0];
  if (grade) out.push(`${GLANCE_LABEL}에 길흉·점수 표현이 있어요("${grade}"). 대길·흉·최고·최악, 점수·별점·퍼센트·등급 없이 어느 쪽이 잘 풀리고 어디를 조심할지만 말해 주세요.`);
  if (GLANCE_SCHOOL.test(all)) out.push(`${GLANCE_LABEL}에 용신·신강·신약·격국 같은 판단이 나왔어요. 카드에서는 이런 말을 아예 쓰지 말아 주세요.`);
  // the make-up is what remedy and thisYearAction tell her to do; goesWell and watchOut may describe a tendency ("푸른 나무처럼")
  const remedy = GLANCE_REMEDY.exec(`${g.remedy}\n${g.thisYearAction}`)?.[0];
  if (remedy) out.push(`${GLANCE_LABEL}에 색·방향·물건이나 부족한 오행 채우기로 보완하는 말이 있어요("${remedy}"). 보완은 연락하기, 정리하기, 쉬는 칸 만들기처럼 일상 행동으로만 말해 주세요.`);
  const bare = [...new Set(texts.flatMap((text) => bareFirstTerms(outsideBrackets(text))))];
  if (bare.length) out.push(`${GLANCE_LABEL}에 명리 용어가 괄호 밖에 있어요: ${bare.join(", ")}. '${glossed("식신")}'처럼 쉬운 말을 먼저 쓰고 용어는 괄호 안에만 넣어 주세요.`);
  const named = new Set(opts.ganzhi);
  const stray = [...all.matchAll(CARD_GANZHI)].find((m) => !named.has(m[1] ? GANZHI_OF_KO.get(m[1])! : m[0]));
  if (stray) out.push(`${GLANCE_LABEL}에 이 명식·대운·세운에 없는 간지가 나왔어요("${stray[0]}"). 한글로만 써도 마찬가지예요. <facts>에 있는 간지만 불러 주세요.`);
  if (g.thisYear.trim() && ![annual.gz, annual.ko].some((name) => g.thisYear.includes(name))) {
    out.push(`${GLANCE_LABEL}의 '${SAJU_GLANCE_LABELS.thisYear}'에 올해 세운의 간지(${annual.ko}(${annual.gz}))를 한 번 불러 주세요.`);
  }
  const thisYearSaid = annual.beforeIpchun ? new RegExp(`올해\\s?(?:${annual.ko}|${annual.gz})`).exec(all)?.[0] : undefined;
  if (thisYearSaid) {
    out.push(`${GLANCE_LABEL}에서 아직 입춘 전인 세운을 '${thisYearSaid}'라고 불렀어요. 입춘까지는 지난해의 세운이 이어지니 '입춘 전까지 이어지는 ${annual.ko}(${annual.gz})년'처럼 말해 주세요.`);
  }
  const windows = [HANGUL_WINDOW, NAMED_MONTH, ...(opts.timing ? [COUNTDOWN, CLOCK_DATE, MONTH_NAME, SEASON_TIMING] : [])];
  const when = texts.map((text) => windows.map((re) => re.exec(text)?.[0]).find(Boolean)).find(Boolean);
  if (when) out.push(`${GLANCE_LABEL}에 시기를 짚은 말이 있어요("${when}"). 달 이름·이번 달·다음 달, 계절, 날짜나 '한 달 안에'·'3개월 안에' 같은 기간 없이 '올해 남은 기간'처럼 말해 주세요.`);
}

/** Soft (owner 2026-10-07): a 명리 term's first appearance in reading order (the card, then the body) follows its plain words, in brackets. */
export function plainWordViolations(texts: string[], out: string[]): void {
  const bare = bareFirstTerms(texts.join("\n"));
  if (bare.length) {
    out.push(`${SOFT_PREFIX}명리 용어가 처음 나올 때 쉬운 말이 먼저 오지 않았어요: ${bare.slice(0, 6).join(", ")}. '${glossed("식신")}'처럼 쉬운 말을 먼저 쓰고 용어는 괄호에 넣어 주세요.`);
  }
}

/** Love statuses (lib/api/inputs.ts LOVE_STATUS labels) for which the reading covers 결혼. */
const MARRIAGE_STATUSES = new Set(["연애 중", "결혼 준비 중", "기혼"]);
export const marriageContext = (facts: SajuFactSet) => MARRIAGE_STATUSES.has(facts.profile?.loveStatus ?? "");

/** Soft: the user's own context (love/work status, concern) should show in the reading, 결혼 included when it applies. */
export function profileUseViolations(text: string, facts: SajuFactSet, out: string[]): void {
  const p = facts.profile;
  if (!p) return;
  const missing = [p.loveStatus, p.workStatus].filter((v): v is string => Boolean(v) && v !== "잘 모르겠어요" && !mentions(text, v!));
  if (p.concern && !mentions(text, p.concern, 0.3)) missing.push("한 줄 고민");
  if (marriageContext(facts) && !text.includes("결혼")) missing.push("결혼(연애 상태에 맞춰 한두 문장)");
  if (missing.length) out.push(`${SOFT_PREFIX}사용자가 알려 준 상황이 풀이에 보이지 않아요: ${missing.join(", ")}. 그 사람의 상황에 맞춰 장면과 실험을 골라 주세요.`);
}

const profileText = (facts: SajuFactSet) => [facts.profile?.loveStatus, facts.profile?.workStatus, facts.profile?.concern].filter(Boolean).join(" ");

export function validateSajuTeaser(d: SajuTeaserDraft, facts: SajuFactSet): string[] {
  const out: string[] = [];
  modelNameViolations(d, out);
  const titleLength = charCount(d.title);
  if (titleLength < 2 || titleLength > 16) out.push("title은 4~12자로 써 주세요.");
  lengthCheck("summary", d.summary, 250, 400, out);
  if (!facts.input.timeKnown && !TIME_UNKNOWN_LINE.test(d.summary)) out.push("태어난 시를 몰라 여섯 글자로 읽었다는 한계를 summary에 한 문장 넣어 주세요.");
  sajuFactViolations(allowLimitPillars(maskGanzhiReadings(`${d.title}\n${d.summary}`), facts), facts, out, profileText(facts));
  voiceViolations(d.summary, out);
  profileUseViolations(d.summary, facts, out);
  aiTellViolations([d.summary], out);
  return out;
}

/**
 * What one call of the main reading writes (owner 2026-10-16: two halves at once), or the whole they merge into: its sections in
 * order (with `basis`, the last is 계산 기준), their total (±TOLERANCE), whether it writes the observation and the card (`card`)
 * and the follow-up questions, and whether the user's status (and 결혼) must show in it.
 */
interface MainShare {
  headings: readonly string[];
  basis: boolean;
  total: readonly [number, number];
  /** the finding's subject for the total */
  amount: string;
  card: boolean;
  followUps: boolean;
  profile: boolean;
}

const WHOLE_MAIN: MainShare = { headings: SAJU_MAIN_SECTIONS, basis: true, total: [2100, 3200], amount: "프롤로그 분량", card: true, followUps: true, profile: true };
/**
 * The halves' bands add up to the whole's, tolerance included (900 + 675 = 1,575; 2,312.5 + 1,687.5 = 4,000), so two halves that
 * pass never fail the whole's total. The status and 결혼 scenes are the second half's (4–6절), so its check implies the whole's.
 */
const FIRST_HALF: MainShare = { headings: SAJU_PART_A_SECTIONS, basis: true, total: [1200, 1850], amount: "이 부분의 분량", card: false, followUps: true, profile: false };
const SECOND_HALF: MainShare = { headings: SAJU_PART_B_SECTIONS, basis: false, total: [900, 1350], amount: "이 부분의 분량", card: true, followUps: false, profile: true };

const NO_GLANCE: SajuGlance = { goesWell: "", watchOut: "", remedy: "", thisYear: "", thisYearAction: "" };
const NO_OBSERVATION = { heading: "", body: "" };

/** The main reading's checks for one share; what a share does not write is empty and not checked. */
function mainShareViolations(draft: SajuReading, facts: SajuFactSet, share: MainShare): string[] {
  const out: string[] = [];
  const r = withoutBold(draft);
  modelNameViolations(r, out);
  const { headings } = share;
  if (r.sections.length !== headings.length) out.push(`sections는 정확히 ${headings.length}개여야 해요.`);
  const basisIndex = share.basis ? headings.length - 1 : -1;
  r.sections.forEach((section, i) => {
    const n = charCount(section.body);
    const heading = headings[i] ?? `${i + 1}번째 절`;
    // body sections 300~450자 in the reading voice (owner 2026-10-08), the 계산 기준 절 as before
    if (n < 150 || n > 900) out.push(`'${heading}' 절이 공백 제외 ${n}자예요. ${i === basisIndex ? "300~550" : "300~450"}자로 써 주세요.`);
  });
  const total = r.sections.reduce((sum, s) => sum + charCount(s.body), 0);
  const [lo, hi] = share.total;
  if (total < lo * (1 - TOLERANCE) || total > hi * (1 + TOLERANCE)) out.push(`${share.amount}이 공백 제외 ${total}자예요. ${lo.toLocaleString("ko-KR")}~${hi.toLocaleString("ko-KR")}자로 맞춰 주세요.`);
  const basis = share.basis ? r.sections.at(-1)?.body ?? "" : "";
  if (share.basis && !facts.input.timeKnown && !TIME_UNKNOWN_LINE.test(basis)) out.push("계산 기준 절에 태어난 시를 몰라 시주 없이 읽었다는 한계를 넣어 주세요.");
  if (share.card) {
    observationViolations(r.observation.body, out);
    // a month by 절기 and 간지 only: the months given may have shifted (review 2026-10-08)
    const month = (MONTH_NAME.exec(r.observation.body) ?? NAMED_MONTH.exec(r.observation.body))?.[0];
    if (month) out.push(`관찰에 '${month}'처럼 달을 가리키는 말이 있어요. 끝나 가는 달을 가리키지 않도록 달은 시작하는 절기와 간지로만 불러 주세요(예: 한로부터 드는 무술(戊戌)월).`);
    glanceViolations(r.glance, facts.annual, out, { timing: true, ganzhi: cardGanzhi(facts) });
  }
  // the card answers first, so its rules come with the body's: the facts, the blocklists, 해요체, 월건 (observation only)
  const glance = share.card ? glanceTexts(r.glance) : [];
  monthlyViolations([GLANCE_LABEL, ...headings], [glance.join("\n"), ...r.sections.map((s) => s.body)], facts, out);
  if (share.followUps && (r.followUps.length < 1 || r.followUps.length > 3 || r.followUps.some((q) => !q.trim() || charCount(q) > 40))) {
    out.push("followUps는 30자 이하 질문 2개로 써 주세요.");
  }
  const observation = share.card ? r.observation.body : "";
  const followUps = share.followUps ? r.followUps : [];
  const bodies = [...r.sections.map((s) => s.body), ...(share.card ? [observation] : [])];
  // the 계산 기준 절 (the last section) copies the limits, so it alone may name the other pillars they name
  const lastBasis = share.basis ? r.sections.length - 1 : -1;
  const basisAt = lastBasis >= 0 ? glance.length + lastBasis : -1;
  const checked = [...glance, ...bodies, ...followUps].map((text, i) => allowLimitPillars(maskGanzhiReadings(text), facts, i === basisAt));
  sajuFactViolations(checked.join("\n"), facts, out, profileText(facts), false);
  sinsalPartViolations([
    [GLANCE_LABEL, glance.join("\n"), "other"],
    ...r.sections.map((s, i) => [headings[i] ?? `${i + 1}번째 절`, s.body, i === basisIndex ? "basis" : "other"] as const),
    ["관찰", observation, "other"],
    ["이어서 물어볼 질문", followUps.join("\n"), "other"],
  ], facts, profileText(facts), out);
  voiceViolations([...glance, ...bodies, ...followUps].join("\n"), out);
  if (share.profile) profileUseViolations(bodies.join("\n"), facts, out);
  actionVarietyViolations(bodies, out);
  // one or two bold phrases a body section are not formatting; the 계산 기준 절 and the observation have none
  aiTellViolations([...draft.sections.map((s, i) => allowBold(s.body, i === basisIndex ? 0 : 2)), ...(share.card ? [draft.observation.body] : [])], out);
  // the 계산 기준 절 may name its terms as they are (reading-voice-2026-10 §4.4): the body says them in plain words
  plainWordViolations([...glance, ...bodies.filter((_, i) => i !== lastBasis)], out);
  const bodyCount = share.basis ? basisIndex : headings.length;
  sajuVoiceViolations({
    headings: headings.slice(0, bodyCount), bodies: draft.sections.slice(0, bodyCount).map((s) => s.body),
    basis: share.basis ? draft.sections[basisIndex]?.body ?? "" : "", observation: share.card ? draft.observation.body : "", glance: share.card ? draft.glance : NO_GLANCE,
  }, out);
  return out;
}

/**
 * The main reading as one draft (review 2026-10-08, B): sections 1–6 and 계산 기준 (SAJU_MAIN_SECTIONS), the card, the observation
 * and the follow-up questions; since owner 2026-10-16 the halves' merge, checked once more by the whole's rules. 7절·8절 are
 * validateSajuEnrichment's. No 살·귀인 name but in 계산 기준's basis sentence.
 */
export function validateSajuMainReading(draft: SajuReading, facts: SajuFactSet): string[] {
  return mainShareViolations(draft, facts, WHOLE_MAIN);
}

/** The first half (owner 2026-10-16): 1–3절, 계산 기준 and the follow-up questions, by the main reading's rules for what it writes. */
export function validateSajuReadingPartA(draft: SajuReadingPartA, facts: SajuFactSet): string[] {
  return mainShareViolations({ ...draft, observation: NO_OBSERVATION, glance: NO_GLANCE }, facts, FIRST_HALF);
}

/** The second half: 4–6절, the observation and the card; the user's status and 결혼 show here. */
export function validateSajuReadingPartB(draft: SajuReadingPartB, facts: SajuFactSet): string[] {
  return mainShareViolations({ ...draft, followUps: [] }, facts, SECOND_HALF);
}

/**
 * 7절 이름표 풀이 and 8절 기운 채우기 (spec 2026-10-08 §3, §4), as their own call writes them or the code builds them: their
 * lengths; the names of facts.sinsal only, in 7절 only, where the held and hidden 살 and a name read as an event fail even
 * declined; 8절's own bans; the facts, the blocklists and the voice, as for the body.
 */
export function validateSajuEnrichment(draft: SajuEnrichment, facts: SajuFactSet): string[] {
  const out: string[] = [];
  const e = withoutBold(draft);
  modelNameViolations(e, out);
  for (const [heading, body, target] of [[SAJU_NAMES_HEADING, e.nameplate, "280~420"], [SAJU_GAEUN_HEADING, e.gaeun, "250~380"]] as const) {
    const n = charCount(body);
    if (n < 150 || n > 900) out.push(`'${heading}' 절이 공백 제외 ${n}자예요. ${target}자로 써 주세요.`);
  }
  const userText = profileText(facts);
  const marriage = marriageContext(facts);
  allowedFactViolations(maskGanzhiReadings(e.nameplate), facts.allowed, out, userText, { marriage, names: false, strictSinsal: true });
  allowedFactViolations(maskGanzhiReadings(e.gaeun), facts.allowed, out, userText, { marriage, names: false });
  sinsalPartViolations([[SAJU_NAMES_HEADING, e.nameplate, "nameplate"], [SAJU_GAEUN_HEADING, e.gaeun, "other"]], facts, userText, out);
  gaeunViolations(e.gaeun, out);
  voiceViolations([e.nameplate, e.gaeun].join("\n"), out);
  actionVarietyViolations([e.nameplate, e.gaeun], out);
  aiTellViolations([allowBold(draft.nameplate, 2), allowBold(draft.gaeun, 2)], out);
  plainWordViolations([e.nameplate, e.gaeun], out);
  sajuVoiceViolations({ headings: [SAJU_NAMES_HEADING, SAJU_GAEUN_HEADING], bodies: [draft.nameplate, draft.gaeun], basis: "", observation: "", glance: NO_GLANCE }, out);
  return out;
}

/** A merged reading (sections 1–6, 7절, 8절, 계산 기준): validateSajuMainReading on its main part, validateSajuEnrichment on 7절·8절. */
export function validateSajuReading(reading: SajuReading, facts: SajuFactSet): string[] {
  if (reading.sections.length !== SAJU_PROLOGUE_SECTIONS.length) return [`sections는 정확히 ${SAJU_PROLOGUE_SECTIONS.length}개여야 해요.`];
  const at = (heading: string) => reading.sections[SAJU_PROLOGUE_SECTIONS.indexOf(heading)]!.body;
  const main = { ...reading, sections: reading.sections.filter((_, i) => SAJU_MAIN_SECTIONS.includes(SAJU_PROLOGUE_SECTIONS[i]!)) };
  return [...validateSajuMainReading(main, facts), ...validateSajuEnrichment({ nameplate: at(SAJU_NAMES_HEADING), gaeun: at(SAJU_GAEUN_HEADING) }, facts)];
}

export function validateSajuFollowUp(a: FollowUpAnswer, facts: SajuFactSet, question = ""): string[] {
  const out: string[] = [];
  modelNameViolations(a, out);
  lengthCheck("answer", a.answer, 150, 450, out);
  const userText = `${question} ${profileText(facts)}`;
  sajuFactViolations(allowLimitPillars(maskGanzhiReadings(a.answer), facts, BASIS_QUESTION.test(question)), facts, out, userText, false);
  // the reading's own names, whatever the question (review A3); never another one, a hidden one or an event
  sinsalPartViolations([["답", a.answer, "answer"]], facts, userText, out);
  voiceViolations(a.answer, out);
  aiTellViolations([a.answer], out);
  return out;
}
