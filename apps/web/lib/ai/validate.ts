import "server-only";
import { KB_CARDS, type KbCard } from "@/lib/kb";
import { UNSURE_OPTIONS, cardLabel, tarotHeadings, type TarotCardContext, type TarotContext } from "./prompts/tarot";
import type { DailyDraft, FollowUpAnswer, TarotReading, TarotTeaserDraft } from "./schemas";

/**
 * Post-generation checks. Each returns a list of violations in Korean (fed back to the model on the
 * one regeneration); an empty list passes. Code catches what code can: structure, lengths, the
 * blocklists, topic drift, card fidelity, KB image facts and misdescriptions, chip and note use.
 * Whether every visual claim is in the KB beyond the misdescription list needs a judge model (P2 B6a).
 */

// ---- text utilities ----

/** Characters without whitespace (the unit of every length target). */
export const charCount = (text: string) => text.replace(/\s/g, "").length;

const TOLERANCE = 0.25;

/** Length target with the plan's ±25% band. */
function lengthCheck(label: string, text: string, min: number, max: number, out: string[], tolerance = TOLERANCE): void {
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

const sentences = (text: string) => text.split(/(?<=[.?!])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
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
  [/(투자|주식|코인|로또|복권|대출)[^.?!]{0,20}(하세요|사세요|해 보세요|오를|벌 수|수익)/, "투자 권유"],
  [/(지금|당장)\s?(결제|구매)/, "결제 압박"],
  [/때도 있지만[^.?!]{0,40}때도/, "양면 성격 문장(바넘)"],
  [/생각보다 강(해요|한 사람)/, "무조건적 위로(바넘)"],
];

const OTHER_MIND = /(그 사람|상대방?|그분|걔|그 친구|그녀|그는|그가)[^.?!]{0,15}(마음|속마음|감정|생각|진심)[^.?!]{0,20}(이에요|예요|확실|분명|거예요|있어요)/;
const OTHER_FEELS = /(그 사람|상대방?|그분|걔|그녀|그)(은|는|이|가)\s[^.?!]{0,30}(좋아해|사랑해|싫어해|그리워해|원해|후회해|관심 있어)요/;
/** A sentence with one of these is a boundary or a possibility, not an assertion. */
const HEDGE = /(없|아니|알 수|확인|모르|수도|지도 몰라|일 수|가능성|단정|읽은 것|처럼 보|혹시|라면)/;

const ABSOLUTE_DATE = /\d{1,2}\s?월\s?\d{1,2}\s?일|[월화수목금토일]요일|\d{1,2}\s?시\s?(에|쯤|경|까지|부터)/;

function blocklistViolations(text: string, userText: string, out: string[]): void {
  for (const [pattern, label] of BLOCKLIST) if (pattern.test(text)) out.push(`금지 표현이 있어요: ${label}. 부정문으로도 쓰지 마세요.`);
  for (const sentence of sentences(text)) {
    if ((OTHER_MIND.test(sentence) || OTHER_FEELS.test(sentence)) && !HEDGE.test(sentence)) {
      out.push("다른 사람의 마음이나 감정을 사실처럼 단정한 문장이 있어요. 분위기·가능성으로만 말해 주세요.");
      break;
    }
  }
  if (ABSOLUTE_DATE.test(text) && !ABSOLUTE_DATE.test(userText)) out.push("날짜·요일·시각을 지정한 문장이 있어요. 고른 시기 안에서 조건으로만 말해 주세요.");
  if (!hasHangul(text)) out.push("한국어로 써 주세요.");
}

// ---- card fidelity ----

/** Card names that are also everyday words; they cannot be checked by string match. */
const AMBIGUOUS_NAMES = new Set(["별", "달", "힘", "탑", "바보", "연인", "정의", "죽음", "절제", "태양", "세계", "심판", "용기", "우주", "부활", "광대", "사신"]);

const namesOf = (card: KbCard) => [card.names.ko, ...(card.names.koAliases ?? [])];
const nameRegex = (name: string) => new RegExp(escapeRegex(name) + (/\d$/.test(name) ? "(?!\\d)" : ""), "g");

/** Removes the drawn cards' names (longest first), so a drawn "여황제" never reads as "황제". */
function withoutDrawnNames(text: string, drawn: KbCard[]): string {
  const names = drawn.flatMap(namesOf).sort((a, b) => b.length - a.length);
  return names.reduce((t, name) => t.replace(nameRegex(name), "□"), text);
}

function foreignCardViolations(text: string, drawn: KbCard[], out: string[]): void {
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
  const hits = banned.filter((word) => stripped.includes(word));
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

function misdescriptionHits(text: string, card: KbCard): string[] {
  return card.imagery.misdescriptions.filter((m) => new RegExp(m.regex).test(text)).map((m) => m.wrong);
}

/** Misdescription regexes safe to run on text about several cards (they match no drawn card's own facts). */
function sharedMisdescriptionHits(text: string, drawn: KbCard[]): string[] {
  const factsText = drawn.flatMap((c) => c.imagery.facts.map((f) => f.ko)).join("\n");
  return drawn.flatMap((card) => card.imagery.misdescriptions.filter((m) => {
    const re = new RegExp(m.regex);
    return !re.test(factsText) && re.test(text);
  }).map((m) => m.wrong));
}

/** "역방향" only: 거꾸로/뒤집힌 also describe upright images (매달린 사람). */
const REVERSED_MARK = /역방향/;

/** Image grounding, misdescriptions and the reversed marker for one card's own section. */
function cardSectionViolations(label: string, body: string, card: TarotCardContext, out: string[]): void {
  if (!citesImagery(body, card.kb)) out.push(`${label}에 그 카드의 그림 사실(imageryFacts)이 인용되지 않았어요. 그림 사실 하나를 거의 그대로 써 주세요.`);
  const wrong = misdescriptionHits(body, card.kb);
  if (wrong.length) out.push(`${label}에 그림에 없는 묘사가 있어요: ${wrong.join(", ")}. imageryFacts대로 고쳐 주세요.`);
  const marked = REVERSED_MARK.test(body);
  if (card.orientation === "reversed" && !marked) out.push(`${label}은 역방향 카드인데 역방향이라는 말이 없어요. 첫 문장에서 밝혀 주세요.`);
  if (card.orientation === "upright" && marked) out.push(`${label}은 정방향 카드인데 역방향처럼 썼어요.`);
}

function cardSubjectCount(text: string, cards: TarotCardContext[]): number {
  const names = cards.flatMap((c) => namesOf(c.kb)).map(escapeRegex).join("|");
  const re = new RegExp(`(${names}|이 카드)(은|는|이|가)\\s[^.?!]{0,60}(말해요|말하고|뜻해요|뜻이에요|뜻일|보여줘요|알려줘요|의미해요|약속하지|카드라)`, "g");
  return [...text.matchAll(re)].length;
}

// ---- user inputs ----

function chosenChips(ctx: TarotContext): Array<{ label: string; value: string }> {
  return ctx.conditions.filter((c) => !UNSURE_OPTIONS.includes(c.value));
}

const userTextOf = (ctx: TarotContext) => [ctx.question, ...ctx.conditions.map((c) => c.value), ctx.note].join(" ");

function inputUseViolations(text: string, ctx: TarotContext, out: string[]): void {
  const missing = chosenChips(ctx).filter((c) => !mentions(text, c.value)).map((c) => `'${c.value}'`);
  if (missing.length) out.push(`고른 조건이 본문에 반영되지 않았어요: ${missing.join(", ")}. 칩 문구를 그대로 인용해 주세요.`);
  if (ctx.note && !mentions(text, ctx.note, 0.3)) out.push("사용자가 적은 메모가 본문에 반영되지 않았어요. '~라고 적었죠'처럼 돌려 말해 주세요.");
}

function commonTarotViolations(text: string, ctx: TarotContext, out: string[], opts: { topic: boolean } = { topic: true }): void {
  const drawn = ctx.cards.map((c) => c.kb);
  blocklistViolations(text, userTextOf(ctx), out);
  foreignCardViolations(text, drawn, out);
  if (opts.topic) topicDriftViolations(text, drawn, ctx.bannedWords, out);
}

function cardIdentityViolations(cards: Array<{ position: string; cardId: string }>, ctx: TarotContext, out: string[]): void {
  const same = cards.length === ctx.cards.length && cards.every((c, i) => c.position === ctx.cards[i]!.position && c.cardId === ctx.cards[i]!.cardId);
  if (!same) out.push(`cards는 뽑힌 순서대로 ${ctx.cards.map((c) => `${c.position}=${c.cardId}`).join(", ")}여야 해요.`);
}

// ---- tarot ----

export function validateTarotTeaser(draft: TarotTeaserDraft, ctx: TarotContext): string[] {
  const out: string[] = [];
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
  return out;
}

/** Every string of the paid body except headings and the story. */
function paidBodyText(r: TarotReading): string[] {
  return [
    r.verdict, ...r.cards.map((c) => c.body), r.connection.body, r.timing.body,
    ...r.scenarios.items.flatMap((i) => [i.label, i.body]), ...r.messages.items, r.messages.hint,
    ...r.avoid.items, r.alternatives.body, r.action.body,
  ];
}

export function validateTarotReading(r: TarotReading, ctx: TarotContext): string[] {
  const out: string[] = [];
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
  if (!r.story.title.trim() || charCount(r.story.title) > 24) out.push("story.title은 20자 이하로 채워 주세요.");
  lengthCheck("story.body", r.story.body, 250, 450, out);
  if (r.followUps.length < 1 || r.followUps.length > 3 || r.followUps.some((q) => !q.trim() || charCount(q) > 40)) out.push("followUps는 30자 이하 질문 2개로 써 주세요.");

  const paid = paidBodyText(r).join("\n");
  const total = charCount(paid);
  if (total < 1200 * (1 - TOLERANCE) || total > 1800 * (1 + TOLERANCE)) out.push(`전체 풀이 분량이 공백 제외 ${total}자예요. 1,200~1,800자로 맞춰 주세요.`);

  const all = [paid, r.story.body, r.story.title, ...r.followUps, ...r.cards.map((c) => c.heading)].join("\n");
  const shared = sharedMisdescriptionHits([r.connection.body, r.story.body, ...r.scenarios.items.map((i) => i.body), r.alternatives.body].join("\n"), ctx.cards.map((c) => c.kb));
  if (shared.length) out.push(`그림에 없는 묘사가 있어요: ${shared.join(", ")}.`);
  inputUseViolations([paid, r.story.body].join("\n"), ctx, out);
  if (cardSubjectCount(all, ctx.cards) > 3) out.push("카드를 주어로 세운 문장('~는 ~라고 말해요')이 너무 많아요. 전체 3번 이하로 줄여 주세요.");
  commonTarotViolations(all, ctx, out);
  return out;
}

export function validateDaily(d: DailyDraft, ctx: TarotContext): string[] {
  const out: string[] = [];
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
  return out;
}

export function validateTarotFollowUp(a: FollowUpAnswer, ctx: TarotContext): string[] {
  const out: string[] = [];
  lengthCheck("answer", a.answer, 150, 450, out);
  commonTarotViolations(a.answer, ctx, out, { topic: false });
  return out;
}
