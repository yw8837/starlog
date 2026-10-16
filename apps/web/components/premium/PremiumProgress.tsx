"use client";

import { GeneratingState } from "@/components/tarot/GeneratingState";
import { PREMIUM, type PremiumId } from "@/lib/premium/products";
import { premiumFraction, premiumSteps, type ProgressState } from "@/lib/reading/progress";
import { TAROT_TIP_CARDS, sajuTipCards, type TipCard } from "@/lib/reading/waitingTips";
import s from "./premium.module.css";

type PremiumProgressProps = {
  id: PremiumId;
  /** Parts written so far (the index of the part being written). */
  part: number;
  /** The part's own progress (its plan from premiumProgressPlans, advanced by the stream). */
  state: ProgressState;
  /** 기다리는 동안 cards; default: tarot facts for the 10-card reading, saju ones (and tarot) for the others. */
  tips?: readonly TipCard[];
  /** The page keeps its own live region: the caption stays plain text. */
  live?: boolean;
};

const DEFAULT_TIPS: Record<PremiumId, () => readonly TipCard[]> = {
  "tarot-deep": () => TAROT_TIP_CARDS,
  match: () => [...sajuTipCards(undefined), ...TAROT_TIP_CARDS],
  "newyear-2027": () => sajuTipCards(undefined),
};

/**
 * The long wait of a premium reading (several minutes, one request per part), on the standard waiting
 * screen: the part being written on the first card ("지금 적는 중 · 1월~6월 · 2 / 3") and in the caption
 * ("2/3 · 4월을 적고 있어요"), the whole reading's clock and bar, and what closing the screen does (the
 * refund rules: up to three openings again; P4 MAX_RESTORES).
 */
export function PremiumProgress({ id, part, state, tips, live = true }: PremiumProgressProps) {
  const of = PREMIUM[id].parts.length;
  const at = Math.min(part, of - 1);
  return (
    <div className={s.progress}>
      <GeneratingState
        mode={id === "tarot-deep" ? "tarot" : "saju"}
        kind={`premium-${id}`}
        caption={`${at + 1}/${of} · ${state.caption}`}
        fraction={premiumFraction(part, of, state)}
        steps={premiumSteps(id, at)}
        tips={tips ?? DEFAULT_TIPS[id]()}
        live={live}
      />
      <p className={s.progressNote}>다 받기 전에 화면을 닫거나 연결이 끊겨도 3번까지 다시 열어 받을 수 있어요.</p>
    </div>
  );
}
