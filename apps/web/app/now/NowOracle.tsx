"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_REVERSAL_RATE, createDeck, getCard, type DeckState } from "@starlog/core";
import { CardFan } from "@/components/tarot/CardFan";
import { ShuffleStage } from "@/components/tarot/ShuffleStage";
import { TarotCard } from "@/components/tarot/TarotCard";
import { Button } from "@/components/ui/Button";
import { SITE, won } from "@/lib/config";
import { drawNow, type NowDraw } from "@/lib/decision";
import s from "./NowOracle.module.css";

type Phase = "shuffle" | "pick" | "reveal";

type NowOracleProps = {
  /** Skip the shuffle and the reveal pauses (tests). */
  instant?: boolean;
};

const QUESTION_MAX = 40;
/** The picked card stays raised in the fan for a moment before the spread gives way to it. */
const HOLD_MS = 450;
/** The card is shown face down first, so the turn is seen; the page opens as it turns. */
const TURN_MS = 250;

const RITUAL = ["고민을 떠올려요 (적어도 좋아요)", "눈을 감고 숨을 한 번 쉬어요", "마음이 가는 카드를 한 장 골라요"];

function randomSeed(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

const newDeck = () => createDeck(randomSeed(), DEFAULT_REVERSAL_RATE);

/** Corner flourish of the answer page, drawn for the top-left corner and mirrored for the others. */
const Corner = ({ at }: { at: "tl" | "tr" | "bl" | "br" }) => (
  <svg className={s.corner} data-at={at} viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true" focusable="false">
    <path d="M3 37V11a8 8 0 0 1 8-8h26" />
    <path d="M8 30c0-11 6-19 19-22" />
    <path d="M14 20c0-4 3-6 6-6 2.5 0 4 1.6 4 3.6 0 1.8-1.3 3-3 3-1.4 0-2.4-1-2.4-2.3" />
    <circle cx="3" cy="3" r="1.6" fill="currentColor" stroke="none" />
  </svg>
);

/** Crescent moon and a four-point star between two short rules. */
const Emblem = () => (
  <svg className={s.emblem} viewBox="0 0 72 32" aria-hidden="true" focusable="false">
    <path d="M3 16h9M60 16h9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    <path d="M32 4A12 12 0 0 0 32 28A15 15 0 0 1 32 4Z" fill="currentColor" />
    <path d="M45 9l1.5 4.5L51 15l-4.5 1.5L45 21l-1.5-4.5L39 15l4.5-1.5Z" fill="currentColor" />
  </svg>
);

/**
 * 지금의 한 장: think of one worry (typing it is optional), pick one card from a fan of 21, and the
 * card turns over to one line from the card DB, with why and one small thing to do. Everything
 * happens in the browser: a random deck per draw, no server, no quota.
 */
export function NowOracle({ instant = false }: NowOracleProps) {
  const [question, setQuestion] = useState("");
  // Draws so far in this visit; the ritual steps show before the first one only.
  const [round, setRound] = useState(0);
  const [deck, setDeck] = useState<DeckState | null>(null);
  const [phase, setPhase] = useState<Phase>(instant ? "pick" : "shuffle");
  const [picked, setPicked] = useState<number[]>([]);
  const [draw, setDraw] = useState<NowDraw | null>(null);
  const [turned, setTurned] = useState(false);
  const answerRef = useRef<HTMLHeadingElement>(null);

  // A fresh random deck per visit, made in the browser only.
  useEffect(() => {
    setDeck(newDeck());
  }, []);

  // Picked: hold the raised card a moment, show it face down, then turn it and open the page.
  useEffect(() => {
    if (!draw || phase !== "pick") return;
    const timer = window.setTimeout(() => setPhase("reveal"), instant ? 0 : HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [draw, phase, instant]);

  useEffect(() => {
    if (phase !== "reveal") return;
    const timer = window.setTimeout(() => setTurned(true), instant ? 0 : TURN_MS);
    return () => window.clearTimeout(timer);
  }, [phase, instant]);

  // The answer takes focus once it is there, so it is read out and in view.
  useEffect(() => {
    if (turned) answerRef.current?.focus();
  }, [turned]);

  const pick = (index: number) => {
    if (phase !== "pick" || !deck || picked.length > 0) return;
    setPicked([index]);
    setDraw(drawNow(deck, index, Math.random()));
  };

  const again = () => {
    setDeck(newDeck());
    setPicked([]);
    setDraw(null);
    setTurned(false);
    setRound((n) => n + 1);
    setPhase(instant ? "pick" : "shuffle");
    window.scrollTo({ top: 0 });
  };

  const card = draw ? getCard(draw.cardId) : null;
  const reversed = draw?.orientation === "reversed";
  const cardLabel = card ? `${card.names.ko}${reversed ? " 역방향" : ""}` : undefined;

  return (
    <div className={s.screen}>
      <header className={s.top}>
        <Link href="/" className={s.back} aria-label="홈으로">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <path d="M15 5.5 8.5 12l6.5 6.5" />
          </svg>
        </Link>
      </header>

      <div className={s.intro}>
        <h1 className={s.title}>지금의 한 장</h1>
        <p className={s.sub}>타로가 건네는 한 문장</p>
      </div>

      {phase !== "reveal" ? (
        <>
          {round === 0 ? (
            <ol className={s.ritual} aria-label="뽑는 순서">
              {RITUAL.map((step, i) => (
                <li key={step} className={s.step} data-moon={i}>
                  {step}
                </li>
              ))}
            </ol>
          ) : null}

          <div className={s.ask}>
            <div className={s.askHead}>
              <label htmlFor="now-question" className={s.label}>
                고민 한 줄
              </label>
              <span className={s.count} aria-hidden="true">
                {question.length}/{QUESTION_MAX}
              </span>
            </div>
            <input
              id="now-question"
              className={s.input}
              value={question}
              maxLength={QUESTION_MAX}
              onChange={(e) => setQuestion(e.target.value.slice(0, QUESTION_MAX))}
              placeholder="예: 오늘 먼저 연락해도 될까?"
              autoComplete="off"
              enterKeyHint="done"
              aria-describedby="now-question-hint"
            />
            <p id="now-question-hint" className={s.hint}>
              적지 않고 마음속으로 떠올려도 괜찮아요
            </p>
          </div>

          <p className={s.status} role="status">
            {phase === "pick" && deck ? (picked.length ? "카드를 뒤집는 중이에요" : "마음이 가는 카드를 한 장 골라 주세요") : ""}
          </p>

          <div className={s.stage}>
            {phase === "shuffle" ? (
              <div className={s.arc}>
                <ShuffleStage onDone={() => setPhase("pick")} focusSkip={round > 0} />
              </div>
            ) : deck ? (
              <div className={s.arc}>
                {/* Keyed by the deck, so every new draw deals out afresh. */}
                <CardFan key={deck.seed} picked={picked} max={1} onPick={pick} />
              </div>
            ) : null}
          </div>
        </>
      ) : draw && card ? (
        <section className={s.result} aria-label="지금의 한 장 결과" data-lean={draw.lean}>
          <p className={s.asked}>
            {question.trim() ? (
              <>
                <span className={s.askedLabel}>내 고민</span>
                <span className={s.askedText}>{question.trim()}</span>
              </>
            ) : (
              <span className={s.askedLabel}>마음속 고민에 건네는 한 문장</span>
            )}
          </p>

          <div className={s.page} data-open={turned ? "" : undefined}>
            <Corner at="tl" />
            <Corner at="tr" />
            <Corner at="bl" />
            <Corner at="br" />
            <Emblem />
            {turned ? (
              <h2 ref={answerRef} tabIndex={-1} className={s.answer}>
                {draw.answer}
              </h2>
            ) : null}
          </div>

          <div className={s.drawn}>
            <TarotCard cardId={draw.cardId} orientation={draw.orientation} faceUp={turned} size="md" label={turned ? cardLabel : undefined} className={s.card} />
            <div className={s.reading} data-open={turned ? "" : undefined}>
              {turned ? (
                <>
                  <p className={s.cardName}>
                    {card.names.ko}
                    {reversed ? <span className="sr-only"> 역방향</span> : null}
                  </p>
                  <p className={s.why}>{draw.why}</p>
                </>
              ) : null}
            </div>
          </div>

          {turned ? (
            <div className={s.after}>
              <p className={s.tip}>
                <span className={s.tipLabel}>오늘 해 볼 일</span>
                {draw.tip}
              </p>

              <div className={s.actions}>
                <p className={s.more}>
                  더 자세히 보고 싶다면 <span aria-hidden="true">→</span> 기본 타로 3장 ({won(SITE.price.tarotStandardKrw)})
                </p>
                <Button href="/tarot/new" block trailing="→">
                  기본 타로 3장으로 자세히 보기
                </Button>
                <Button variant="secondary" block onClick={again}>
                  한 번 더 뽑기
                </Button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
