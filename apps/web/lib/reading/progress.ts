import { withParticle } from "@/lib/korean";
import { PREMIUM, PREMIUM_IDS, type PremiumId } from "@/lib/premium/products";
import type { Progress } from "./api";

/**
 * Waiting-screen captions for a generation, driven by the stream's `section` events (one per
 * top-level key of the reading as the model starts writing it; arrays per element). Progress never
 * moves backwards: a quality retry re-sends sections from the start.
 */

export type GenerationKind = "tarot-teaser" | "tarot-reading" | "saju-teaser" | "saju-reading" | "daily";

interface Stage {
  key: string;
  /** Element index for array keys (cards, sections); 0 otherwise. */
  index: number;
  caption: string;
  /** The full readings' checklist step this stage belongs to (neighbouring stages share one). */
  group?: string;
}

export interface ProgressPlan {
  opening: string;
  stages: Stage[];
}

export interface ProgressState {
  caption: string;
  /** 0..1, for the progress bar. */
  fraction: number;
  /** Stage index reached so far (-1 before the first section). */
  reached: number;
}

export const RETRY_CAPTION = "조금 더 다듬고 있어요";

const one = (key: string, caption: string, group?: string): Stage => ({ key, index: 0, caption, group });

/** "타고난 바탕 · 태어난 계절…" → "타고난 바탕" */
const shortName = (heading: string) => heading.split(" · ")[0] ?? heading;
/** "타고난 바탕 · 태어난 계절…" → "타고난 바탕을 적고 있어요" */
const sectionCaption = (heading: string) => `${withParticle(shortName(heading), "을/를")} 적고 있어요`;

export function progressPlan(kind: GenerationKind, opts: { positions?: readonly string[]; sections?: readonly string[] } = {}): ProgressPlan {
  const cards = (opts.positions ?? []).map((position, index) => ({ key: "cards", index, caption: `${position} 카드를 읽고 있어요` }));
  switch (kind) {
    case "tarot-teaser":
      return { opening: "카드를 읽고 있어요", stages: [...cards, one("firstCard", "첫 장을 풀어 적고 있어요"), one("secondCard", "둘째 장을 풀어 적고 있어요")] };
    case "tarot-reading": {
      // The checklist: each card by its position (the one-line verdict goes with the first), then four steps.
      const cardSteps = cards.map((card, index) => ({ ...card, group: `${opts.positions?.[index]} 카드` }));
      return {
        opening: "카드를 다시 읽고 있어요",
        stages: [
          one("verdict", "한 줄 결론을 적고 있어요", cardSteps[0]?.group),
          ...cardSteps,
          one("connection", "세 장의 연결을 살피고 있어요", "세 장의 연결과 시기"),
          one("timing", "시기를 살피고 있어요", "세 장의 연결과 시기"),
          one("scenarios", "흘러갈 갈래를 적고 있어요", "흘러갈 갈래"),
          one("messages", "건넬 말을 고르고 있어요", "건넬 말과 피할 것"),
          one("avoid", "피할 것을 적고 있어요", "건넬 말과 피할 것"),
          one("alternatives", "다른 길을 살피고 있어요", "건넬 말과 피할 것"),
          one("action", "오늘 해 볼 일을 적고 있어요", "오늘 해 볼 일"),
          one("observation", "확인해 볼 신호를 고르고 있어요", "오늘 해 볼 일"),
          one("followUps", "마무리하고 있어요", "오늘 해 볼 일"),
        ],
      };
    }
    case "saju-teaser":
      return { opening: "명식을 다시 살피고 있어요", stages: [one("title", "명식에 이름을 붙이고 있어요"), one("summary", "첫 장을 적고 있어요")] };
    case "saju-reading":
      return {
        opening: "명식을 다시 살피고 있어요",
        stages: [
          ...(opts.sections ?? []).map((heading, index) => ({ key: "sections", index, caption: sectionCaption(heading), group: shortName(heading) })),
          one("observation", "확인해 볼 신호를 고르고 있어요", "한눈에 보기"),
          // written after the body it sums up (SajuReadingSchema's order), shown on top of the reading
          one("glance", "한눈에 보기를 정리하고 있어요", "한눈에 보기"),
          one("followUps", "마무리하고 있어요", "한눈에 보기"),
        ],
      };
    case "daily":
      return {
        opening: "고른 카드를 펼치고 있어요",
        stages: [
          one("keyword", "오늘의 카드를 펼치고 있어요"),
          one("summary", "오늘의 한마디를 적고 있어요"),
          one("body", "하루의 결을 적고 있어요"),
          one("areas", "애정·금전·일을 살피고 있어요"),
          one("color", "행운의 색을 고르고 있어요"),
          one("tip", "마무리하고 있어요"),
        ],
      };
  }
}

/**
 * A premium reading's plans, one per part (P5 spec §6.1: one request writes one part), keyed by the
 * part draft's top-level fields as the stream names them. Positions are the 10-card spread's; the
 * 궁합's year ahead is four bands; the new year's months default to 1월~12월.
 */
export function premiumProgressPlans(id: PremiumId, opts: { positions?: readonly string[]; months?: readonly string[] } = {}): ProgressPlan[] {
  const card = (key: string) => (position: string, index: number): Stage => ({ key, index, caption: `${position} 카드를 읽고 있어요` });
  const month = (key: string) => (label: string, index: number): Stage => ({ key, index, caption: `${withParticle(label, "을/를")} 적고 있어요` });
  const months = opts.months ?? Array.from({ length: 12 }, (_, i) => `${i + 1}월`);
  const positions = opts.positions ?? [];
  switch (id) {
    case "tarot-deep":
      return [
        { opening: "카드 열 장을 펼쳐 보고 있어요", stages: [one("verdict", "한 줄 결론을 적고 있어요"), ...positions.map(card("positions"))] },
        {
          opening: "자리 사이를 이어 읽고 있어요",
          stages: [
            one("crossing", "지금의 나와 가로막는 것을 엮고 있어요"), one("axes", "두 갈래를 이어 읽고 있어요"), one("staff", "기둥을 쌓아 읽고 있어요"),
            one("timing", "시기를 살피고 있어요"), one("action", "오늘 해 볼 일을 적고 있어요"), one("observation", "확인해 볼 신호를 고르고 있어요"),
            one("followUps", "마무리하고 있어요"),
          ],
        },
      ];
    case "match":
      return [
        {
          opening: "두 사람의 명식을 나란히 놓고 있어요",
          stages: [one("dayMasters", "두 사람의 일간을 읽고 있어요"), one("elements", "오행을 견주고 있어요"), one("pillars", "기둥 사이를 살피고 있어요"), one("luck", "두 사람의 10년을 겹쳐 보고 있어요")],
        },
        {
          opening: "두 사람의 앞으로 1년을 살피고 있어요",
          stages: [
            one("verdict", "한 줄로 정리하고 있어요"),
            ...["첫", "두 번째", "세 번째", "마지막"].map((nth, index): Stage => ({ key: "periods", index, caption: `${nth} 석 달을 적고 있어요` })),
            one("together", "서로에게 맞는 말과 행동을 고르고 있어요"), one("avoid", "피하면 좋은 말과 행동을 고르고 있어요"),
            one("action", "오늘 해 볼 일을 적고 있어요"), one("observation", "확인해 볼 신호를 고르고 있어요"), one("followUps", "마무리하고 있어요"),
          ],
        },
      ];
    case "newyear-2027":
      return [
        {
          opening: "2027년의 흐름을 살피고 있어요",
          stages: [one("title", "한 해에 이름을 붙이고 있어요"), one("overview", "한 해의 큰 흐름을 적고 있어요"), one("luck", "대운을 살피고 있어요"), one("areas", "영역별로 나눠 보고 있어요"), one("lucky", "가벼운 행운을 고르고 있어요")],
        },
        { opening: "1월부터 6월까지 적고 있어요", stages: months.slice(0, 6).map(month("firstHalf")) },
        {
          opening: "7월부터 12월까지 적고 있어요",
          stages: [...months.slice(6).map(month("secondHalf")), one("closing", "한 해를 정리하고 있어요"), one("observation", "첫 달의 신호를 고르고 있어요"), one("followUps", "마무리하고 있어요")],
        },
      ];
  }
}

/** A premium free preview's captions (one short call, like the standard teasers), keyed by its draft's fields. */
export function premiumTeaserPlan(id: PremiumId): ProgressPlan {
  switch (id) {
    case "tarot-deep":
      return { opening: "카드 열 장을 읽고 있어요", stages: [one("now", "지금의 나를 적고 있어요")] };
    case "match":
      return { opening: "두 사람의 명식을 나란히 놓고 있어요", stages: [one("summary", "두 사람 사이를 한눈에 적고 있어요")] };
    case "newyear-2027":
      return { opening: "2027년의 흐름을 살피고 있어요", stages: [one("title", "한 해에 이름을 붙이고 있어요"), one("summary", "2027년을 미리 적고 있어요")] };
  }
}

/** The whole reading's bar: the parts written plus the share of the one being written. */
export const premiumFraction = (part: number, of: number, state: ProgressState): number => Math.min(1, (part + state.fraction) / of);

/** The parts as the waiting screen's steps ("지금 적는 중 · 1월~6월 · 2 / 3"). */
export function premiumSteps(id: PremiumId, part: number): ChecklistStep[] {
  return PREMIUM[id].parts.map((label, i) => ({ label, state: i < part ? "done" : i === part ? "now" : "later" }));
}

export const startProgress = (plan: ProgressPlan): ProgressState => ({ caption: plan.opening, fraction: 0, reached: -1 });

export function advanceProgress(state: ProgressState, event: Progress, plan: ProgressPlan): ProgressState {
  if (event.type === "retry") return { ...state, caption: RETRY_CAPTION };
  const at = plan.stages.findIndex((stage) => stage.key === event.key && stage.index === event.index);
  // An unknown key (a field this screen does not name) or a repeat after a retry keeps the place.
  if (at < 0 || at < state.reached) return state;
  const total = plan.stages.length;
  return { caption: plan.stages[at]!.caption, fraction: Math.min(1, (at + 1) / (total + 1)), reached: at };
}

export interface ChecklistStep {
  label: string;
  /** done: written; now: being written (or next, while the model thinks); later: not yet. */
  state: "done" | "now" | "later";
}

/** A full reading's steps (its stages' groups, in order) against the stage reached; teasers and 오늘의 한 장 have none. */
export function checklist(plan: ProgressPlan, reached: number): ChecklistStep[] {
  const steps: { label: string; first: number; last: number }[] = [];
  plan.stages.forEach((stage, at) => {
    if (!stage.group) return;
    const last = steps[steps.length - 1];
    if (last?.label === stage.group) last.last = at;
    else steps.push({ label: stage.group, first: at, last: at });
  });
  const at = Math.max(0, reached);
  return steps.map(({ label, first, last }) => ({ label, state: last < at ? "done" : first <= at ? "now" : "later" }));
}

/**
 * How long each kind usually takes (measured 2026-10: saju full 63–66 s since its body is written in two halves at once
 * (owner 2026-10-16; 110–150 s before), tarot full 45–65 s, teasers 8–15 s,
 * 오늘의 한 장 ~11 s) and the longest it is said to take once it runs past that.
 */
/**
 * A waiting screen's clock: the generation kinds, a 운 reading, still written in one call (~95–130 s, review M2),
 * and a whole premium reading (all its parts, one request each: the product's usual minutes, at most twice that).
 */
export type WaitKind = GenerationKind | "saju-topic-reading" | `premium-${PremiumId}`;

type Wait = { usualMs: number; longestMs: number; usual: string; longest: string };

const PREMIUM_WAIT = Object.fromEntries(
  PREMIUM_IDS.map((id) => {
    const minutes = PREMIUM[id].approxMinutes;
    return [`premium-${id}`, { usualMs: minutes * 60_000, longestMs: minutes * 120_000, usual: `보통 ${minutes}분 안팎`, longest: `${minutes * 2}분` }];
  }),
) as Record<`premium-${PremiumId}`, Wait>;

const WAIT: Record<WaitKind, Wait> = {
  ...PREMIUM_WAIT,
  "saju-reading": { usualMs: 75_000, longestMs: 180_000, usual: "보통 1분 안팎", longest: "3분" },
  "saju-topic-reading": { usualMs: 140_000, longestMs: 180_000, usual: "보통 2분 안팎", longest: "3분" },
  "tarot-reading": { usualMs: 65_000, longestMs: 120_000, usual: "보통 1분 안팎", longest: "2분" },
  "saju-teaser": { usualMs: 15_000, longestMs: 30_000, usual: "보통 10초 안팎", longest: "30초" },
  "tarot-teaser": { usualMs: 15_000, longestMs: 30_000, usual: "보통 10초 안팎", longest: "30초" },
  daily: { usualMs: 15_000, longestMs: 30_000, usual: "보통 10초 안팎", longest: "30초" },
};

/** The time-based bar never passes this; the last stretch is the stream's (or the answer's) alone. */
const TIME_CAP = 0.95;

/**
 * The bar's share from the time alone: rises smoothly from 0, reaches 0.9 at the kind's usual length and
 * creeps on toward TIME_CAP, never to 1. The screen shows the larger of this and the stream's fraction.
 */
export function timeFraction(kind: WaitKind, elapsedMs: number): number {
  // 1 - e^(-k) = 0.9 / TIME_CAP at the usual length
  const k = Math.log(TIME_CAP / (TIME_CAP - 0.9));
  return TIME_CAP * (1 - Math.exp((-k * Math.max(0, elapsedMs)) / WAIT[kind].usualMs));
}

/** "38초째 · 보통 2분 안팎"; past the usual length, calmly that it takes a bit longer. */
export function waitLine(kind: WaitKind, elapsedMs: number): string {
  const wait = WAIT[kind];
  const note =
    elapsedMs < wait.usualMs ? wait.usual : elapsedMs < wait.longestMs ? `조금 더 걸리고 있어요. 길게는 ${wait.longest}까지 걸려요` : "조금 더 걸리고 있어요";
  const seconds = Math.floor(elapsedMs / 1000);
  if (seconds < 1) return note;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  const elapsed = minutes === 0 ? `${rest}초째` : rest === 0 ? `${minutes}분째` : `${minutes}분 ${rest}초째`;
  return `${elapsed} · ${note}`;
}
