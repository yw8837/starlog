import "server-only";
import type { DeepPartA, DeepPartB, DeepTeaserDraft } from "./premiumSchemas";
import { cardLabel, type TarotContext } from "./prompts/tarot";
import { SOFT_PREFIX, aiTellViolations } from "./style";
import {
  TOLERANCE, actionVarietyViolations, cardIdentityViolations, cardSectionViolations, cardSubjectCount, charCount, chosenChips,
  commonTarotViolations, inputRepeatViolations, inputUseViolations, inventedAmountViolations, lengthCheck, mentions, modelNameViolations,
  namesOf, quotedInputs, sharedMisdescriptionHits, userTextOf, voiceViolations,
} from "./validate";

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

// TOLERANCE is re-exported for the premium tests' length bands.
export { TOLERANCE };
