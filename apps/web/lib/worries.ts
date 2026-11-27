import { TOPICS_BY_WHO, type When, type Who } from "@starlog/core";
import { SITE, won, type SajuTopicsMode } from "./config";
import { crisisTier } from "./crisis";
import type { FlowState } from "./flowState";
import { productById, type ProductId } from "./pay/catalog";
import { premiumPath, type PremiumId } from "./premium/products";
import type { SajuTopicId } from "./reading/types";
import { topicLabel } from "./sajuTopics";

/**
 * 고민 진열 (docs/superpowers/specs/2026-11-26-worry-catalog-design.md §4, §5.1, with §12's names): twelve worries, each
 * only a filled-in doorway into a reading that already exists (타로 3장, 사주 by topic, 프리미엄 궁합, 켈틱 크로스 10장).
 * Nothing here is a new reading, a price or a prompt: prices come from lib/pay/catalog.ts, a tarot worry's values are the
 * flow's own (lib/flowState.ts, kept as they are by sanitizeFlow), a saju worry's topic is the one /saju/new?topic= takes.
 * The address carries the id only (/w/<id>), never a value. Client-safe: no React, no server import.
 */

export type WorryId =
  | "some"
  | "no-reply"
  | "miss-ex"
  | "again"
  | "after-breakup"
  | "moved-on"
  | "coworker"
  | "solo"
  | "money-leak"
  | "job"
  | "marry"
  | "stay-or-go";

export type WorryCategory = "love" | "money" | "work";

/** The tabs of /worries after 전체 (§5.3), and each worry's group (§4). */
export const WORRY_CATEGORIES: ReadonlyArray<{ id: WorryCategory; label: string }> = [
  { id: "love", label: "연애·재회" },
  { id: "money", label: "돈" },
  { id: "work", label: "일" },
];

/**
 * A tarot worry's question as the flow holds it: 누구, the 무엇 chip or a typed 무엇, 언제 and the situation chips it picks
 * (option strings exactly as packages/core/src/tarot/templates.ts writes them), and `spread: "deep"` for 켈틱 크로스 10장.
 * 언제 is 이번 달 for every worry: §4 names none, and it is the one chip every topic here allows.
 */
export type WorryTarotFlow = { who: Who; when: When; conditions: Record<string, string> } & Pick<FlowState, "topicId" | "topicText" | "spread">;

export type WorryReading = { kind: "tarot"; flow: WorryTarotFlow } | { kind: "saju"; topic: SajuTopicId } | { kind: "match" };

export interface Worry {
  id: WorryId;
  /** The worry's name: a card's title, the detail page's <h1> and <title>. */
  name: string;
  /** The reader's one line, in 반말 as the owner's characters speak. */
  line: string;
  category: WorryCategory;
  /** Who reads it: 타로로 (cat) for tarot, 사주주 (rabbit) for saju and 궁합. */
  reader: "cat" | "rabbit";
  /** §12.1: what the reading looks at first, then briefly what it does not, inside 이 풀이가 보는 것 (only where a name could be read as a forecast). */
  scope?: string;
  /** 뽑기 전에 떠올려 봐: questions to think over alone, not what the reading says. */
  reflect: readonly [string, string, string];
  reading: WorryReading;
}

const MONTH: When = "month";
const tarot = (flow: Omit<WorryTarotFlow, "when" | "conditions"> & { conditions?: Record<string, string> }): WorryReading => ({
  kind: "tarot",
  flow: { ...flow, when: MONTH, conditions: flow.conditions ?? {} },
});

export const WORRIES: readonly Worry[] = [
  {
    id: "some", name: "이거 썸 맞아?", line: "톡 말고, 약속도 서로 잡아?", category: "love", reader: "cat",
    reflect: ["어떤 말이나 행동 때문에 썸이라고 느꼈지?", "실제로 주고받는 관심과 내가 기대하는 건 어떻게 다르지?", "이 관계가 뭔지 묻고 싶다면 어떤 말부터 꺼낼까?"],
    reading: tarot({ who: "us", topicId: "crush" }),
  },
  {
    id: "no-reply", name: "답 없는 톡, 먼저 할까", line: "답 없는 톡에 네 하루 다 쓰진 마.", category: "love", reader: "cat",
    reflect: ["마지막 대화에서 실제로 오간 말은 뭐였지?", "내가 기다리는 건 답장이야, 관계에 대한 설명이야?", "연락이 계속 없다면 언제쯤 기다림을 멈추고 싶지?"],
    reading: tarot({ who: "us", topicId: "contact" }),
  },
  {
    id: "miss-ex", name: "끝났는데 보고 싶어", line: "그 사람이 그리워, 그때 네가 그리워?", category: "love", reader: "cat",
    reflect: ["그 관계에서 지금도 유독 선명한 순간은 뭐지?", "요즘 어떤 날에 그 사람이 더 자주 떠오르지?", "또 보고 싶어질 때, 연락하기 전에 내 마음에 뭘 물어볼까?"],
    reading: tarot({ who: "me", topicId: "mind", conditions: { cause: "사람 때문에" } }),
  },
  {
    id: "again", name: "다시 만나도 될까", line: "다시 만날 이유에 달라진 것도 있어?", category: "love", reader: "cat",
    reflect: ["우린 어떤 문제를 끝내 풀지 못했지?", "그때와 달라졌다고 말할 만한 행동이 있었나?", "다시 만났는데 같은 문제가 나오면 이번엔 어떻게 풀어 보고 싶지?"],
    reading: tarot({ who: "us", topicId: "reunion" }),
  },
  {
    id: "after-breakup", name: "헤어지고 멍해", line: "오늘은 잊으려 애쓰지 말고 밥부터 먹자.", category: "love", reader: "cat",
    reflect: ["이별과 함께 끊긴 일상 중 뭐가 가장 크게 느껴졌지?", "하루 중 언제 마음이 가장 버거워지지?", "내일 그 시간이 오기 전에 나를 위해 뭘 챙겨 둘까?"],
    reading: tarot({ who: "me", topicId: "love", conditions: { status: "헤어진 지 얼마 안 됨", focus: "마음 정리" } }),
  },
  {
    // A typed 무엇 (§4): the builder makes it "이번 달 전 애인 소식에 흔들리는 내 마음, 어떻게 추스를까?" (lib/worries.test.ts).
    // 누구 is 나 (code review 2026-11-26 A2): the cards are read as 지금의 나 · 필요한 것 · 이 시기의 흐름 (self-flow), about the
    // person's own mind, not 두 사람의 흐름.
    id: "moved-on", name: "전 애인 소식에 울컥", line: "모르는 부분까지 네 탓으로 채우진 마.", category: "love", reader: "cat",
    scope: "본 것과 짐작한 것을 나누고 지금 마음을 봐요. 새 연애가 사실인지는 가리지 않아요.",
    reflect: ["그때 직접 본 것과 헤어진 뒤에 짐작한 건 각각 뭐였지?", "더 마음에 걸리는 건 새 연애야, 속았을지도 모른다는 느낌이야?", "확답을 못 듣더라도 내 마음을 위해 뭘 그만 확인하고 싶지?"],
    reading: tarot({ who: "me", topicText: "전 애인 소식에 흔들리는 내 마음, 어떻게 추스를까" }),
  },
  {
    id: "coworker", name: "일보다 사람이 힘들어", line: "퇴근했는데 그 말은 아직 안 끝났지.", category: "work", reader: "cat",
    reflect: ["그 사람과 일할 때 어떤 상황이 반복해서 힘들었지?", "업무상 필요한 요청과 받아 주기 어려운 말이나 행동을 어떻게 구분할까?", "같은 일이 또 생기면 어떤 말로 선을 긋고 누구에게 도움을 청할까?"],
    reading: tarot({ who: "us", topicId: "conflict", conditions: { relation: "직장 동료" } }),
  },
  {
    id: "solo", name: "연애는 하고 싶은데", line: "외로운 거랑 연애하고 싶은 건 달라.", category: "love", reader: "rabbit",
    reflect: ["혼자 지낸 시간이 내 연애 기준을 어떻게 바꿨지?", "누군가를 만나고 싶은 마음은 언제 가장 커지지?", "새 사람을 만난다면 어떤 속도가 나한테 편할까?"],
    reading: { kind: "saju", topic: "love" },
  },
  {
    id: "money-leak", name: "돈 쓰고 또 후회해", line: "큰돈 안 썼다면 자주 나간 돈부터 봐.", category: "money", reader: "rabbit",
    reflect: ["지난달 별생각 없이 반복한 결제는 뭐였지?", "안 써도 덜 아쉬울 지출은 뭐지?", "다음 월급날엔 어떤 돈을 먼저 따로 떼어 둘까?"],
    reading: { kind: "saju", topic: "money" },
  },
  {
    id: "job", name: "어떤 일이 나랑 맞지?", line: "잘하는 일이랑 버티는 일은 달라.", category: "work", reader: "rabbit",
    scope: "일하는 방식과 잘 맞는 일의 결을 봐요. 합격 여부나 날짜는 예측하지 않아요.",
    reflect: ["시간 가는 줄 몰랐던 일은 뭐였지?", "잘한다는 말은 들었지만 하기 싫었던 일은 뭐였지?", "다음 자리에서 꼭 피하고 싶은 환경은 뭐지?"],
    reading: { kind: "saju", topic: "career" },
  },
  {
    id: "marry", name: "결혼 얘기 중인 우리", line: "좋아하는 건 알겠고, 같이 사는 건 어때?", category: "love", reader: "rabbit",
    reflect: ["우리 둘은 의견이 다를 때 지금까지 어떻게 풀어 왔지?", "돈, 집안일, 각자의 시간 중 아직 말 맞춰 보지 않은 건 뭐지?", "결혼을 결정하기 전에 어떤 일상을 함께 그려 봐야 할까?"],
    reading: { kind: "match" },
  },
  {
    id: "stay-or-go", name: "오늘도 퇴사 생각", line: "일이 싫은 거야, 이 회사가 싫은 거야?", category: "work", reader: "cat",
    reflect: ["옮기고 싶다는 생각은 어떤 일이 있을 때마다 들었지?", "남고 싶은 이유와 못 떠나는 이유는 어떻게 다르지?", "옮기기로 한다면 어떤 조건부터 확인해야 덜 불안할까?"],
    reading: tarot({ who: "me", topicId: "career", spread: "deep" }),
  },
];

/** The home board's six (§5.4), in this order. */
export const HOME_WORRY_IDS: readonly WorryId[] = ["some", "no-reply", "again", "solo", "money-leak", "job"];

export { WORRIES_PATH } from "./worryPaths";
export const worryPath = (id: WorryId) => `/w/${id}`;
export const findWorry = (id: string): Worry | undefined => WORRIES.find((worry) => worry.id === id);

/** The catalog product a worry's reading is sold as. */
export function worryProduct(worry: Worry): ProductId {
  const reading = worry.reading;
  if (reading.kind === "tarot") return reading.flow.spread === "deep" ? "tarot-deep" : "tarot";
  return reading.kind === "saju" ? "saju" : "match";
}

/** The premium product that must be visible for a worry to show (the product's own entries follow the same rule), or null. */
export function worryPremium(worry: Worry): PremiumId | null {
  const product = worryProduct(worry);
  return product === "tarot-deep" || product === "match" ? product : null;
}

/** The way it is read and its price, both from the catalog (§12.3): "타로 3장", "사주 연애운", "프리미엄 궁합", "켈틱 크로스 10장". */
export function worryMethod(worry: Worry): { name: string; krw: number } {
  const product = productById(worryProduct(worry))!;
  const reading = worry.reading;
  const name = reading.kind === "saju" ? `사주 ${topicLabel(reading.topic)}` : product.id === "tarot" ? "타로 3장" : product.name;
  return { name, krw: product.krw };
}

/** The method, a middle dot and its catalog price ("타로 3장 · " then won()): a card's, a row's and /pricing's way of saying it. */
export function methodLine(worry: Worry): string {
  const method = worryMethod(worry);
  return `${method.name} · ${won(method.krw)}`;
}

/** The flow a tarot worry's start writes: a new question (no cards, no note), the worry's values only. */
export function presetFlow(worry: Worry): FlowState {
  if (worry.reading.kind !== "tarot") throw new Error(`${worry.id} is not a tarot worry`);
  return { ...worry.reading.flow, conditions: { ...worry.reading.flow.conditions }, note: "" };
}

/**
 * Where the start button goes and what it says: the next screen's own step (§12.2). Tarot goes to the situation step with
 * its values chosen (a typed 무엇 has no chips: straight to the draw), saju to the birth input on its topic, 궁합 to its form.
 */
export function worryStart(worry: Worry): { href: string; label: string } {
  const reading = worry.reading;
  if (reading.kind === "tarot") return reading.flow.topicText ? { href: "/tarot/draw", label: "카드 뽑기" } : { href: "/tarot/new/situation", label: "상황 고르기" };
  if (reading.kind === "saju") return { href: `/saju/new?topic=${reading.topic}`, label: "생년월일 넣기" };
  return { href: `${premiumPath("match")}/new`, label: "두 사람 생년월일 넣기" };
}

/**
 * The worries this device may see: the premium ones only where their product is visible (`premium`, the premium status:
 * undefined or null while unknown, so neither shows), the saju ones only while the saju topics are on for everyone (a
 * topic the chart would not read is never promised).
 */
export function visibleWorries(
  premium: Partial<Record<PremiumId, { visible: boolean }>> | null | undefined,
  topics: SajuTopicsMode = SITE.features.sajuTopics,
): Worry[] {
  return WORRIES.filter((worry) => {
    const needs = worryPremium(worry);
    if (needs && !premium?.[needs]?.visible) return false;
    return worry.reading.kind !== "saju" || topics === "on";
  });
}

/**
 * 다음 고민 (§7 as §12.5 narrowed it): after a finished tarot reading, one worry, only when a situation the person chose
 * says it. A record keeps no topic, only the chosen chips as label and value; each rule's chip belongs to one topic alone
 * (lib/worries.test.ts), so the chip tells the topic.
 */
export const NEXT_WORRY_RULES = (
  [
    { who: "us", topicId: "crush", condition: "relation", value: "연락이 뜸함", next: "no-reply" },
    { who: "us", topicId: "contact", condition: "relation", value: "헤어진 사이", next: "again" },
  ] as const
).map((rule) => ({ ...rule, label: TOPICS_BY_WHO[rule.who].find((topic) => topic.id === rule.topicId)!.conditions.find((c) => c.id === rule.condition)!.label }));

/**
 * The 다음 고민 for a finished tarot reading, or null: none while the catalog is off, none for a reading with crisis words
 * (lib/crisis.ts) in its question or note, none unless a chosen chip matches a rule. 이별 직후 and 마음·감정 readings match none.
 */
export function nextWorryFor(reading: { question: string; note: string; conditions: ReadonlyArray<{ label: string; value: string }> }): Worry | null {
  if (!SITE.features.worries) return null;
  if (crisisTier(reading.question) !== null || crisisTier(reading.note) !== null) return null;
  const rule = NEXT_WORRY_RULES.find((r) => reading.conditions.some((c) => c.label === r.label && c.value === r.value));
  return rule ? (visibleWorries(null).find((worry) => worry.id === rule.next) ?? null) : null;
}
