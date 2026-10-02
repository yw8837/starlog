import "server-only";
import { KB_CARDS, type KbCard } from "@/lib/kb";
import { SAJU_PROLOGUE_SECTIONS } from "@/lib/sajuPrologue";
import { maskGanzhiReadings } from "./ganzhi";
import type { SajuFactSet } from "./prompts/saju";
import { UNSURE_OPTIONS, cardLabel, mentionsWord, tarotHeadings, type TarotCardContext, type TarotContext } from "./prompts/tarot";
import type { DailyDraft, FollowUpAnswer, SajuReading, SajuTeaserDraft, TarotReading, TarotTeaserDraft } from "./schemas";
import { MODEL_NAMES, SOFT_PREFIX, aiTellViolations } from "./style";

/**
 * Post-generation checks. Each returns a list of violations in Korean (fed back to the model on the
 * one regeneration); an empty list passes. Code catches what code can: structure, lengths, the
 * blocklists, topic drift, card fidelity, KB image facts and misdescriptions, chip and note use.
 * Whether every visual claim is in the KB beyond the misdescription list needs a judge model (P2 B6a).
 */

// ---- text utilities ----

/** Characters without whitespace (the unit of every length target). */
export const charCount = (text: string) => text.replace(/\s/g, "").length;

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
const OTHER = "그 사람|상대방?|그분|걔|그 친구|그녀|그는|그가|배우자|남자\\s?친구|여자\\s?친구|남친|여친|예비\\s?(?:신랑|신부)";
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
const QUOTED = /'[^'\n]*'|"[^"\n]*"|“[^”]*”|‘[^’]*’/g;
/** 해라체 endings ("~한다", "~이다"): the reading voice is 해요체. */
const HAERACHE = /(한다|는다|했다|였다|이다|았다|었다|겠다|된다|인다|린다|진다|간다|온다|본다|낸다|준다|있다|없다|같다)$/;
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
    if (HAERACHE.test(bare) || BANMAL.test(bare)) return true;
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
    if (!readReversed) out.push(`${label}은 역방향 카드인데 역방향으로 읽지 않았어요. 첫 문장에서 역방향이라고 밝히고 reversedMode의 뜻으로 읽어 주세요.`);
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
  const hasInputs = chosenChips(ctx).length > 0 || ctx.note !== "";
  const usesInput = chosenChips(ctx).some((c) => mentions(body, c.value)) || (ctx.note !== "" && mentions(body, ctx.note, 0.3));
  if (hasInputs && !usesInput) out.push("첫 장 풀이에 사용자가 고른 조건이나 메모가 하나도 반영되지 않았어요.");
  commonTarotViolations([body, ...draft.cards.map((c) => c.keyword)].join("\n"), ctx, out);
  voiceViolations(body, out);
  inputRepeatViolations(body, quotedInputs(ctx), out);
  aiTellViolations([body], out);
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

export function validateTarotReading(r: TarotReading, ctx: TarotContext): string[] {
  const out: string[] = [];
  modelNameViolations(r, out);
  cardIdentityViolations(r.cards, ctx, out);

  const verdictLength = charCount(r.verdict);
  if (verdictLength === 0 || verdictLength > 75) out.push(`한 줄 결론은 60자 이하 한 문장으로 써 주세요(지금 ${verdictLength}자).`);
  r.cards.forEach((section, i) => {
    const card = ctx.cards[i];
    if (!card) return;
    if (!section.heading.trim()) out.push(`${card.position} 카드 절의 heading이 비었어요.`);
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
  aiTellViolations([paid], out);
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
  [/삼재|원진|백호|도화|역마|공망|귀인|신살/, "신살·공포 개념", true],
  [/액땜|부적|굿을/, "주술 권유", false],
  [/(좋은|나쁜|최고의|최악의)\s?(해|달|날|시기|운)|(조심|주의)해야 할 (해|달|시기)/, "시기 등급", false],
];

/** School-dependent labels: allowed only in a sentence that says they were not applied. */
const SCHOOL_LABELS = /신강|신약|용신|희신|기신|격국|종격/;
/** A sentence that declines or says something was not applied ("말하기 어려워요", "쓰지 않았어요"). */
const NEGATED = /않|없|아니|달라|붙이지|쓰지|어려|어렵|말하지|다루지/;

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
 */
export function allowedFactViolations(
  text: string, allowed: SajuFactSet["allowed"], out: string[], userText = "", opts: { marriage?: boolean; cardText?: boolean } = {},
): void {
  const { marriage = false, cardText = false } = opts;
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
  for (const [pattern, label, negatable] of cardText ? [] : SAJU_BLOCKLIST) {
    const offending = sentences(text).filter((s) => matchesBeyondUser(pattern, s, userText).length > 0 && !(negatable && NEGATED.test(s)));
    if (offending.length) {
      out.push(negatable
        ? `쓰지 않는 주제가 있어요: ${label}. 이 풀이로는 말하기 어렵다고 짧게 밝히는 문장에서만 쓰세요.`
        : `쓰지 않는 표현이 있어요: ${label}. 부정문으로도 쓰지 마세요.`);
    }
  }
  // 결혼 is the reading's subject when the user is dating, engaged or married; otherwise it is a
  // topic this reading only declines. Verdicts (it will / won't happen, when) are never allowed.
  if (!cardText && !marriage && sentences(text).some((s) => matchesBeyondUser(/결혼/, s, userText).length > 0 && !NEGATED.test(s))) {
    out.push("쓰지 않는 주제가 있어요: 결혼. 이 풀이로는 말하기 어렵다고 짧게 밝히는 문장에서만 쓰세요.");
  }
  if (MARRIAGE_VERDICT.test(text.replace(QUOTED, "''"))) out.push("결혼의 성사·불발이나 시기를 단정한 문장이 있어요. 결혼을 다루는 방식까지만 말해 주세요.");
  if (sentences(text).some((s) => GUNGHAP_CLAIM.test(s) && !GUNGHAP_DECLINED.test(s))) out.push("궁합을 단정한 문장이 있어요. 두 사람이 잘 맞는지는 말하지 마세요.");
  if (sentences(text).some((s) => SCHOOL_LABELS.test(s) && !NEGATED.test(s))) out.push("신강·신약·용신·격국 같은 라벨을 단정했어요. 라벨은 쓰지 않았다고만 밝혀 주세요.");
  if (!hasHangul(text)) out.push("한국어로 써 주세요.");
}

function sajuFactViolations(text: string, facts: SajuFactSet, out: string[], userText = ""): void {
  allowedFactViolations(text, facts.allowed, out, userText, { marriage: marriageContext(facts) });
}

const TIME_UNKNOWN_LINE = /시를 몰라|시각을 몰라|시주 없이|시주를 비워|여섯 글자/;

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
  sajuFactViolations(maskGanzhiReadings(`${d.title}\n${d.summary}`), facts, out, profileText(facts));
  voiceViolations(d.summary, out);
  profileUseViolations(d.summary, facts, out);
  aiTellViolations([d.summary], out);
  return out;
}

export function validateSajuReading(r: SajuReading, facts: SajuFactSet): string[] {
  const out: string[] = [];
  modelNameViolations(r, out);
  if (r.sections.length !== SAJU_PROLOGUE_SECTIONS.length) out.push(`sections는 정확히 ${SAJU_PROLOGUE_SECTIONS.length}개여야 해요.`);
  r.sections.forEach((section, i) => {
    const n = charCount(section.body);
    const heading = SAJU_PROLOGUE_SECTIONS[i] ?? `${i + 1}번째 절`;
    if (n < 150 || n > 900) out.push(`'${heading}' 절이 공백 제외 ${n}자예요. 300~550자로 써 주세요.`);
  });
  const total = r.sections.reduce((sum, s) => sum + charCount(s.body), 0);
  if (total < 2500 * (1 - TOLERANCE) || total > 3500 * (1 + TOLERANCE)) out.push(`프롤로그 분량이 공백 제외 ${total}자예요. 2,500~3,500자로 맞춰 주세요.`);
  const basis = r.sections.at(-1)?.body ?? "";
  if (!facts.input.timeKnown && !TIME_UNKNOWN_LINE.test(basis)) out.push("계산 기준 절에 태어난 시를 몰라 시주 없이 읽었다는 한계를 넣어 주세요.");
  observationViolations(r.observation.body, out);
  if (r.followUps.length < 1 || r.followUps.length > 3 || r.followUps.some((q) => !q.trim() || charCount(q) > 40)) out.push("followUps는 30자 이하 질문 2개로 써 주세요.");
  const bodies = [...r.sections.map((s) => s.body), r.observation.body];
  sajuFactViolations(maskGanzhiReadings([...bodies, ...r.followUps].join("\n")), facts, out, profileText(facts));
  voiceViolations([...bodies, ...r.followUps].join("\n"), out);
  profileUseViolations(bodies.join("\n"), facts, out);
  actionVarietyViolations(bodies, out);
  aiTellViolations(bodies, out);
  return out;
}

export function validateSajuFollowUp(a: FollowUpAnswer, facts: SajuFactSet, question = ""): string[] {
  const out: string[] = [];
  modelNameViolations(a, out);
  lengthCheck("answer", a.answer, 150, 450, out);
  sajuFactViolations(maskGanzhiReadings(a.answer), facts, out, `${question} ${profileText(facts)}`);
  voiceViolations(a.answer, out);
  aiTellViolations([a.answer], out);
  return out;
}
