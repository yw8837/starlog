"use client";

import { getCard, type Orientation } from "@starlog/core";
import { useEffect, useRef, useState, type RefObject } from "react";
import { AiNote } from "@/components/reading/AiNote";
import { ErrorPanel } from "@/components/reading/ErrorPanel";
import { Paper } from "@/components/tarot/Paper";
import { ShuffleStage } from "@/components/tarot/ShuffleStage";
import { Stepper } from "@/components/tarot/Stepper";
import { TarotCard } from "@/components/tarot/TarotCard";
import { Button } from "@/components/ui/Button";
import { ShareButton } from "@/components/ui/ShareButton";
import { commitQuota, getJson } from "@/lib/reading/api";
import { describeApiError, type ErrorView } from "@/lib/reading/errors";
import { progressPlan } from "@/lib/reading/progress";
import type { DailyData, DailyDeal } from "@/lib/reading/types";
import { useGeneration } from "@/lib/reading/useGeneration";
import { saveDaily, useDaily } from "@/lib/storage/daily";
import s from "./TodayView.module.css";
import { NEW_TAROT_HREF } from "@/lib/freshStart";
import { isDailyData, isDailyDeal } from "@/lib/reading/validate";

const DAILY_PLAN = progressPlan("daily");
const DEAL = [0, 1, 2] as const;

/** A swatch for the lucky colour's name (free text from the reading); gold when it is not one of these. */
const SWATCHES: ReadonlyArray<[RegExp, string]> = [
  [/빨|레드|붉/, "#e5484d"],
  [/주황|오렌지|살구/, "#f5a524"],
  [/노랑|노란|레몬|개나리/, "#f7d354"],
  [/연두|라임/, "#a8d672"],
  [/초록|녹색|올리브|숲|민트|그린/, "#5fbf8f"],
  [/하늘|스카이/, "#8cc8f0"],
  [/파랑|파란|블루|청색|바다/, "#4a7fe0"],
  [/남색|네이비|군청/, "#2e3a8c"],
  [/보라|라벤더|퍼플|자주/, "#a07ae0"],
  [/분홍|핑크|장미/, "#f29bc0"],
  [/흰|하양|화이트|아이보리|크림/, "#f7f3ea"],
  [/검정|검은|블랙|먹/, "#26222f"],
  [/회색|그레이|은색|실버/, "#b7b4c2"],
  [/갈색|브라운|베이지|카키|모래/, "#b08457"],
  [/금색|골드|황금/, "#f3dca1"],
];

export function luckySwatch(color: string): string {
  return SWATCHES.find(([pattern]) => pattern.test(color))?.[1] ?? "#f3dca1";
}

function cardName(cardId: string, orientation: Orientation): string {
  try {
    return `${getCard(cardId).names.ko} · ${orientation === "reversed" ? "역방향" : "정방향"}`;
  } catch {
    return orientation === "reversed" ? "역방향" : "정방향";
  }
}

type Limited = { card: { cardId: string; orientation: Orientation }; view: ErrorView };

type Phase =
  /** Asking the server whether today's card was picked already. */
  | "checking"
  | "shuffle"
  | "pick"
  /** The picked card is being read (or failed: see the generation state). */
  | "reading";

/**
 * 오늘의 한 장: a short shuffle, three face-down cards, tap one; it turns over with today's fortune
 * (the line large first, then the card and keyword, the reading, 애정·금전·일, lucky colour and
 * number, a tip). The server deals the three cards per device and KST day and only ever returns the
 * picked one, so a revisit that day shows that card and its fortune, fixed (also kept on this
 * device, so it survives the server's limits).
 */
export function TodayView() {
  const saved = useDaily();
  const daily = useGeneration<DailyData>();
  const [phase, setPhase] = useState<Phase>("checking");
  const [picked, setPicked] = useState<number | null>(null);
  const [justPicked, setJustPicked] = useState(false);
  const [checkError, setCheckError] = useState<ErrorView | null>(null);
  const [limited, setLimited] = useState<Limited | null>(null);
  const [attempt, setAttempt] = useState(0);
  const lineRef = useRef<HTMLHeadingElement>(null);

  const reading = saved ?? null;

  // Picked earlier today (this device keeps it, or the server has it): straight to the result.
  // Otherwise the server deals three face-down cards and the shuffle plays.
  useEffect(() => {
    if (saved === undefined || saved !== null) return;
    let live = true;
    void getJson<DailyData | DailyDeal>("/api/tarot/daily").then((result) => {
      if (!live) return;
      if (!result.ok) {
        setCheckError(describeApiError(result.error, "daily"));
        return;
      }
      // Kept only when it has the fortune's shape; anything else is a failed answer to retry.
      if (isDailyData(result.data)) {
        setCheckError(null);
        saveDaily(result.data);
      } else if (isDailyDeal(result.data)) {
        setCheckError(null);
        setPhase("shuffle");
      } else setCheckError(describeApiError({ code: "INVALID", status: 502 }, "daily"));
    });
    return () => {
      live = false;
    };
  }, [saved, attempt]);

  // Once the card has turned over, start reading at today's line.
  useEffect(() => {
    if (reading && justPicked) lineRef.current?.focus();
  }, [reading, justPicked]);

  const pick = async (index: number) => {
    if (phase !== "pick" && phase !== "reading") return;
    setPicked(index);
    setPhase("reading");
    setLimited(null);
    const result = await daily.run("/api/tarot/daily", { pick: index }, DAILY_PLAN, isDailyData);
    if (!result) return;
    if (result.ok) {
      setJustPicked(true);
      saveDaily(result.data);
      if (result.commit) void commitQuota(result.commit);
    } else if (result.error.code === "BETA_LIMIT" && result.error.card) {
      setLimited({ card: result.error.card, view: describeApiError(result.error, "daily") });
    }
  };

  const state = daily.state;
  const pickError = !reading && !limited && state.status === "error" ? describeApiError(state.error, "daily") : null;
  const announce =
    phase === "pick" && !reading
      ? "마음이 가는 카드를 한 장 골라 주세요"
      : state.status === "running"
        ? state.progress.caption
        : (pickError ?? checkError ?? limited?.view)?.title ?? "";

  let content;
  if (saved === undefined) {
    content = null;
  } else if (reading) {
    content = <Opened reading={reading} revisit={!justPicked} flip={justPicked} lineRef={lineRef} />;
  } else if (limited) {
    content = (
      <section className={s.limited} aria-labelledby="today-title">
        <h1 id="today-title" className={s.title}>
          오늘의 카드
        </h1>
        <TarotCard cardId={limited.card.cardId} orientation={limited.card.orientation} faceUp size="md" highlight className={s.card} />
        <p className={s.cardName}>{cardName(limited.card.cardId, limited.card.orientation)}</p>
        <p className={s.limitText}>{limited.view.title}</p>
        {limited.view.body ? <p className={s.limitSub}>{limited.view.body}</p> : null}
      </section>
    );
  } else if (checkError) {
    content = (
      <div className={s.errorWrap}>
        <h1 className="sr-only">오늘의 한 장</h1>
        <ErrorPanel view={checkError} onRetry={() => setAttempt((n) => n + 1)} />
      </div>
    );
  } else {
    const waiting = phase === "reading";
    content = (
      <section className={s.closed} aria-labelledby="today-title">
        <h1 id="today-title" className={s.title}>
          {waiting ? "고른 카드를 펼치고 있어요" : "오늘의 카드를 골라 볼까요?"}
        </h1>
        <p className={s.lead}>{waiting ? " " : "섞은 카드 세 장 가운데 마음이 가는 한 장을 골라 주세요"}</p>
        {phase === "checking" ? (
          <div className={s.stagePlaceholder} aria-hidden="true" />
        ) : phase === "shuffle" ? (
          <div className={s.shuffle}>
            <ShuffleStage onDone={() => setPhase("pick")} />
          </div>
        ) : (
          <ol className={s.deal} aria-label="세 장의 카드">
            {DEAL.map((index) => {
              // After the pick only the chosen card stays: the other two are never shown.
              if (waiting && picked !== index) return null;
              return (
                <li key={index} className={s.dealItem}>
                  <TarotCard
                    faceUp={false}
                    size="md"
                    highlight={picked === index}
                    onFlip={waiting ? undefined : () => void pick(index)}
                    label={`${index + 1}번째 카드 고르기`}
                    className={s.dealCard}
                  />
                </li>
              );
            })}
          </ol>
        )}
        {waiting ? (
          pickError ? (
            <ErrorPanel view={pickError} onRetry={() => picked !== null && void pick(picked)} />
          ) : (
            <div className={s.progress}>
              <p className={s.caption}>{state.status === "running" ? state.progress.caption : DAILY_PLAN.opening}</p>
              <div className={s.track} aria-hidden="true">
                <span className={s.fill} style={{ transform: `scaleX(${Math.max(0.06, state.status === "running" ? state.progress.fraction : 0)})` }} />
              </div>
            </div>
          )
        ) : (
          <p className={s.note}>하루 한 번 · 고른 카드는 오늘 하루 그대로예요</p>
        )}
      </section>
    );
  }

  return (
    <>
      <Stepper label="오늘의 한 장" backHref="/" backLabel="홈으로" />
      {/* One live region for the screen: what to do, what the card is doing, what went wrong. */}
      <p className="sr-only" role="status">
        {announce}
      </p>
      {content}
    </>
  );
}

function Opened({ reading, revisit, flip, lineRef }: { reading: DailyData; revisit: boolean; flip: boolean; lineRef: RefObject<HTMLHeadingElement | null> }) {
  const { card, areas, lucky } = reading;
  // Just picked: the card turns over (instantly under reduced motion); a revisit shows it face up.
  const [faceUp, setFaceUp] = useState(!flip);
  useEffect(() => {
    if (faceUp) return;
    const timer = window.setTimeout(() => setFaceUp(true), 60);
    return () => window.clearTimeout(timer);
  }, [faceUp]);
  return (
    <article className={s.opened} aria-labelledby="today-line">
      {revisit ? <p className={s.revisit}>오늘의 카드는 이미 골랐어요 · 내일 새 카드가 기다려요</p> : null}

      {/* 1. Today's line, biggest. */}
      <div className={`${s.slip} ${s.reveal}`} style={{ animationDelay: "0ms" }}>
        <p className={s.slipLabel}>오늘의 한마디</p>
        <h1 id="today-line" ref={lineRef} tabIndex={-1} className={s.line}>
          {reading.summary}
        </h1>
      </div>

      {/* 2. The card, face up, with its keyword. */}
      <div className={`${s.cardBlock} ${s.reveal}`} style={{ animationDelay: "160ms" }}>
        <TarotCard cardId={card.cardId} orientation={card.orientation} faceUp={faceUp} size="md" highlight className={s.card} label={cardName(card.cardId, card.orientation)} />
        <p className={s.cardName}>{cardName(card.cardId, card.orientation)}</p>
        <p className={s.keyword}>{card.keyword}</p>
      </div>

      {/* 3. The reading. */}
      <div className={s.reveal} style={{ animationDelay: "280ms" }}>
        <Paper>
          <p className={s.prose}>{reading.body}</p>
        </Paper>
      </div>

      {/* 4. 애정 · 금전 · 일, one line each. */}
      <section className={`${s.areas} ${s.reveal}`} style={{ animationDelay: "380ms" }} aria-labelledby="areas-title">
        <h2 id="areas-title" className={s.sectionTitle}>
          오늘의 흐름
        </h2>
        <dl className={s.areaList}>
          {(
            [
              ["애정", areas.love],
              ["금전", areas.money],
              ["일", areas.work],
            ] as const
          ).map(([label, text]) => (
            <div key={label} className={s.area}>
              <dt className={s.areaLabel}>{label}</dt>
              <dd className={s.areaText}>{text}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* 5. Lucky colour chip and number ball. */}
      <section className={`${s.lucky} ${s.reveal}`} style={{ animationDelay: "460ms" }} aria-labelledby="lucky-title">
        <h2 id="lucky-title" className={s.sectionTitle}>
          오늘의 행운
        </h2>
        <div className={s.luckyRow}>
          <p className={s.colorChip}>
            <span className={s.swatch} style={{ background: luckySwatch(lucky.color) }} aria-hidden="true" />
            <span>
              <span className={s.luckyLabel}>색</span>
              {lucky.color}
            </span>
          </p>
          <p className={s.numberWrap}>
            <span className={s.luckyLabel}>숫자</span>
            <span className={s.ball}>{lucky.number}</span>
          </p>
        </div>
      </section>

      {/* 6. One small thing to do today. */}
      <section className={`${s.tip} ${s.reveal}`} style={{ animationDelay: "540ms" }} aria-labelledby="tip-title">
        <h2 id="tip-title" className={s.tipTitle}>
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M12 2.5l2.6 6.1 6.6.6-5 4.4 1.5 6.5L12 16.7l-5.7 3.4 1.5-6.5-5-4.4 6.6-.6z" fill="currentColor" />
          </svg>
          오늘의 한 가지
        </h2>
        <p className={s.tipText}>{reading.tip}</p>
      </section>

      <div className={s.after}>
        <ShareButton text={`오늘의 카드: ${reading.summary}`} />
        <Button href={NEW_TAROT_HREF} variant="ghost" size="md">
          카드 세 장으로 더 물어보기
        </Button>
      </div>
      <AiNote />
    </article>
  );
}
