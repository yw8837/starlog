"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  DEFAULT_REVERSAL_RATE,
  TEMPLATES,
  TOPICS_BY_WHO,
  composeQuestion,
  createDeck,
  getCard,
  pickCards,
  type DeckState,
  type DrawnCard,
} from "@starlog/core";
import { Cat } from "@/components/characters/Cat";
import { CardFan } from "@/components/tarot/CardFan";
import { ShuffleStage } from "@/components/tarot/ShuffleStage";
import { SpreadRow, type SpreadCard } from "@/components/tarot/SpreadRow";
import { Stepper } from "@/components/tarot/Stepper";
import { Button } from "@/components/ui/Button";
import { summarizeFlow, useFlowState, withFlags, type FlowFallback } from "@/lib/flowState";
import { prefersReducedMotion } from "@/lib/motion";
import f from "../flow.module.css";
import s from "./DrawStage.module.css";

type Phase = "shuffle" | "pick" | "reveal" | "done";

type DrawStageProps = {
  /** Skip the shuffle and every reveal delay (tests). */
  instant: boolean;
  /** 오늘의 한 장: one card, no result page yet. */
  daily: boolean;
  fallback: FlowFallback;
};

const FLIP_GAP_MS = 400;
const FLIP_MS = 600;
const HOLD_MS = 900;

function randomSeed(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function cardNumber(cardId: string): string | undefined {
  const card = getCard(cardId);
  return card.arcana === "major" ? card.roman : undefined;
}

/** Step 2: the cat shuffles, a fan opens, the user picks the spread's cards, then they turn over. */
export function DrawStage({ instant, daily, fallback }: DrawStageProps) {
  const router = useRouter();
  const { flow } = useFlowState();
  const summary = summarizeFlow(flow, fallback);
  const dailyTopic = TOPICS_BY_WHO.me.find((topic) => topic.id === "daily");
  const template = TEMPLATES[daily ? "daily" : summary.template];
  const question = daily && dailyTopic ? composeQuestion("me", dailyTopic, "today") : summary.question;
  const max = template.positions.length;

  const [deck, setDeck] = useState<DeckState | null>(null);
  const [phase, setPhase] = useState<Phase>(instant ? "pick" : "shuffle");
  const [picked, setPicked] = useState<number[]>([]);
  const [drawn, setDrawn] = useState<DrawnCard[] | null>(null);
  const [revealed, setRevealed] = useState(0);

  // A fresh random deck per visit, made in the browser only.
  useEffect(() => {
    setDeck(createDeck(randomSeed(), DEFAULT_REVERSAL_RATE));
  }, []);

  // Turn the cards over one by one, then move on to the result.
  useEffect(() => {
    if (phase !== "reveal" || !drawn) return;
    const quick = instant || prefersReducedMotion();
    const gap = quick ? 0 : FLIP_GAP_MS;
    const timers = drawn.map((_, i) => window.setTimeout(() => setRevealed(i + 1), gap * i));
    const settle = quick ? (instant ? 0 : HOLD_MS) : gap * (drawn.length - 1) + FLIP_MS + HOLD_MS;
    timers.push(
      window.setTimeout(() => {
        if (daily) setPhase("done");
        else router.push(withFlags("/tarot/result", { instant }));
      }, settle),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [phase, drawn, instant, daily, router]);

  const togglePick = (index: number) => {
    if (phase !== "pick") return;
    setPicked((prev) => (prev.includes(index) ? prev.filter((i) => i !== index) : prev.length < max ? [...prev, index] : prev));
  };

  const reveal = () => {
    if (!deck || picked.length !== max) return;
    setDrawn(pickCards(deck, template, picked));
    setPhase("reveal");
  };

  const slots: SpreadCard[] = template.positions.map((position, slot) => {
    const deckIndex = picked[slot];
    const card = drawn?.[slot] ?? (deck && deckIndex !== undefined ? { cardId: deck.order[deckIndex], orientation: deck.orientations[deckIndex] } : undefined);
    const faceUp = slot < revealed;
    return {
      position,
      cardId: card?.cardId,
      orientation: card?.orientation,
      faceUp,
      name: faceUp && card?.cardId ? getCard(card.cardId).names.ko : undefined,
      number: faceUp && card?.cardId ? cardNumber(card.cardId) : undefined,
    };
  });

  const remaining = max - picked.length;
  const status =
    phase === "shuffle"
      ? ""
      : phase === "pick"
        ? remaining > 0
          ? `마음이 가는 카드를 ${remaining}장 더 골라 주세요`
          : "모두 골랐어요"
        : "카드를 뒤집었어요";

  return (
    <div className={f.screen}>
      {daily ? (
        <Stepper label="오늘의 한 장" backHref="/" backLabel="홈으로" />
      ) : (
        <Stepper step={2} label="카드 뽑기" backHref="/tarot/new/situation" backLabel="상황 고르기로" />
      )}

      <div className={s.head}>
        <h1 className={s.question}>{question}</h1>
        <p className={s.status} role="status">
          {status}
        </p>
      </div>

      <SpreadRow cards={slots} size="md" className={max === 1 ? s.single : s.slots} />

      <div className={s.stage}>
        {phase === "shuffle" ? (
          <ShuffleStage onDone={() => setPhase("pick")} />
        ) : phase === "pick" && deck ? (
          <CardFan picked={picked} max={max} onPick={togglePick} />
        ) : phase === "reveal" || phase === "done" ? (
          <div className={s.reader}>
            <Cat outfit="tarot" action="glow" expression={phase === "done" ? "happy" : "focus"} size={150} reactOnTap={false} />
          </div>
        ) : null}
      </div>

      <div className={s.cta}>
        {phase === "pick" && picked.length === max ? (
          <Button block onClick={reveal} trailing="→">
            {daily ? "카드 뒤집기" : "결과 보기"}
          </Button>
        ) : null}
        {phase === "done" ? (
          <Button href="/" variant="secondary" block>
            홈으로
          </Button>
        ) : null}
      </div>
    </div>
  );
}
