import { SITE, sajuTopicsMode, type SajuTopicsMode } from "@/lib/config";
import type { Locale } from "@/lib/i18n/locales";
import type { SajuSituationId, SajuTopic, SajuTopicId } from "@/lib/reading/types";
import { SAJU_GLANCE_HEADING } from "@/lib/sajuPrologue";

/**
 * 주제별 사주 (docs/superpowers/specs/2026-10-02-starlog-saju-topics-design.md §6.1, §6.2, §13, with §0's
 * owner cut): the topics, the code-owned section headings, who sees the topics and the chart page's
 * fixed lines. Client-safe: the chart page and the server both read it. Ids go into storage, requests,
 * chapter tokens and the chart page's `?topic=`; names and labels only into prompts and screens.
 *
 * Two names per topic on purpose: `name` is what the prompts, the validator and the mocks call it (their
 * text is prototype-verified and hash-pinned); `label` is what a screen shows. They differ for 직업운
 * (the owner's button says 직장운) and 전체 흐름 (the screens call it 사주팔자). A screen never calls
 * `topicName`; `lib/ai/**` never calls `topicLabel`.
 */

export interface TopicInfo {
  id: SajuTopic;
  /** The engine's name: "직업운". Never shown on a screen. */
  name: string;
  /** The screens' name: "직장운", "사주팔자". */
  label: string;
}

export const SAJU_TOPICS: readonly TopicInfo[] = Object.freeze([
  { id: "overall", name: "전체 흐름", label: "사주팔자" },
  { id: "love", name: "연애운", label: "연애운" },
  { id: "reunion", name: "재회운", label: "재회운" },
  { id: "money", name: "재물운", label: "재물운" },
  { id: "career", name: "직업운", label: "직장운" },
]);

/** The four topics that are not 전체 흐름, in button order. */
export const SAJU_TOPIC_IDS: readonly SajuTopicId[] = Object.freeze(["love", "reunion", "money", "career"]);

export const isSajuTopic = (value: unknown): value is SajuTopic => SAJU_TOPICS.some((topic) => topic.id === value);
export const isSajuTopicId = (value: unknown): value is SajuTopicId => SAJU_TOPIC_IDS.includes(value as SajuTopicId);
export const topicInfo = (topic: SajuTopic): TopicInfo => SAJU_TOPICS.find((t) => t.id === topic)!;
/** The engine's name (prompts, validator, mocks). */
export const topicName = (topic: SajuTopic): string => topicInfo(topic).name;
/** The screens' name (buttons, eyebrows, record titles, the unlock sheet). */
export const topicLabel = (topic: SajuTopic): string => topicInfo(topic).label;

export interface SituationChip {
  id: SajuSituationId;
  label: string;
}

/**
 * The owner's situation chip wording (spec §3 decision 5), verbatim. Engine only (owner cut §0): the
 * optional `situation` of `buildTopicFactSet`, the prompt's 상황별 각도 and the validator's cross-topic
 * check read it. No screen shows a chip and no request, token or record carries one.
 */
export const SITUATIONS: Readonly<Record<SajuTopicId, readonly SituationChip[]>> = Object.freeze({
  love: [
    { id: "long-single", label: "혼자인 지 오래됐어요" },
    { id: "some", label: "썸이 애매해요" },
    { id: "cooling", label: "연애 중인데 마음이 식은 것 같아요" },
    { id: "marriage", label: "결혼을 생각 중이에요" },
  ],
  reunion: [
    { id: "missing", label: "헤어진 사람이 자꾸 생각나요" },
    { id: "no-contact", label: "연락이 끊겼어요" },
    { id: "torn", label: "다시 만나도 될까 고민돼요" },
    { id: "fresh-breakup", label: "이별 직후라 마음 정리가 안 돼요" },
  ],
  money: [
    { id: "leaking", label: "돈이 안 모이고 자꾸 새요" },
    { id: "worry", label: "돈 걱정이 언제 풀릴지 궁금해요" },
    { id: "side-income", label: "월급 말고 수입을 늘리고 싶어요" },
  ],
  career: [
    { id: "job-hunt", label: "취업이 잘 안 풀려요" },
    { id: "move", label: "이직·퇴사를 고민 중이에요" },
    { id: "people", label: "회사 사람 때문에 힘들어요" },
    { id: "exam", label: "시험·자격증 준비 중이에요" },
  ],
});

/** `topic`'s chip with this id; undefined for an unknown id or another topic's chip. */
export const situationOf = (topic: SajuTopicId, id: unknown): SituationChip | undefined => SITUATIONS[topic].find((chip) => chip.id === id);

/** Every chip label of the other three topics (a reading must never quote them, spec §8.2). */
export const otherTopicLabels = (topic: SajuTopicId): string[] =>
  SAJU_TOPIC_IDS.filter((other) => other !== topic).flatMap((other) => SITUATIONS[other].map((chip) => chip.label));

/** The paid part after the sections (the same heading as 전체 흐름's, lib/ai/prompts/saju.ts). */
export const TOPIC_OBSERVATION_HEADING = "앞으로 몇 주 · 확인해 볼 신호";

/**
 * Section headings per topic (spec §6.2): written over the model's, shown in the locked list and the waiting screen.
 * Plain words first (owner 2026-10-07): no 명리 term in a label or subtitle; the 한눈에 보기 card took that name from 1절.
 */
export const TOPIC_SECTIONS: Readonly<Record<SajuTopicId, readonly string[]>> = Object.freeze({
  love: [
    "나의 기본 결 · 타고난 바탕",
    "사랑할 때의 나 · 가장 가까운 자리와 마음",
    "끌리는 사람과 맞는 사람 · 관계의 결",
    "지금의 10년 · 인연의 흐름",
    "올해와 다가오는 해 · 만남과 관계의 결",
    "계산 기준 · 보지 않은 것과 달라질 수 있는 것",
  ],
  reunion: [
    "나의 기본 결 · 타고난 바탕",
    "이별을 겪는 나 · 마음이 머무는 자리",
    "다시 이어진다면 · 되풀이되기 쉬운 것",
    "지금의 10년 · 관계가 다시 움직이는 흐름",
    "올해와 다가오는 해 · 연락과 거리의 결",
    "계산 기준 · 보지 않은 것과 달라질 수 있는 것",
  ],
  money: [
    "나의 기본 결 · 타고난 바탕",
    "돈이 들어오는 길 · 다루는 힘과 만들어 내는 힘",
    "돈을 지키는 힘 · 어울려 나누는 힘과 받쳐 주는 힘",
    "지금의 10년 · 돈의 흐름",
    "올해와 다가오는 해 · 쓰기와 모으기의 결",
    "계산 기준 · 보지 않은 것과 달라질 수 있는 것",
  ],
  career: [
    "나의 기본 결 · 타고난 바탕",
    "일하는 방식 · 약속을 지키는 힘과 드러내는 힘",
    "잘 맞는 일의 결 · 태어난 달의 바탕과 자주 쓰는 힘",
    "지금의 10년 · 일의 흐름",
    "올해와 다가오는 해 · 움직일 때와 다질 때",
    "계산 기준 · 보지 않은 것과 달라질 수 있는 것",
  ],
});

/** The locked list on the chart page: the 한눈에 보기 card, six sections and the observation. */
export const topicLockedToc = (topic: SajuTopicId): string[] => [SAJU_GLANCE_HEADING, ...TOPIC_SECTIONS[topic], TOPIC_OBSERVATION_HEADING];

/**
 * Length targets per section (non-space characters, spec §6.2), in section order. 2~5절 at 350~480자 since the reading voice
 * (docs/research/reading-voice-2026-10.md §5, owner 2026-10-08), as real readings already wrote them (374~463자). 6절 at
 * 200~400자 since the body's disclaimers moved into it (review 2026-10-08): a 시 모름 + 경계 chart's limits alone run 409자.
 */
export const TOPIC_SECTION_LENGTH: ReadonlyArray<readonly [number, number]> = Object.freeze([
  [300, 400],
  [350, 480],
  [350, 480],
  [350, 480],
  [350, 480],
  [200, 400],
]);
/** The whole reading: the sections' targets added up, about. */
export const TOPIC_TOTAL_LENGTH = [1900, 2700] as const;

// ---- who sees the topics (spec §13, §2) ----

/** The row shows on Korean screens when the flag is on, or `owner` on the owner pass's device. */
export function sajuTopicsVisible({ mode = sajuTopicsMode(), owner, locale = "ko" }: { mode?: SajuTopicsMode; owner: boolean; locale?: Locale }): boolean {
  if (locale !== "ko") return false;
  return mode === "on" || (mode === "owner" && owner);
}

// ---- the chart page's fixed lines (owner cut §0 decision 2) ----

/** The row's heading under the 사주팔자 teaser. */
export const OTHER_TOPICS_LABEL = "다른 운도 볼 수 있어요";
/** The way back to the 사주팔자, shown only while a 운 is on screen. */
export const BACK_TO_OVERALL = "사주팔자로 돌아가기";
export const TOPIC_SWITCH_HELP = `새로 여는 맛보기는 하루 ${SITE.beta.teaserPerDay}번까지 볼 수 있어요. 이미 본 맛보기는 횟수를 쓰지 않아요.`;
export const TEASER_LIMIT_NOTICE = "오늘 맛보기를 모두 봤어요. 자정에 다시 열려요. 이미 본 맛보기는 계속 볼 수 있어요.";
export const UNLOCK_SCOPE_LINE = "결제 한 번에 고른 풀이 하나를 열어요";
