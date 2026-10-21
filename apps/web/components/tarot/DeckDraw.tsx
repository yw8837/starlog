"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_REVERSAL_RATE, TEMPLATES, createDeck, getCard, type DeckState } from "@starlog/core";
import { CardTable } from "@/components/tarot/CardTable";
import { ShuffleStage } from "@/components/tarot/ShuffleStage";
import { SpreadRow, type SpreadCard } from "@/components/tarot/SpreadRow";
import { Stepper } from "@/components/tarot/Stepper";
import { Button } from "@/components/ui/Button";
import { prefersReducedMotion } from "@/lib/motion";
import { postJson } from "@/lib/reading/api";
import { describeApiError, type ErrorView } from "@/lib/reading/errors";
import type { DrawResponse, DrawTemplateId, DrawnCardData } from "@/lib/reading/types";
import s from "./DeckDraw.module.css";

type Phase = "shuffle" | "pick" | "reveal";

export interface DealtDraw {
  templateId: DrawTemplateId;
  drawToken: string;
  cards: DrawnCardData[];
}

type DeckDrawProps = {
  /** Skip the shuffle and every reveal delay (tests). */
  instant: boolean;
  /** Any spread with a server deal: 1, 3, 5 or 10 positions (more than five lay out in two rows). */
  templateId: DrawTemplateId;
  /**
   * The line over the slots (the question, or "우리 사이 · 친구"). Null until the page has read it from
   * the browser: the deck already shuffles, the slots and the table wait.
   */
  heading: string | null;
  step: { step?: number; total?: number; label: string; backHref: string; backLabel?: string };
  /** The server dealt the cards for the picks: keep them (and their signed token) before they turn over. */
  onDealt: (draw: DealtDraw) => void;
  /** Every card is face up and the hold is over: move on. */
  onRevealed: () => void;
};

const FLIP_GAP_MS = 400;
const FLIP_MS = 600;
const HOLD_MS = 900;

function randomSeed(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

/** "한 장" for one card, "3장" otherwise (the flow's other screens count cards with digits). */
const cards = (n: number) => (n === 1 ? "한 장" : `${n}장`);

/** Slots per row: all in one row up to five, otherwise two rows (10 → 5+5, 7 → 4+3). */
export const slotColumns = (n: number) => (n > 5 ? Math.ceil(n / 2) : n);

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

/**
 * The draw: the deck is shuffled and spreads onto the table (all 78 cards), the user picks the spread's
 * cards, then they turn over. While picking, 다시 섞기 reshuffles the cards left and keeps the picks. The
 * table is only the visual: the server deals the cards for the picked positions (/api/tarot/draw), and
 * those are the cards turned over.
 * The page owns where the draw is kept and where it goes next (the standard tarot flow, the 10-card
 * reading). Renders the screen's children; the page gives the screen box.
 */
export function DeckDraw({ instant, templateId, heading, step, onDealt, onRevealed }: DeckDrawProps) {
  const known = heading !== null;
  const template = TEMPLATES[templateId];
  const max = template.positions.length;

  const [deck, setDeck] = useState<DeckState | null>(null);
  const [phase, setPhase] = useState<Phase>(instant ? "pick" : "shuffle");
  const [picked, setPicked] = useState<number[]>([]);
  const [drawn, setDrawn] = useState<DrawnCardData[] | null>(null);
  // The server call that deals the picked cards, and what went wrong with the last one.
  const [dealing, setDealing] = useState(false);
  const [dealError, setDealError] = useState<ErrorView | null>(null);
  const [revealed, setRevealed] = useState(0);
  // How many times the user reshuffled: the status line says so each time.
  const [reshuffles, setReshuffles] = useState(0);
  // Just reshuffled: until the next pick or undo, the status says so.
  const [freshDeck, setFreshDeck] = useState(false);
  // The table is shuffling its cards: the undo waits until they are down.
  const [shuffling, setShuffling] = useState(false);
  // The slots, where a picked card flies to.
  const spreadRef = useRef<HTMLDivElement>(null);
  // The page's latest "move on", read when the hold ends (a new closure per render must not restart the timers).
  const revealedRef = useRef(onRevealed);
  useEffect(() => {
    revealedRef.current = onRevealed;
  });

  // A fresh random deck per visit, made in the browser only.
  useEffect(() => {
    setDeck(createDeck(randomSeed(), DEFAULT_REVERSAL_RATE));
  }, []);

  // Turn the cards over one by one, then move on.
  useEffect(() => {
    if (phase !== "reveal" || !drawn) return;
    const quick = instant || prefersReducedMotion();
    const gap = quick ? 0 : FLIP_GAP_MS;
    const timers = drawn.map((_, i) => window.setTimeout(() => setRevealed(i + 1), gap * i));
    const settle = quick ? (instant ? 0 : HOLD_MS) : gap * (drawn.length - 1) + FLIP_MS + HOLD_MS;
    timers.push(window.setTimeout(() => revealedRef.current(), settle));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [phase, drawn, instant]);

  // The table only ever adds a card; taking one back is the explicit undo below.
  const pick = (index: number) => {
    if (phase !== "pick" || dealing) return;
    setFreshDeck(false);
    setDealError(null);
    setPicked((prev) => (prev.includes(index) || prev.length >= max ? prev : [...prev, index]));
  };

  const undo = () => {
    if (phase !== "pick" || dealing || shuffling) return;
    setFreshDeck(false);
    setDealError(null);
    setPicked((prev) => prev.slice(0, -1));
  };

  // The table reshuffled the cards left (the picks stay, so the deck and its indexes stay too).
  const reshuffled = () => {
    setReshuffles((n) => n + 1);
    setFreshDeck(true);
  };

  // The server deals the cards for the picked positions; the page keeps them with the signed token.
  const reveal = async () => {
    if (!known || picked.length !== max || dealing) return;
    setDealing(true);
    setDealError(null);
    const result = await postJson<DrawResponse>("/api/tarot/draw", { templateId, picks: picked });
    setDealing(false);
    if (!result.ok) {
      setDealError(describeApiError(result.error, "tarot-draw"));
      return;
    }
    const { cards: dealt, drawToken } = result.data;
    onDealt({ templateId, drawToken, cards: dealt });
    setDrawn(dealt);
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
      : dealError
        ? `${dealError.title}.${dealError.body ? ` ${dealError.body}` : ""}`
        : dealing
          ? "카드를 확인하고 있어요"
          : phase === "pick"
        ? remaining === 0
          ? "모두 골랐어요"
          : // Short enough to stay on one line at 360px, so the table never moves when picking starts.
            `${freshDeck ? "카드를 다시 섞었어요." : "마음이 가는 카드를"} ${cards(remaining)}${picked.length > 0 ? " 더" : ""} 골라 주세요`
        : allRevealed
          ? "카드를 모두 뒤집었어요"
          : "카드를 뒤집는 중이에요";

  const many = max > 5;
  return (
    <>
      <Stepper {...step} />

      <div className={s.head}>
        <h1 className={s.question}>{known ? heading : " "}</h1>
        <p className={s.status} role="status">
          {/* A fresh node per reshuffle, so the same words are announced again each time. */}
          <span key={reshuffles}>{status}</span>
        </p>
      </div>

      {known ? (
        // A soft glow comes up behind the slots while the cards turn over.
        <div ref={spreadRef} className={s.spread} data-glow={phase === "reveal" ? "" : undefined}>
          <SpreadRow cards={slots} size={many ? "sm" : "md"} columns={slotColumns(max)} className={max === 1 ? s.single : many ? s.grid : s.slots} />
        </div>
      ) : null}

      <div className={s.stage}>
        {phase === "shuffle" ? (
          <div className={s.arc}>
            <ShuffleStage onDone={() => setPhase("pick")} />
          </div>
        ) : phase === "pick" && deck && known ? (
          <CardTable
            picked={picked}
            max={max}
            onPick={pick}
            // A slot's card (SpreadRow: position name, card, meta).
            slotFor={(order) => spreadRef.current?.querySelectorAll("li")[order]?.children[1] ?? null}
            onReshuffled={reshuffled}
            onShufflingChange={setShuffling}
            disabled={dealing}
            instant={instant}
          />
        ) : null}
      </div>

      <div className={s.cta} data-phase={phase}>
        {phase === "pick" && picked.length === max ? (
          <Button block onClick={reveal} disabled={dealing} trailing="→">
            {dealError ? "다시 시도" : "결과 보기"}
          </Button>
        ) : null}
        {phase === "pick" ? (
          // Keeps its room while hidden, so the table never moves under a finger on the first pick.
          <div className={s.undo} data-hidden={picked.length === 0 ? "" : undefined}>
            <Button variant="ghost" size="md" block onClick={undo} disabled={shuffling} trailing={<UndoIcon />}>
              {max === 1 ? "다시 고르기" : "방금 고른 카드 빼기"}
            </Button>
          </div>
        ) : null}
      </div>
    </>
  );
}
