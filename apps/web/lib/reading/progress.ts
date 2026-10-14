import { withParticle } from "@/lib/korean";
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

const one = (key: string, caption: string): Stage => ({ key, index: 0, caption });

/** "타고난 바탕 · 태어난 계절…" → "타고난 바탕을 적고 있어요" */
const sectionCaption = (heading: string) => `${withParticle(heading.split(" · ")[0] ?? heading, "을/를")} 적고 있어요`;

export function progressPlan(kind: GenerationKind, opts: { positions?: readonly string[]; sections?: readonly string[] } = {}): ProgressPlan {
  const cards = (opts.positions ?? []).map((position, index) => ({ key: "cards", index, caption: `${position} 카드를 읽고 있어요` }));
  switch (kind) {
    case "tarot-teaser":
      return { opening: "카드를 읽고 있어요", stages: [...cards, one("firstCard", "첫 장을 풀어 적고 있어요")] };
    case "tarot-reading":
      return {
        opening: "카드를 다시 읽고 있어요",
        stages: [
          one("verdict", "한 줄 결론을 적고 있어요"),
          ...cards,
          one("connection", "세 장의 연결을 살피고 있어요"),
          one("timing", "시기를 살피고 있어요"),
          one("scenarios", "흘러갈 갈래를 적고 있어요"),
          one("messages", "건넬 말을 고르고 있어요"),
          one("avoid", "피할 것을 적고 있어요"),
          one("alternatives", "다른 길을 살피고 있어요"),
          one("action", "오늘 해 볼 일을 적고 있어요"),
          one("observation", "확인해 볼 신호를 고르고 있어요"),
          one("followUps", "마무리하고 있어요"),
        ],
      };
    case "saju-teaser":
      return { opening: "명식을 다시 살피고 있어요", stages: [one("title", "명식에 이름을 붙이고 있어요"), one("summary", "첫 장을 적고 있어요")] };
    case "saju-reading":
      return {
        opening: "명식을 다시 살피고 있어요",
        stages: [
          ...(opts.sections ?? []).map((heading, index) => ({ key: "sections", index, caption: sectionCaption(heading) })),
          one("observation", "확인해 볼 신호를 고르고 있어요"),
          // written after the body it sums up (SajuReadingSchema's order), shown on top of the reading
          one("glance", "한눈에 보기를 정리하고 있어요"),
          one("followUps", "마무리하고 있어요"),
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

export const startProgress = (plan: ProgressPlan): ProgressState => ({ caption: plan.opening, fraction: 0, reached: -1 });

export function advanceProgress(state: ProgressState, event: Progress, plan: ProgressPlan): ProgressState {
  if (event.type === "retry") return { ...state, caption: RETRY_CAPTION };
  const at = plan.stages.findIndex((stage) => stage.key === event.key && stage.index === event.index);
  // An unknown key (a field this screen does not name) or a repeat after a retry keeps the place.
  if (at < 0 || at < state.reached) return state;
  const total = plan.stages.length;
  return { caption: plan.stages[at]!.caption, fraction: Math.min(1, (at + 1) / (total + 1)), reached: at };
}
