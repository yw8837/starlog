import { TEMPLATES, type Orientation, type TemplateId } from "@starlog/core";
import sajuJson from "@content/samples/saju-prologue.ko.json";
import tarotJson from "@content/samples/tarot-contact.ko.json";

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
      title: SAJU_SAMPLE.story.title,
      href: "/chapter/prologue",
      cards: [],
    },
    {
      id: "sample",
      kind: "tarot",
      label: "1장",
      title: TAROT_SAMPLE.story.title,
      href: "/chapter/sample",
      cards: TAROT_SAMPLE.cards.map(({ cardId, orientation, name }) => ({ cardId, orientation, name })),
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

/** The one follow-up answer P1 can give (P3 generates real ones). */
export const FOLLOW_UP_ANSWER =
  "가벼운 안부로 정했으니 첫 문장은 한 줄이면 충분해요. 두 번째 예시처럼 내 요즘 이야기를 조금 먼저 꺼내고, 질문은 하나만 붙여 보세요. 저녁에 다시 읽었을 때 반가운 마음이 먼저 들면 그대로 보내고, 숙제처럼 느껴지면 이번 주 안에 한 번 더 읽고 정해도 늦지 않아요.";

/** Placeholder invite token for the share preview (real tokens come with P2). */
export const INVITE_FIXTURE_TOKEN = "abc123";
