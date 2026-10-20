import "server-only";
import type {
  DeepPartA, DeepPartB, DeepTeaserDraft, MatchPartA, MatchPartB, MatchTeaserDraft, NewYearPartA, NewYearPartB, NewYearPartC, NewYearTeaserDraft,
} from "./premiumSchemas";
import { FALLBACK_ACTIONS, actionsOf, cardBody, distinctActions, factSentence, factsOf, hasFinal, josa, ro } from "./mock";
import { previewKeyword } from "./prompts/deepTarot";
import type { MatchFacts, MonthAhead, YearBand } from "./prompts/match";
import type { MonthFact, NewYearFacts } from "./prompts/newyear";
import type { Relation } from "./prompts/saju";
import type { FollowUpAnswer } from "./schemas";
import { WHEN_KO, onTopic, type TarotContext } from "./prompts/tarot";

/**
 * Deterministic premium drafts for tests, key-less dev and e2e (STARLOG_AI=mock). Built from the
 * cards' KB and the computed facts only; every draft passes its validator (tests check 25+ draws).
 */

export const count = (text: string) => text.replace(/\s/g, "").length;

/** `base`, then pool sentences until at least `min` characters, never past `max`. */
export function fill(base: string[], pool: readonly string[], min: number, max: number): string {
  const parts = base.filter(Boolean);
  for (const sentence of pool) {
    if (count(parts.join(" ")) >= min) break;
    if (count(parts.join(" ")) + count(sentence) <= max) parts.push(sentence);
  }
  return parts.join(" ");
}

/** Neutral, on-topic-for-anything sentences with mixed endings (no relationship words, no dates). */
export const NEUTRAL_POOL: readonly string[] = [
  "서두르지 않고 지금 손에 잡히는 것부터 정리하면 흐름이 또렷해져요.",
  "한 번에 다 바꾸려 하기보다 한 가지씩 순서를 정하면 부담이 줄어요.",
  "작게 해 본 결과가 다음 선택의 기준이 되죠.",
  "지금 느끼는 망설임도 이 배치 안에서는 자연스러운 단계예요.",
  "확인할 수 있는 것부터 확인하면 마음이 한결 가벼워져요.",
  "이 구간에서는 속도보다 방향을 먼저 맞추는 편이 나아요.",
  "흐름이 바뀌는 지점은 대개 사소한 선택에서 시작되거든요.",
  "해 본 것과 해 보지 않은 것을 나눠 보면 다음 걸음이 보여요.",
  "무리하게 끝을 정하기보다 중간 점검을 한 번 두는 쪽이 맞아요.",
  "익숙한 방식 하나를 내려놓으면 새 방식이 들어올 자리가 생겨요.",
];

/** Short closers for the action and observation fields (no verbs that repeat an action, no dates). */
const ACTION_POOL: readonly string[] = [
  "작게 시작할수록 부담이 줄어요.",
  "끝낸 뒤의 느낌이 다음 걸음의 기준이 되죠.",
  "한 번에 다 하지 않아도 괜찮아요.",
];

const wa = (word: string) => `${word}${hasFinal(word) ? "과" : "와"}`;
const eun = (word: string) => `${word}${hasFinal(word) ? "은" : "는"}`;

export function mockDeepTeaser(ctx: TarotContext): DeepTeaserDraft {
  const first = ctx.cards[0]!;
  const move = actionsOf(first, ctx)[0] ?? FALLBACK_ACTIONS[0]!;
  return { now: { body: cardBody(ctx, first, 0, true, [`오늘은 이렇게 해 보세요. ${move}`], 390) } };
}

/** A card's one-line meaning, or an on-topic keyword when the line uses a word this topic bans. */
export function lineOf(ctx: TarotContext, i: number): string {
  const card = ctx.cards[i]!;
  const line = card.kb.core.oneLine[card.orientation];
  return onTopic(ctx, line) ? line : previewKeyword(card, ctx);
}

export function mockDeepPartA(ctx: TarotContext): DeepPartA {
  const keyword = previewKeyword(ctx.cards[0]!, ctx);
  return {
    verdict: `지금은 '${keyword}' 쪽으로 작게 움직여 보는 편이 좋아요.`,
    positions: ctx.cards.map((card) => ({
      position: card.position,
      cardId: card.cardId,
      body: cardBody(ctx, card, 1, card.slot === 0, [`이 자리에서는 ${lineOf(ctx, card.slot)} 쪽으로 읽어요.`], 335),
    })),
  };
}

export function mockDeepPartB(ctx: TarotContext): DeepPartB {
  const c = ctx.cards;
  const name = (i: number) => c[i]!.name;
  const line = (i: number) => lineOf(ctx, i);
  const fact = (i: number) => factSentence(factsOf(c[i]!.kb)[0]!.ko);
  const when = ctx.when ? WHEN_KO[ctx.when] : "고른 시기";
  const moves = distinctActions([...actionsOf(c[0]!, ctx), ...actionsOf(c[9]!, ctx), ...FALLBACK_ACTIONS], 2);
  return {
    crossing: {
      body: fill([
        `${wa(name(0))} ${name(1)}를 한 장면으로 놓고 봐요.`,
        `${name(0)} 쪽에는 ${fact(0)}`,
        `${name(1)} 쪽에는 ${fact(1)}`,
        `지금의 자리는 '${line(0)}' 쪽이고, 가로막는 자리는 '${line(1)}' 쪽이라 두 흐름이 같은 곳에서 맞물려요.`,
      ], NEUTRAL_POOL, 360, 450),
    },
    axes: {
      vertical: fill([`바탕의 ${eun(name(2))} '${line(2)}' 쪽이고, 바라는 자리의 ${eun(name(4))} '${line(4)}' 쪽이에요.`, `그 사이에 지금의 ${name(0)}가 놓여 있어요.`], NEUTRAL_POOL, 230, 300),
      horizontal: fill([`지나온 자리의 ${eun(name(3))} '${line(3)}' 쪽이었고, 다가올 자리의 ${eun(name(5))} '${line(5)}' 쪽으로 이어져요.`, `가운데의 ${name(0)}가 그 흐름의 다리예요.`], NEUTRAL_POOL, 230, 300),
    },
    staff: {
      body: fill([
        `아래에서부터 ${name(6)}, ${name(7)}, ${name(8)}, ${name(9)} 순서로 쌓아 읽어요.`,
        `나의 태도 자리는 '${line(6)}' 쪽이고, 주변 자리는 '${line(7)}' 쪽이에요.`,
        `바람과 걱정 자리는 '${line(8)}' 쪽이라, 결과의 방향 자리의 '${line(9)}'는 정해진 끝이 아니라 지금 흐름이 이어질 때의 방향이에요.`,
        "태도 자리의 결을 조금 바꾸면 결과의 방향도 함께 움직여요.",
      ], NEUTRAL_POOL, 390, 500),
    },
    timing: { body: fill([`${when} 안에서는 준비가 됐다고 느끼는 날에 움직이는 편이 자연스러워요.`], NEUTRAL_POOL, 160, 250) },
    action: { body: fill([moves[0] ?? FALLBACK_ACTIONS[1]!, `${name(0)} 그림을 떠올리며 시작하면 손이 덜 무거워요.`], ACTION_POOL, 85, 160) },
    observation: { body: fill([`며칠 안에 ${name(9)} 그림의 '${line(9)}' 같은 순간이 언제 오는지 눈여겨보세요.`], ["그 순간이 먼저 온다면 이 풀이의 방향이 맞은 거예요.", ...ACTION_POOL], 85, 180) },
    followUps: ["이 흐름에서 먼저 해 볼 일은 뭘까요?", "막힐 때는 어떻게 하면 좋을까요?"],
  };
}

// ---- 프리미엄 궁합 (saju only, owner 2026-10-17) ----

/** Pair-neutral sentences: no glyphs, ten gods, years, romance words or verdicts. */
export const SAJU_PAIR_POOL: readonly string[] = [
  "명식은 정해진 답이 아니라 어디서 힘이 나기 쉬운지를 보여 주는 지도에 가까워요.",
  "같은 장면에서도 서로 다른 쪽으로 힘이 쓰인다는 걸 알면 오해가 줄어요.",
  "한 사람이 먼저 속도를 늦추면 다른 사람이 따라오기 쉬워지죠.",
  "작은 약속 하나를 정해 지켜 보면 이 풀이가 두 사람에게 맞는지 가늠할 수 있어요.",
  "이번 달에는 서로의 리듬을 한 번 이야기로 확인해 보는 편이 나아요.",
  "부딪히는 지점은 대개 일을 나누는 방식에서 먼저 드러나거든요.",
  "둘 다 편한 시간대를 찾아 두면 대화가 한결 부드러워져요.",
  "서로 잘하는 일을 하나씩 말해 보면 역할이 자연스럽게 나뉘어요.",
  "급할 때 먼저 하는 말이 서로 다르다는 점을 기억해 두면 좋아요.",
  "한쪽이 정리를 맡고 다른 쪽이 시작을 맡는 식으로 나눠 보세요.",
  "말로 꺼내기 전에 서로 무엇을 기대하는지 한 줄씩 정리해 두면 덜 엇갈려요.",
  "함께 보내는 시간의 양보다 그 시간을 여는 방식이 더 크게 남아요.",
  "부딪힌 날에는 결론보다 순서를 먼저 정하는 편이 회복이 빨라요.",
  "익숙한 역할을 한 번 바꿔 맡아 보면 서로의 무게를 알게 돼요.",
];

const nameOf = (m: MatchFacts) => m.label || "그 사람";
const eunOf = (word: string) => josa(word, "은", "는");
const relationText = (rs: Relation[]) => rs.map((r) => `${r.members.join("와 ")} 사이의 ${r.type}`).join(", ");
const countsLine = (counts: Record<string, number>) => Object.entries(counts).map(([e, n]) => `${e} ${n}`).join(", ");
/** The user's one-line concern, quoted once (the model is asked to answer it in a scene). */
const concernLine = (m: MatchFacts, tail: string) => (m.concern ? `'${m.concern}'라는 고민에는 ${tail}` : "");

export function mockMatchTeaser(m: MatchFacts): MatchTeaserDraft {
  const e = m.pair.elements;
  return {
    summary: fill([
      `명리에서는 두 사람의 일간을 ${m.pair.dayMasters.images}의 짝으로 읽어요.`,
      `${m.pair.dayMasters.meeting}.`,
      e.partnerFillsMine.length ? `${nameOf(m)} 쪽은 내 명식에 겉으로 없는 기운을 품고 있어요: ${e.partnerFillsMine[0]}.` : "두 사람의 오행은 서로 겹치는 쪽이 많아요.",
      concernLine(m, "두 결의 속도 차이부터 비춰 볼게요."),
      "이번 주에는 둘이 함께 정할 일 하나를 골라 먼저 순서를 나눠 보세요.",
    ], SAJU_PAIR_POOL, 310, 400),
  };
}

export function mockMatchPartA(m: MatchFacts): MatchPartA {
  const who = nameOf(m);
  const d = m.pair.dayMasters;
  const e = m.pair.elements;
  return {
    dayMasters: {
      body: fill([
        `나의 일간은 ${d.me}, ${who}의 일간은 ${d.partner}예요.`,
        `명리에서는 두 일간을 ${d.images}의 짝으로 읽어요.`,
        `${d.meeting}.`,
        `${eunOf(`${who}의 일간`)} 내게 ${d.partnerIsToMe}, 나의 일간은 ${who}에게 ${d.meIsToPartner}에 해당해요.`,
        d.stems.length ? `두 일간 사이에는 ${relationText(d.stems)} 관계가 있어요. 묶이려는 성질이나 움직임이 늘어나는 성질로만 읽어요.` : "두 일간 사이에 따로 묶이거나 부딪히는 관계는 보이지 않아요.",
        concernLine(m, "두 일간이 서로 다른 속도로 움직인다는 점부터 떠올려 보면 좋아요."),
        "함께 정한 일을 각자 다른 속도로 시작했다면 이 구조와 맞물리고, 늘 같은 속도로 움직였다면 이 부분은 덜 맞는 풀이예요.",
      ], SAJU_PAIR_POOL, 560, 750),
    },
    elements: {
      body: fill([
        `${e.basis}로 세면 나는 ${countsLine(e.me)}이에요.`,
        `${who} 쪽은 많은 기운이 ${e.partner.most.join("·")}, 적은 기운이 ${e.partner.fewest.join("·")} 쪽으로 기울어 있어요.`,
        e.partnerFillsMine.length ? `내 명식에 겉으로 없는 기운 가운데 ${who} 쪽이 품은 것도 있어요: ${e.partnerFillsMine.join(", ")}.` : `${who} 쪽이 내게 없는 기운을 따로 채워 주지는 않아요.`,
        e.mineFillsPartner.length ? `거꾸로 ${who} 쪽에 없는 ${e.mineFillsPartner.join(", ")}개는 내 쪽에 있어요.` : `${who} 쪽에 없는 기운을 내가 따로 채우지는 않아요.`,
        e.bothMissing.length ? `둘 다 겉에 없는 기운도 있어요(${e.bothMissing.join("·")}). 함께 의식해서 꺼내 써야 하는 힘이에요.` : "",
      ], SAJU_PAIR_POOL, 560, 750),
    },
    pillars: {
      body: fill([
        m.pair.dayBranches.length
          ? `가장 가까운 자리인 두 일지 사이에는 ${m.pair.dayBranches.map((r) => r.type).join(", ")} 관계가 있어요.`
          : "두 일지 사이에는 따로 묶이거나 부딪히는 관계가 보이지 않아 서로 담백한 거리를 두는 결로 읽어요.",
        "관계가 있다는 사실은 사건이 아니라 움직임이 늘어나거나 묶이려는 성질로만 읽어요.",
        // The pair's limits, said once as the prompt asks (the model copies these lines).
        ...m.pair.limits,
      ], SAJU_PAIR_POOL, 560, 750),
    },
    luck: {
      body: fill([
        m.pair.luck.me ? `${m.pair.luck.me.replace(/^나: /, "나는 ")}의 흐름에 있어요.` : "나는 첫 대운이 시작되기 전의 흐름으로 읽어요.",
        m.pair.luck.partner ? `${m.pair.luck.partner.replace(/^그 사람/, who)}.` : "",
        ...m.pair.luck.changes.map((line) => `${line}.`),
        ...m.pair.luck.sharedYears.map((line) => `${line} 관계가 있어 함께 움직임이 늘어나는 해로 읽어요.`),
        "대운은 방향을 보는 도구이지 특정한 일이 생긴다는 약속은 아니에요.",
      ], SAJU_PAIR_POOL, 560, 750),
    },
  };
}

/** Relation-neutral closers for a band of the year ahead: no glyphs, years, grades, dates, romance words or verdicts. */
const BAND_POOL: readonly string[] = [
  "이 무렵에는 서두르기보다 서로의 일정부터 한 번 맞춰 보는 편이 나아요.",
  "작은 약속 하나를 정해 지켜 보면 이 석 달의 결이 또렷해져요.",
  "말이 엇갈린 날에는 결론보다 순서를 먼저 정하면 한결 부드러워요.",
  "함께 보내는 시간이 짧아도 그 시간을 여는 첫마디가 오래 남아요.",
  "한 사람이 바쁜 주에는 다른 사람이 먼저 안부를 건네 보는 것도 방법이에요.",
  "둘 다 편한 시간대를 찾아 두면 대화가 덜 끊기죠.",
  "이 석 달에 해 본 작은 일이 다음 석 달의 기준이 돼요.",
  "서로의 속도를 묻는 한 문장이 생각보다 큰 힘이 돼요.",
  "같이 정한 일을 하나 끝내고 나면 다음 이야기가 쉬워져요.",
  "주말 하루쯤은 할 일을 비워 두고 쉬는 시간을 나눠 보세요.",
];

const monthName = (x: MonthAhead) => x.month.replace(/^\d+년 /, "");

/** A band of the year ahead: its months and my ten gods, the relations its months meet both 일지 with (theirs by name). */
function bandBody(band: YearBand, i: number, who: string): string {
  const moving = band.months.filter((x) => x.withMyDay.length || x.withTheirDay.length).slice(0, 2);
  return fill([
    `${band.months.map(monthName).join(", ")}에는 달마다 천간이 내게 ${[...new Set(band.months.map((x) => x.tenGod))].join("·")}의 결로 들어와요.`,
    ...moving.map((x) => {
      const meets = [x.withMyDay.length ? `나의 일지와 ${x.withMyDay.join("·")}` : "", x.withTheirDay.length ? `${who}의 일지와 ${x.withTheirDay.join("·")}` : ""].filter(Boolean);
      return `${monthName(x)}에는 그달의 지지가 ${meets.join(", ")} 관계를 맺어 움직임이 늘어나는 때로 읽어요.`;
    }),
    moving.length ? "" : "이 석 달에는 두 일지와 따로 묶이거나 부딪히는 달이 없어 담백하게 이어 가기 쉬운 때로 읽어요.",
  ], rotate(BAND_POOL, i * 2), 310, 400);
}

export function mockMatchPartB(m: MatchFacts): MatchPartB {
  const who = nameOf(m);
  const d = m.pair.dayMasters;
  const e = m.pair.elements;
  return {
    verdict: "앞으로 1년은 서로의 속도를 묻는 한 문장부터 맞춰 보세요.",
    periods: m.pair.year.map((band, i) => ({ body: bandBody(band, i, who) })),
    together: {
      body: fill([
        `명리에서는 ${eunOf(`${who}의 일간`)} 내게 ${d.partnerIsToMe}, 나의 일간은 ${who}에게 ${d.meIsToPartner}의 자리에 놓인다고 읽어요.`,
        e.partnerFillsMine.length ? `내게 겉으로 없는 기운을 ${who} 쪽이 품고 있어 그 결을 알아봐 주는 말이 잘 닿아요.` : "두 사람의 오행이 겹치는 쪽이 있어 같은 취향을 짚어 주는 말이 잘 닿아요.",
        "\"오늘 어땠어요?\"처럼 먼저 안부를 묻는 말, \"고마워요\"처럼 짧게 건네는 말이 서로에게 편하게 닿아요.",
        "행동으로는 약속 시간을 미리 정해 두기, 상대가 잘한 일을 한 가지씩 짚어 주기, 함께 걷는 시간을 10분 만들기가 좋아요.",
      ], SAJU_PAIR_POOL, 310, 420),
    },
    avoid: {
      body: fill([
        m.pair.dayBranches.length
          ? `두 일지 사이에 ${m.pair.dayBranches.map((r) => r.type).join(", ")} 관계가 있어 같은 일을 두고 움직이는 속도가 엇갈리기 쉬운 결로 읽어요.`
          : "두 일지 사이에 따로 묶이거나 부딪히는 관계가 없어 서로 거리를 넉넉히 두는 결로 읽어요.",
        e.bothMost.length ? `둘 다 ${e.bothMost.join("·")} 기운이 많아 같은 쪽으로만 힘이 쏠리기 쉬워요.` : "",
        "바쁜 날 결론부터 따지는 말, 지난 일을 한꺼번에 꺼내는 말은 피하는 편이 좋아요.",
        "대신 \"지금 이야기해도 괜찮아요?\"라고 먼저 묻고, 할 말을 하나만 골라 꺼내 보세요.",
        "답을 재촉하기보다 하루쯤 기다려 주는 쪽이 서로에게 편해요.",
      ], SAJU_PAIR_POOL, 310, 420),
    },
    action: { body: fill(["오늘은 \"요즘 어때요?\"라고 먼저 한 문장을 건네 보세요."], ACTION_POOL, 85, 160) },
    observation: { body: fill([`몇 주 동안 ${who}와 이야기가 길어지는 때가 언제인지 눈여겨보세요.`], ["그때 내 쪽 반응이 어떤지도 함께 보면 좋아요.", ...ACTION_POOL], 85, 180) },
    followUps: ["앞으로 석 달 먼저 해 볼 일은요?", "엇갈릴 때는 어떻게 하면 좋을까요?"],
  };
}

// ---- 2027 신년운세 ----

/** One-person, year-neutral sentences: no glyphs, ten gods, years, dates, grades or organ names. */
export const YEAR_POOL: readonly string[] = [
  "이 무렵에는 한꺼번에 많이 벌이기보다 하나를 끝까지 해 보는 편이 맞아요.",
  "작은 일정 하나를 미리 정해 두면 흐름을 놓치지 않아요.",
  "미뤄 둔 일을 하나 꺼내 보면 손이 가볍게 풀리죠.",
  "몸이 무거운 날에는 속도를 낮추고 순서만 지켜도 충분해요.",
  "새로 만나는 사람에게 먼저 한 문장을 건네 보는 것도 방법이에요.",
  "들어오고 나가는 돈의 흐름을 한 번 확인하는 데서 시작해요.",
  "쉬는 날을 먼저 정해 두면 일하는 날의 집중이 달라져요.",
  "해 보고 싶던 배움 하나를 짧게 시작해 보기에 알맞은 흐름이에요.",
  "결정을 서두르기보다 정보를 한 가지 더 모아 보세요.",
  "주변에 도움을 청하는 말이 생각보다 쉽게 받아들여지는 국면이에요.",
  "한 주를 마칠 때 잘된 일 하나를 떠올려 보면 다음 주가 가벼워져요.",
  "계획을 크게 세우기보다 이번 달 안에 끝낼 수 있는 크기로 나눠요.",
  "익숙한 길 대신 한 번은 다른 방식으로 해 보면 새 자리가 보여요.",
  "잠드는 시간을 일정하게 지키면 다음 날의 리듬이 한결 고르게 이어져요.",
];

const rotate = <T>(items: readonly T[], k: number) => [...items.slice(k % items.length), ...items.slice(0, k % items.length)];
const UNSURE = "잘 모르겠어요";

function monthBody(m: MonthFact, n: NewYearFacts): string {
  return fill([
    m.month === 1
      ? `1월은 아직 ${n.year.january.ko}(${n.year.january.gz})년의 끝자락이고, 달로는 ${m.display}월이에요.`
      : `${m.month}월은 ${m.display}월이에요.`,
    `천간은 내 일간에게 ${m.stemTenGod}, 지지의 대표 글자는 ${josa(m.branchMainTenGod, "이에요", "예요")}.`,
    m.relationsToNatal.length
      ? `내 명식과는 ${m.relationsToNatal.map((r) => r.type).join(", ")} 관계가 있어 움직임이 늘어나는 달로 읽어요.`
      : "내 명식과 따로 묶이거나 부딪히는 글자는 없어 차분히 이어 가기 쉬운 달로 읽어요.",
  ], rotate(YEAR_POOL, m.month), 290, 380);
}

/** The user's own context, quoted once each: the concern in the overview, the love status (and 결혼) in relations. */
function concernLineOf(n: NewYearFacts): string {
  const concern = n.facts.profile?.concern;
  return concern ? `'${concern}'라는 고민에는 올해 세운의 결부터 비춰 볼게요.` : "";
}

function relationLinesOf(n: NewYearFacts): string[] {
  const love = n.facts.profile?.loveStatus;
  if (!love || love === UNSURE) return [];
  const marriage = ["연애 중", "결혼 준비 중", "기혼"].includes(love)
    ? "결혼을 생각할 때도 이 명식은 함께 사는 생활의 크고 작은 결정을 둘이 나눠 정하는 쪽으로 읽어요."
    : "";
  return [`지금은 ${josa(love, "이라고", "라고")} 알려 줬죠.`, marriage];
}

export function mockNewYearTeaser(n: NewYearFacts): NewYearTeaserDraft {
  const a = n.facts.annual;
  return {
    title: "차근차근 쌓아 가는 해",
    summary: fill([
      `2027년의 세운은 ${a.ko}(${a.gz})예요.`,
      `명리에서는 세운의 천간을 내 일간에게 ${a.stemTenGod}, 지지의 대표 글자를 ${ro(a.branchMainTenGod)} 읽어요.`,
      n.year.luckChange ? `${n.year.luckChange}.` : "2027년 안에는 대운이 바뀌지 않아요.",
      "1월에는 올해 꼭 끝내고 싶은 일 하나를 골라 첫 단계만 해 보세요.",
    ], YEAR_POOL, 310, 400),
  };
}

export function mockNewYearPartA(n: NewYearFacts): NewYearPartA {
  const a = n.facts.annual;
  const current = n.facts.luck?.current;
  const workStatus = n.facts.profile?.workStatus;
  const work = workStatus && workStatus !== UNSURE ? workStatus : "지금의 일";
  const area = (lead: string[], k: number) => ({ body: fill(lead, rotate(YEAR_POOL, k), 290, 400) });
  return {
    title: "차근차근 쌓아 가는 해",
    overview: {
      body: fill([
        concernLineOf(n),
        `2027년의 세운은 ${a.ko}(${a.gz})예요.`,
        `명리에서는 세운의 천간을 내 일간에게 ${a.stemTenGod}, 지지의 대표 글자를 ${ro(a.branchMainTenGod)} 읽어요.`,
        a.relationsToNatal.length ? `원국과는 ${a.relationsToNatal.map((r) => r.type).join(", ")} 관계가 생겨요. 사건이 아니라 움직임이 늘어나는 국면으로 읽어요.` : "원국과 따로 묶이거나 부딪히는 글자는 없어요.",
        "새로 맡은 일이 늘수록 힘이 났다면 이 구조와 맞물리고, 익숙한 일만 이어 갈 때 편했다면 이 부분은 덜 맞는 풀이예요.",
      ], YEAR_POOL, 510, 700),
    },
    luck: {
      body: fill([
        current ? `2027년은 ${current.from}부터 ${current.to}까지 이어지는 ${current.ko}(${current.gz}) 대운 안에 있어요.` : "2027년은 첫 대운이 시작되기 전의 흐름으로 읽어요.",
        current ? `대운의 천간은 ${current.stemTenGod}, 지지의 대표 글자는 ${josa(current.branchMainTenGod, "이에요", "예요")}.` : "",
        n.year.luckChange ? `${n.year.luckChange}. 바뀌는 무렵에는 앞뒤 몇 달의 차이가 있을 수 있어요.` : "2027년 안에는 대운이 바뀌지 않아 한 해의 결이 고르게 이어져요.",
        // The limits, said once at the end of this section as the prompt asks.
        ...n.facts.limits,
      ], YEAR_POOL, 310, 450),
    },
    areas: {
      work: area([`일에서는 ${work}의 자리에서 ${a.stemTenGod}의 결이 먼저 드러나기 쉬워요.`], 1),
      money: area(["돈은 큰 결정보다 매달 들어오고 나가는 흐름을 한 번 정리하는 데서 시작해요."], 4),
      relations: area(["관계에서는 먼저 연락하는 쪽이 되는 것이 올해의 작은 실험이에요.", ...relationLinesOf(n)], 7),
      health: area(["몸과 생활 리듬은 잠드는 시간과 밥 먹는 시간을 일정하게 지키는 데서 시작해요."], 10),
    },
    lucky: {
      body: fill([
        `재미로 보는 가벼운 제안이에요. 올해는 ${n.year.lucky.element} 기운을 떠올리게 하는 ${n.year.lucky.color}을 가까이 두고, ${n.year.lucky.habit} 같은 작은 습관을 들여 보세요.`,
      ], [
        "작게 시작한 습관이 한 해의 리듬을 잡아 줘요.",
        "색은 옷이나 소품처럼 눈에 자주 닿는 곳에 두면 충분해요.",
        "꼭 지키기보다 생각날 때 한 번씩 해 보는 정도면 돼요.",
      ], 130, 220),
    },
  };
}

export function mockNewYearPartB(n: NewYearFacts): NewYearPartB {
  return { firstHalf: n.year.months.slice(0, 6).map((m) => ({ body: monthBody(m, n) })) };
}

export function mockNewYearPartC(n: NewYearFacts): NewYearPartC {
  return {
    secondHalf: n.year.months.slice(6).map((m) => ({ body: monthBody(m, n) })),
    closing: {
      body: fill([
        "열두 달 가운데 명식과 관계가 생기는 달을 미리 표시해 두면 한 해의 리듬을 잡기 쉬워요.",
        "그 달에는 새 일을 늘리기보다 이미 시작한 일을 다듬는 쪽에 힘을 써 보세요.",
      ], YEAR_POOL, 260, 380),
    },
    observation: {
      body: fill(["1월에는 새로 시작한 일 하나가 얼마나 이어지는지 눈여겨보세요."], [
        "두 주를 넘겨 이어진다면 올해의 흐름과 맞물린 거예요.",
        "중간에 멈췄다면 그 일을 더 작은 크기로 나눠 다시 시작해 보면 돼요.",
      ], 85, 180),
    },
    followUps: ["올해 가장 힘을 줄 달은 언제예요?", "올해 새로 시작하기 좋은 무렵은요?"],
  };
}

// ---- 이어서 물어보기 ----

/** "너 무슨 AI야?" and the like: answered as the blinding rule says (lib/ai/mock.ts does the same). */
const IDENTITY = /ai|에이아이|인공지능|모델|챗봇|누가 만들|무엇으로 만들|뭘로 만들/i;

export function mockMatchFollowUp(m: MatchFacts, question = ""): FollowUpAnswer {
  const identity = IDENTITY.test(question);
  return {
    kind: identity ? "out_of_scope" : "clarify",
    answer: fill([
      ...(identity ? ["저는 스타로그의 풀이 도우미예요. 어떤 기술로 만들었는지는 알려 드리지 않아요."] : []),
      `앞의 풀이에서 두 사람의 일간을 ${m.pair.dayMasters.images}의 짝으로 읽었어요.`,
      `${nameOf(m)}의 마음을 단정할 수는 없어서, 확인할 수 있는 신호와 대화의 방법으로 이어서 답할게요.`,
    ], SAJU_PAIR_POOL, 160, 440),
  };
}
