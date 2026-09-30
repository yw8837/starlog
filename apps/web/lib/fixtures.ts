import "server-only";
import { TEMPLATES, type Orientation, type TemplateId } from "@starlog/core";
import sajuJson from "@content/samples/saju-prologue.ko.json";
import tarotJson from "@content/samples/tarot-contact.ko.json";
import type { FlowFallback } from "./flowState";

/**
 * Gold fixtures for P1 screens. Real readings arrive in P3; until then every result and chapter
 * screen renders these, so their text always matches the three fixture cards.
 */

export interface Section {
  heading: string;
  body: string;
}

export interface TarotSampleCard {
  position: string;
  cardId: string;
  name: string;
  /** Printed card number, e.g. "IX" or "Ace". */
  number: string;
  orientation: Orientation;
  keyword: string;
}

export interface TarotPaid {
  verdict: string;
  cards: Array<{ position: string; cardId: string; heading: string; body: string }>;
  connection: Section;
  timing: Section;
  scenarios: { heading: string; items: Array<{ label: string; body: string }> };
  messages: { heading: string; items: string[]; hint: string };
  avoid: { heading: string; items: string[] };
  alternatives: Section;
  action: Section;
}

export interface TarotInput {
  who: string;
  what: string;
  when: string;
  conditions: Array<{ label: string; value: string }>;
  note: string;
}

export interface TarotSample {
  id: string;
  template: TemplateId;
  question: string;
  input: TarotInput;
  cards: TarotSampleCard[];
  free: { firstCard: Section; lockedToc: string[] };
  paid: TarotPaid;
  story: { title: string; body: string };
  followUps: string[];
}

function toOrientation(value: string): Orientation {
  if (value === "upright" || value === "reversed") return value;
  throw new Error(`Unknown orientation in fixture: ${value}`);
}

function toTemplateId(value: string): TemplateId {
  if (Object.hasOwn(TEMPLATES, value)) return value as TemplateId;
  throw new Error(`Unknown template in fixture: ${value}`);
}

export const TAROT_SAMPLE: TarotSample = {
  ...tarotJson,
  template: toTemplateId(tarotJson.template),
  cards: tarotJson.cards.map((card) => ({ ...card, orientation: toOrientation(card.orientation) })),
};

/** What the tarot screens show on a direct visit, when no question was built in this tab. */
export const TAROT_FALLBACK: FlowFallback = {
  question: TAROT_SAMPLE.question,
  template: TAROT_SAMPLE.template,
  input: { conditions: TAROT_SAMPLE.input.conditions, note: TAROT_SAMPLE.input.note },
};

export type SajuSample = typeof sajuJson;
export const SAJU_SAMPLE: SajuSample = sajuJson;

/** Paid section headings in reading order (the order the chapter renders them). */
export function paidHeadings(paid: TarotPaid): string[] {
  return [
    ...paid.cards.map((card) => card.heading),
    paid.connection.heading,
    paid.timing.heading,
    paid.scenarios.heading,
    paid.messages.heading,
    paid.avoid.heading,
    paid.alternatives.heading,
    paid.action.heading,
  ];
}

export interface StoryChapter {
  id: string;
  kind: "saju" | "tarot";
  /** Short marker shown before the title, e.g. "1장". */
  label: string;
  title: string;
  href: string;
  cards: Array<{ cardId: string; orientation: Orientation; name: string }>;
  /** What the story timeline shows under the title in 이야기 / 풀이 mode. */
  excerpt: { story: string; plain: string };
  /** Saju chapters: the chart's day pillar (hanja) and day master. */
  saju?: { dayPillar: string; dayMaster: string };
}

export interface FriendScene {
  id: string;
  /** Exactly what the friend typed as their nickname. */
  nickname: string;
  cardId: string;
  orientation: Orientation;
  message: string;
  status: "pending" | "approved";
}

export const STORY_FIXTURE: { chapters: StoryChapter[]; friendScenes: FriendScene[] } = {
  chapters: [
    {
      id: "prologue",
      kind: "saju",
      label: "프롤로그",
      title: SAJU_SAMPLE.free.title,
      href: "/chapter/prologue",
      cards: [],
      excerpt: { story: SAJU_SAMPLE.story.body, plain: SAJU_SAMPLE.free.summary },
      saju: {
        dayPillar: SAJU_SAMPLE.chart.pillars.day.stem + SAJU_SAMPLE.chart.pillars.day.branch,
        dayMaster: SAJU_SAMPLE.chart.dayMaster.ko,
      },
    },
    {
      id: "sample",
      kind: "tarot",
      label: "1장",
      title: TAROT_SAMPLE.story.title,
      href: "/chapter/sample",
      cards: TAROT_SAMPLE.cards.map(({ cardId, orientation, name }) => ({ cardId, orientation, name })),
      excerpt: { story: TAROT_SAMPLE.story.body, plain: TAROT_SAMPLE.paid.verdict },
    },
  ],
  friendScenes: [
    {
      id: "friend-1",
      nickname: "지인 A",
      cardId: "major-19-sun",
      orientation: "upright",
      message: "이 카드 보자마자 네 생각이 났어",
      status: "pending",
    },
  ],
};

/** Signed-in fixture balance: enough 별조각 for one reading, 6 달빛 short of one. */
export const WALLET_FIXTURE = { moonlight: 4, stardust: 12 };

/**
 * Follow-up fixtures for an opened reading (P3 answers real questions): the suggested questions,
 * an answer written for each suggestion, and one answer for anything the user types.
 */
export interface FollowUpFixture {
  suggestions: string[];
  /** Keyed by the suggestion's exact text. */
  answers: Record<string, string>;
  /** Answer to a question the user typed. */
  other: string;
}

const [draftLine = "", afterSending = ""] = tarotJson.followUps;

/**
 * Tarot sample follow-ups. The answers never assume what the user chose ("가벼운 안부라면…"), and
 * the first one actually drafts the line it was asked for.
 */
export const TAROT_FOLLOW_UPS: FollowUpFixture = {
  suggestions: [draftLine, afterSending],
  answers: {
    [draftLine]:
      "가벼운 안부라면 첫 문장은 한 줄이면 충분해요. 이렇게 써 볼 수 있어요. “문득 생각나서 연락해 봤어. 요즘 어떻게 지내?” 두 사람이 나눴던 이야기가 떠오르면 “지난번에 얘기했던 ○○ 어떻게 됐어?”처럼 그 이야기로 바꿔도 좋아요. 말투는 평소 쓰던 대로 고치고, 질문은 하나만 남겨 두세요.",
    [afterSending]:
      "보낸 뒤 답을 기다리는 일이 숙제처럼 느껴진다면, 은둔자처럼 등불을 잠시 내 쪽으로 돌려 보세요. 휴대폰은 조금 멀리 두고, 읽었는지 확인하거나 한 번 더 보내는 일은 미뤄 두는 거예요. 답이 오면 그때 반갑게 이어 가면 충분해요. 답이 늦는다고 그 사람의 마음을 다 알 수 있는 건 아니니, 오늘은 내 할 일로 하루를 채워 보세요.",
  },
  other:
    "펼친 세 장에 비춰서 볼게요. 은둔자는 먼저 내 마음을 고르라고, 별은 두 사람 사이가 천천히 다시 채워질 수 있다고, 완드 에이스는 작게 시작하라고 말해요. 궁금한 일도 이 순서로 살펴보세요. 내 마음이 먼저 분명해지면, 다음 한 걸음은 작고 가벼운 쪽이 잘 맞아요.",
};

const metalQuestion = "겉에 금이 없다는 건 어떤 뜻이에요?";
const hourQuestion = "태어난 시를 알게 되면 뭐가 달라져요?";

/** Follow-ups on the sample prologue. They state only the sample chart's facts, with the reading hedged. */
export const SAJU_FOLLOW_UPS: FollowUpFixture = {
  suggestions: [metalQuestion, hourQuestion],
  answers: {
    [metalQuestion]:
      "확실한 것부터 말하면, 일간은 병화(丙火)이고 보이는 여섯 글자 가운데 금(金)은 없어요. 대신 태어난 해의 뱀(巳) 속에 경금(庚金)이 숨어 있어요. 명리에서는 이런 구조를 금이 모자라다기보다 의식해서 꺼내 써야 하는 힘으로 읽기도 해요.",
    [hourQuestion]:
      "지금은 태어난 시를 몰라 연주·월주·일주의 여섯 글자로만 읽었어요. 태어난 시를 알게 되면 시주 두 글자가 더해져 오행 개수와 대운이 시작되는 시기가 달라질 수 있어요. 그때 내 정보에서 고치고 다시 계산해 보세요.",
  },
  other:
    "확실한 것부터 말하면, 일간은 병화(丙火)이고 한겨울인 자월(子月)에 태어났어요. 명리에서는 이 명식을 한겨울에 뜬 해, 곧 추운 계절에 주변을 데우는 불로 읽기도 해요. 궁금한 일도 이 그림에 비춰 보고, 위 풀이에서 내 경험과 맞물리는 장면부터 찾아보세요.",
};

/** Placeholder invite token for the share preview (real tokens come with P2). */
export const INVITE_FIXTURE_TOKEN = "abc123";

/** Number of the chapter a new tarot reading would open ("2장" after the prologue and 1장). */
export function nextChapterNumber(chapters: ReadonlyArray<Pick<StoryChapter, "kind">>): number {
  return chapters.filter((chapter) => chapter.kind === "tarot").length + 1;
}

/** The signed-in fixture user. */
export const ME_FIXTURE = { nickname: "별지기", provider: "카카오" } as const;

/**
 * What a friend opening 하늘's invite sees. The friend always turns over the sun here, the same
 * card the story's pending friend scene shows (P2 stores the real draw).
 */
export const INVITE_FIXTURE = {
  token: INVITE_FIXTURE_TOKEN,
  inviter: "하늘",
  card: { cardId: "major-19-sun", orientation: "upright" as Orientation, name: "태양", number: "XIX" },
  result:
    "오늘은 숨기지 않아도 되는 날이에요. 태양 카드에는 흰 말을 탄 아이가 커다란 해 아래에서 한 팔을 활짝 벌리고 있어요. 미뤄 둔 말이나 보여 주고 싶던 것이 있다면, 오늘 한 가지만 가볍게 꺼내 보세요.",
};
