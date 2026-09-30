"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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

/** "한 장" for one card, "3장" otherwise (the flow's other screens count cards with digits). */
const cards = (n: number) => (n === 1 ? "한 장" : `${n}장`);

function cardNumber(cardId: string): string | undefined {
  const card = getCard(cardId);
  return card.arcana === "major" ? card.roman : undefined;
}

const UndoIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" focusable="false">
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </svg>
);

const ShuffleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" focusable="false">
    <path d="M3 7h3.5c2 0 3.2 1 4.3 2.6l2.4 3.8C14.3 15 15.5 16 17.5 16H21" />
    <path d="M3 16h3.5c1.3 0 2.3-.5 3.1-1.3" />
    <path d="M13.4 8.3C14.2 7.5 15.2 7 16.5 7H21" />
    <path d="m18 4 3 3-3 3" />
    <path d="m18 13 3 3-3 3" />
  </svg>
);

/**
 * Step 2: the deck is shuffled and opens into a fan, the user picks the spread's cards, then they
 * turn over. While picking, 다시 섞기 shuffles a fresh deck.
 */
export function DrawStage({ instant, daily, fallback }: DrawStageProps) {
  const router = useRouter();
  const { flow } = useFlowState();
  const summary = summarizeFlow(flow, fallback);
  // The question and slot names come from the saved flow, which only the browser can read; hold
  // them until it has been read so the fixture question never flashes before the user's own.
  const known = daily || flow !== null;
  const dailyTopic = TOPICS_BY_WHO.me.find((topic) => topic.id === "daily");
  const template = TEMPLATES[daily ? "daily" : summary.template];
  const question = daily && dailyTopic ? composeQuestion("me", dailyTopic, "today") : summary.question;
  const max = template.positions.length;

  const [deck, setDeck] = useState<DeckState | null>(null);
  const [phase, setPhase] = useState<Phase>(instant ? "pick" : "shuffle");
  const [picked, setPicked] = useState<number[]>([]);
  const [drawn, setDrawn] = useState<DrawnCard[] | null>(null);
  const [revealed, setRevealed] = useState(0);
  // How many times the user reshuffled. Focus follows the shuffle (바로 펼치기) and comes back to
  // 다시 섞기 after it; the status line says the deck was reshuffled.
  const [reshuffles, setReshuffles] = useState(0);
  const reshuffled = reshuffles > 0;
  // A reshuffled deck nobody has picked from yet: until the first pick or undo, the status says so.
  const [freshDeck, setFreshDeck] = useState(false);
  const reshuffleRef = useRef<HTMLDivElement>(null);

  // A fresh random deck per visit, made in the browser only.
  useEffect(() => {
    setDeck(createDeck(randomSeed(), DEFAULT_REVERSAL_RATE));
  }, []);

  // Only when focus was lost with the shuffle's own button; never pulled away from anywhere else.
  useEffect(() => {
    const lost = !document.activeElement || document.activeElement === document.body;
    if (phase === "pick" && reshuffled && lost) reshuffleRef.current?.querySelector("button")?.focus();
  }, [phase, reshuffled]);

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

  // The fan only ever adds a card; taking one back is the explicit undo below, so a stray tap
  // on a lifted card can never drop a pick.
  const pick = (index: number) => {
    if (phase !== "pick") return;
    setFreshDeck(false);
    setPicked((prev) => (prev.includes(index) || prev.length >= max ? prev : [...prev, index]));
  };

  const undo = () => {
    if (phase !== "pick") return;
    setFreshDeck(false);
    setPicked((prev) => prev.slice(0, -1));
  };

  // A new random deck (order and orientations), no picks, and the shuffle plays again (its gentle
  // version under reduced motion; tests' instant mode reshuffles in place).
  const reshuffle = () => {
    if (phase !== "pick") return;
    setDeck(createDeck(randomSeed(), DEFAULT_REVERSAL_RATE));
    setPicked([]);
    setReshuffles((n) => n + 1);
    setFreshDeck(true);
    if (!instant) setPhase("shuffle");
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
  const allRevealed = drawn !== null && revealed >= drawn.length;
  const status =
    phase === "shuffle" || !known
      ? ""
      : phase === "pick"
        ? picked.length === 0
          ? // Short enough to stay on one line at 360px, so the fan never moves when picking starts.
            freshDeck
            ? `카드를 다시 섞었어요. ${cards(max)} 골라 주세요`
            : `마음이 가는 카드를 ${cards(max)} 골라 주세요`
          : remaining > 0
            ? `마음이 가는 카드를 ${cards(remaining)} 더 골라 주세요`
            : "모두 골랐어요"
        : allRevealed
          ? "카드를 모두 뒤집었어요"
          : "카드를 뒤집는 중이에요";

  return (
    <div className={f.screen}>
      {daily ? (
        <Stepper label="오늘의 한 장" backHref="/" backLabel="홈으로" />
      ) : (
        <Stepper step={2} label="카드 뽑기" backHref="/tarot/new/situation" backLabel="상황 고르기로" />
      )}

      <div className={s.head}>
        <h1 className={s.question}>{known ? question : " "}</h1>
        <p className={s.status} role="status">
          {/* A fresh node per reshuffle, so the same words are announced again each time. */}
          <span key={reshuffles}>{status}</span>
        </p>
      </div>

      {known ? (
        // A soft glow comes up behind the slots while the cards turn over.
        <div className={s.spread} data-glow={phase === "reveal" || phase === "done" ? "" : undefined}>
          <SpreadRow cards={slots} size="md" className={max === 1 ? s.single : s.slots} />
        </div>
      ) : null}

      <div className={s.stage}>
        {phase === "shuffle" ? (
          // Wrapped like the fan below, so the deck sits exactly where the fan's middle card lands.
          <div className={s.arc}>
            <ShuffleStage onDone={() => setPhase("pick")} focusSkip={reshuffled} />
          </div>
        ) : phase === "pick" && deck && known ? (
          <div className={s.arc}>
            {/* Keyed by the deck, so a reshuffled deck deals out afresh. */}
            <CardFan key={deck.seed} picked={picked} max={max} onPick={pick} />
            {/* After the fan in the tab order; drawn over the fan's hollow. */}
            <div ref={reshuffleRef} className={s.reshuffle}>
              <Button variant="secondary" size="md" onClick={reshuffle} trailing={<ShuffleIcon />}>
                다시 섞기
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <div className={s.cta} data-phase={phase}>
        {phase === "pick" && picked.length === max ? (
          <Button block onClick={reveal} trailing="→">
            {daily ? "카드 뒤집기" : "결과 보기"}
          </Button>
        ) : null}
        {phase === "pick" ? (
          // Keeps its room while hidden, so the fan never moves under a finger on the first pick.
          <div className={s.undo} data-hidden={picked.length === 0 ? "" : undefined}>
            <Button variant="ghost" size="md" block onClick={undo} trailing={<UndoIcon />}>
              {max === 1 ? "다시 고르기" : "방금 고른 카드 빼기"}
            </Button>
          </div>
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
