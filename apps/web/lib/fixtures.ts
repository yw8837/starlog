import "server-only";
import { TEMPLATES, type Orientation, type TemplateId } from "@starlog/core";
import tarotJson from "@content/samples/tarot-contact.ko.json";

/**
 * Gold fixtures: the noindex demo reading (/chapter/sample), the invite preview and tests. Real
 * readings come from the API; no reading screen falls back to these.
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

/** Placeholder invite token for the share preview (real tokens come with P2). */
export const INVITE_FIXTURE_TOKEN = "abc123";

/**
 * The demo invite (QA-13): outside production, and on the e2e build of production, which runs the mock
 * model (STARLOG_AI=mock; scripts/ops/deploy.sh unsets it, so a real deploy never shows it).
 */
export const demoInviteOn = (env: NodeJS.ProcessEnv = process.env) => env.NODE_ENV !== "production" || env.STARLOG_AI === "mock";

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
