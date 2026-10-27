"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_REVERSAL_RATE, createDeck, getCard, type DeckState } from "@starlog/core";
import { CardTable } from "@/components/tarot/CardTable";
import { ShuffleStage } from "@/components/tarot/ShuffleStage";
import { TarotCard } from "@/components/tarot/TarotCard";
import { ShareResultButton } from "@/components/share/ShareResultButton";
import { Button } from "@/components/ui/Button";
import { SITE } from "@/lib/config";
import { createNowShareLink } from "@/lib/share/client";
import { drawNow, type NowDraw } from "@/lib/decision";
import { backImage, useDeckPrefs } from "@/lib/deck";
import { guideHref } from "@/lib/hosts";
import s from "./NowOracle.module.css";
import { NEW_TAROT_HREF } from "@/lib/freshStart";

type Phase = "shuffle" | "pick" | "reveal";

type NowOracleProps = {
  /** Skip the shuffle and the reveal pauses (tests). */
  instant?: boolean;
};

const QUESTION_MAX = 40;
/** The picked card stays raised on the table for a moment before the table gives way to it. */
const HOLD_MS = 450;
/** The card is shown face down first, so the turn is seen; the page opens as it turns. */
const TURN_MS = 250;
/** The 3-card reading's name, as on the pricing and help pages (no shared label in SITE yet). */
const FULL_READING = "타로 전체 풀이";
/** One riffle (1.2s) per draw keeps unlimited repeat draws quick. */
const SHUFFLE_RIFFLES = 1;

/** First visit: the steps show open; afterwards they stay folded behind 사용법 보기. */
export const HOWTO_SEEN_KEY = "starlog.now.howto";

const HOWTO_STEPS = [
  { icon: "write", text: "고민을 한 줄 적어요 (마음속으로 떠올리기만 해도 돼요)" },
  { icon: "card", text: "펼쳐진 카드 중 끌리는 한 장을 골라요" },
  { icon: "spark", text: "카드가 고민에 건네는 한 문장과 그렇게 읽은 이유가 나와요" },
] as const;

function howtoSeen(): boolean {
  try {
    return window.localStorage.getItem(HOWTO_SEEN_KEY) === "seen";
  } catch {
    return false;
  }
}

function rememberHowtoSeen(): void {
  try {
    window.localStorage.setItem(HOWTO_SEEN_KEY, "seen");
  } catch {
    // Private mode or blocked storage: the steps simply open again next time.
  }
}

function randomSeed(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

const newDeck = () => createDeck(randomSeed(), DEFAULT_REVERSAL_RATE);

const StepIcon = ({ kind }: { kind: (typeof HOWTO_STEPS)[number]["icon"] }) => {
  // The small card is the back the visitor chose (내 정보 → 카드 디자인).
  const { back } = useDeckPrefs();
  return kind === "card" ? (
    <img className={s.stepCard} src={backImage(back, "sm")} alt="" width={600} height={1040} draggable={false} />
  ) : (
    <svg className={s.stepIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {kind === "write" ? (
        <>
          <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
          <path d="m13.5 6.5 4 4" />
        </>
      ) : (
        <>
          <path d="M12 3.5 13.8 10l6.2 2-6.2 2L12 20.5 10.2 14 4 12l6.2-2L12 3.5Z" />
          <path d="M19 3v3M17.5 4.5h3" />
        </>
      )}
    </svg>
  );
};

const Chevron = () => (
  <svg className={s.chevron} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

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
 * 지금의 한 장: think of one worry (typing it is optional), pick one of the 78 cards on the table, and the
 * card turns over to one line from the card DB, with why and one small thing to do. Everything
 * happens in the browser: a random deck per draw, no server, no quota.
 */
export function NowOracle({ instant = false }: NowOracleProps) {
  // The card design shown: the why points at its picture.
  const { front } = useDeckPrefs();
  const [question, setQuestion] = useState("");
  // Draws again asked for in this visit (한 번 더 뽑기); focus follows them to 바로 펼치기.
  const [reshuffles, setReshuffles] = useState(0);
  const [deck, setDeck] = useState<DeckState | null>(null);
  const [phase, setPhase] = useState<Phase>(instant ? "pick" : "shuffle");
  const [picked, setPicked] = useState<number[]>([]);
  const [draw, setDraw] = useState<NowDraw | null>(null);
  const [turned, setTurned] = useState(false);
  // Open on the server and on a first visit; folded once the browser says the steps were seen.
  const [howtoOpen, setHowtoOpen] = useState(true);
  const [aboutOpen, setAboutOpen] = useState(false);
  const answerRef = useRef<HTMLHeadingElement>(null);
  const howtoToggleRef = useRef<HTMLButtonElement>(null);
  const reshuffleRef = useRef<HTMLDivElement>(null);

  // A fresh random deck per visit, made in the browser only; the steps fold for a returning visitor.
  useEffect(() => {
    setDeck(newDeck());
    if (howtoSeen()) setHowtoOpen(false);
  }, []);

  // After 한 번 더 뽑기, focus waits on 바로 펼치기 while the deck shuffles; once the table is out, 다시 섞기 takes it.
  useEffect(() => {
    const lost = !document.activeElement || document.activeElement === document.body;
    if (phase === "pick" && reshuffles > 0 && lost) reshuffleRef.current?.querySelector<HTMLElement>("[data-reshuffle]")?.focus();
  }, [phase, reshuffles]);

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

  // The answer takes focus once it is there, so it is read out and in view. Having seen one
  // answer counts as having learned the steps.
  useEffect(() => {
    if (!turned) return;
    answerRef.current?.focus();
    rememberHowtoSeen();
  }, [turned]);

  const pick = (index: number) => {
    if (phase !== "pick" || !deck || picked.length > 0) return;
    setPicked([index]);
    setDraw(drawNow(deck, index, Math.random(), front));
  };

  /** A new random deck, shuffled again (the gentle version under reduced motion). */
  const shuffleAgain = () => {
    setDeck(newDeck());
    setPicked([]);
    setDraw(null);
    setTurned(false);
    setReshuffles((n) => n + 1);
    setPhase(instant ? "pick" : "shuffle");
  };

  const again = () => {
    setHowtoOpen(false);
    shuffleAgain();
    window.scrollTo({ top: 0 });
  };

  const closeHowto = () => {
    setHowtoOpen(false);
    rememberHowtoSeen();
    howtoToggleRef.current?.focus();
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
        {/* one h1 holds the name and its line, so the heading says 타로 (SEO plan B1) */}
        <h1 className={s.heading}>
          <span className={s.title}>지금의 한 장</span>{" "}
          <span className={s.sub}>무료 원카드 타로가 건네는 한 문장</span>
        </h1>
      </div>

      {phase !== "reveal" ? (
        <>
          <section className={s.howto} aria-label="지금의 한 장 사용법">
            <button
              ref={howtoToggleRef}
              type="button"
              className={s.howtoToggle}
              aria-expanded={howtoOpen}
              aria-controls="now-howto-steps"
              onClick={() => setHowtoOpen((open) => !open)}
            >
              <span>사용법 보기</span>
              <Chevron />
            </button>
            <div id="now-howto-steps" className={s.howtoPanel} hidden={!howtoOpen}>
              <ol className={s.steps}>
                {HOWTO_STEPS.map((step) => (
                  <li key={step.icon} className={s.step}>
                    <span className={s.stepMark} aria-hidden="true">
                      <StepIcon kind={step.icon} />
                    </span>
                    <span>{step.text}</span>
                  </li>
                ))}
              </ol>
              <div className={s.howtoDone}>
                <Button variant="secondary" size="md" onClick={closeHowto}>
                  알겠어요
                </Button>
              </div>
            </div>
          </section>

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
                <ShuffleStage onDone={() => setPhase("pick")} focusSkip={reshuffles > 0} riffles={SHUFFLE_RIFFLES} />
              </div>
            ) : deck ? (
              <div ref={reshuffleRef}>
                {/* Keyed by the deck, so every new draw deals out afresh. Its 다시 섞기 reshuffles this deck's cards. */}
                <CardTable key={deck.seed} picked={picked} max={1} onPick={pick} instant={instant} />
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
              <div className={s.actions}>
                <p className={s.more}>더 자세히 보고 싶다면</p>
                <Button href={NEW_TAROT_HREF} block trailing="→">
                  {`${FULL_READING} 보기`}
                </Button>
                <Button variant="secondary" block onClick={again}>
                  한 번 더 뽑기
                </Button>
              </div>
              {/* 공유하기 (owner 2026-10-23): this draw's own link, card + line + why; a new draw starts a new sheet. */}
              <div className={s.share}>
                <ShareResultButton
                  key={`${draw.cardId}-${draw.orientation}-${draw.pick}`}
                  kind="now"
                  text={`${SITE.nameKo} 지금의 한 장 · ${card.names.ko}${reversed ? "(역)" : ""}`}
                  create={() => createNowShareLink(draw, front)}
                />
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className={s.about}>
        <div className={s.aboutHead}>
          <button
            id="now-about-toggle"
            type="button"
            className={s.aboutToggle}
            aria-expanded={aboutOpen}
            aria-controls="now-about-panel"
            onClick={() => setAboutOpen((open) => !open)}
          >
            <span>어떻게 답이 나오나요?</span>
            <Chevron />
          </button>
        </div>
        <div id="now-about-panel" role="region" aria-labelledby="now-about-toggle" className={s.aboutPanel} hidden={!aboutOpen}>
          <ul className={s.aboutList}>
            <li>78장의 카드가 정방향과 역방향마다 그림 속 장면에 맞춘 답 문장을 갖고 있어요. 카드 지식으로 미리 준비한 답이에요.</li>
            <li>고른 카드와 방향에 맞는 문장 가운데 하나가 나와요.</li>
            <li>답은 가 보기, 조금 더 지켜보기, 다른 길도 살펴보기 가운데 한쪽으로 기울어요.</li>
            <li>
              횟수 제한 없이 무료예요. 다만 같은 고민으로 여러 번 다시 뽑기보다 처음 나온 카드를 곱씹어 보길 권해요.{" "}
              <Link href={guideHref("/guide/redrawing-same-question")} className={s.aboutLink}>
                같은 질문으로 다시 뽑아도 될까요?
              </Link>
            </li>
            <li>건강, 돈, 법률처럼 무거운 결정은 꼭 전문가와 상의해 주세요.</li>
          </ul>
          {/* The how-to moved from the guide to the app's /help (AdSense audit 2026-10-27; lib/hostRoutes.ts GUIDE_MOVED_TO_HELP). */}
          <Link href="/help#tarot-now-guide" className={s.aboutMore}>
            더 자세히: 지금의 한 장 사용법 <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
