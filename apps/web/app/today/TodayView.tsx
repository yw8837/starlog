"use client";

import { getCard, type Orientation } from "@starlog/core";
import { useEffect, useRef, useState, type RefObject } from "react";
import { AiNote } from "@/components/reading/AiNote";
import { ErrorPanel } from "@/components/reading/ErrorPanel";
import { Paper } from "@/components/tarot/Paper";
import { Stepper } from "@/components/tarot/Stepper";
import { TarotCard } from "@/components/tarot/TarotCard";
import { FortuneCookie } from "@/components/today/FortuneCookie";
import { Button } from "@/components/ui/Button";
import { ShareButton } from "@/components/ui/ShareButton";
import { prefersReducedMotion } from "@/lib/motion";
import { describeApiError, type ErrorView } from "@/lib/reading/errors";
import { progressPlan } from "@/lib/reading/progress";
import type { DailyData } from "@/lib/reading/types";
import { useGeneration } from "@/lib/reading/useGeneration";
import { saveDaily, useDaily } from "@/lib/storage/daily";
import s from "./TodayView.module.css";

/** How long the crack plays before the slip can show (the call runs meanwhile). */
const CRACK_MS = 700;

const DAILY_PLAN = progressPlan("daily");

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

/**
 * 오늘의 한 장 as a fortune cookie: tap to crack it open, then the day's line, the card, the
 * reading, the three areas, lucky colour and number, and a tip. One per device per KST day: a
 * revisit that day opens straight to it (kept on this device too, so it survives the server's
 * limits).
 */
export function TodayView() {
  const saved = useDaily();
  const daily = useGeneration<DailyData>();
  const [openedNow, setOpenedNow] = useState(false);
  const [cracking, setCracking] = useState(false);
  const [limited, setLimited] = useState<Limited | null>(null);
  const slipRef = useRef<HTMLHeadingElement>(null);

  const reading = saved ?? null;
  const revisit = reading !== null && !openedNow;

  // Once the slip is out, move focus to it so screen readers start at the day's line.
  useEffect(() => {
    if (reading && openedNow && !cracking) slipRef.current?.focus();
  }, [reading, openedNow, cracking]);

  const open = async () => {
    if (cracking) return;
    setOpenedNow(true);
    setCracking(true);
    setLimited(null);
    const crack = new Promise((resolve) => window.setTimeout(resolve, prefersReducedMotion() ? 0 : CRACK_MS));
    const [result] = await Promise.all([daily.run("/api/tarot/daily", {}, DAILY_PLAN), crack]);
    setCracking(false);
    if (!result) return;
    if (result.ok) saveDaily(result.data);
    else if (result.error.code === "BETA_LIMIT" && result.error.card) setLimited({ card: result.error.card, view: describeApiError(result.error, "daily") });
  };

  const state = daily.state;
  const error = !reading && !limited && state.status === "error" ? describeApiError(state.error, "daily") : null;
  const waiting = !reading && (cracking || state.status === "running");
  const announce = waiting && state.status === "running" ? state.progress.caption : error ? error.title : limited ? limited.view.title : "";

  let content;
  if (saved === undefined) {
    content = null;
  } else if (reading && !cracking) {
    content = <Opened reading={reading} revisit={revisit} slipRef={slipRef} />;
  } else if (limited) {
    content = (
      <section className={s.limited} aria-labelledby="today-title">
        <h1 id="today-title" className={s.title}>
          오늘의 카드
        </h1>
        <TarotCard cardId={limited.card.cardId} orientation={limited.card.orientation} faceUp size="md" className={s.card} />
        <p className={s.cardName}>{cardName(limited.card.cardId, limited.card.orientation)}</p>
        <p className={s.limitText}>{limited.view.title}</p>
        {limited.view.body ? <p className={s.limitSub}>{limited.view.body}</p> : null}
      </section>
    );
  } else if (error) {
    content = (
      <div className={s.errorWrap}>
        <h1 className="sr-only">오늘의 한 장</h1>
        <FortuneCookie size={150} state="cracked" className={s.cookieSmall} />
        <ErrorPanel
          view={error}
          onRetry={() => void open()}
        />
      </div>
    );
  } else {
    const caption = waiting ? (state.status === "running" ? state.progress.caption : DAILY_PLAN.opening) : null;
    content = (
      <section className={s.closed} aria-labelledby="today-title">
        <h1 id="today-title" className={s.title}>
          {waiting ? "쿠키를 열었어요" : "오늘의 쿠키를 열어 볼까요?"}
        </h1>
        <p className={s.lead}>{waiting ? " " : "쿠키 속 쪽지에 오늘의 카드와 한마디가 있어요"}</p>
        <button type="button" className={s.cookieButton} onClick={() => void open()} disabled={waiting} aria-label="쿠키 열기">
          <FortuneCookie size={220} state={waiting ? "cracked" : "whole"} floating={!waiting} />
        </button>
        {waiting ? (
          <div className={s.progress}>
            <p className={s.caption}>{caption}</p>
            <div className={s.track} aria-hidden="true">
              <span className={s.fill} style={{ transform: `scaleX(${Math.max(0.06, state.status === "running" ? state.progress.fraction : 0)})` }} />
            </div>
          </div>
        ) : (
          <div className={s.cta}>
            <Button block onClick={() => void open()}>
              쿠키 열기
            </Button>
            <p className={s.note}>하루 한 번 · 오늘은 같은 쪽지가 나와요</p>
          </div>
        )}
      </section>
    );
  }

  return (
    <>
      <Stepper label="오늘의 한 장" backHref="/" backLabel="홈으로" />
      {/* One live region for the screen: what the cookie is doing, then what went wrong. */}
      <p className="sr-only" role="status">
        {announce}
      </p>
      {content}
    </>
  );
}

function Opened({ reading, revisit, slipRef }: { reading: DailyData; revisit: boolean; slipRef: RefObject<HTMLHeadingElement | null> }) {
  const { card, areas, lucky } = reading;
  return (
    <article className={s.opened} aria-labelledby="today-line">
      {revisit ? <p className={s.revisit}>오늘의 쿠키는 이미 열었어요 · 내일 새 쿠키가 기다려요</p> : null}

      {/* 1. The fortune-cookie line, biggest. */}
      <div className={`${s.slip} ${s.reveal}`} style={{ animationDelay: "0ms" }}>
        <p className={s.slipLabel}>오늘의 쪽지</p>
        <h1 id="today-line" ref={slipRef} tabIndex={-1} className={s.line}>
          {reading.summary}
        </h1>
      </div>

      {/* 2. The card, face up, with its keyword. */}
      <div className={`${s.cardBlock} ${s.reveal}`} style={{ animationDelay: "160ms" }}>
        <TarotCard cardId={card.cardId} orientation={card.orientation} faceUp size="md" className={s.card} label={cardName(card.cardId, card.orientation)} />
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
        <ShareButton text={`오늘의 쿠키: ${reading.summary}`} />
        <Button href="/tarot/new" variant="ghost" size="md">
          카드 세 장으로 더 물어보기
        </Button>
      </div>
      <AiNote />
    </article>
  );
}
