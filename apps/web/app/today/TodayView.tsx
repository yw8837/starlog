"use client";

import { getCard, type Orientation } from "@starlog/core";
import { useEffect, useRef, useState, type RefObject } from "react";
import { AppAdSignal } from "@/components/app/AppAdSignal";
import { ErrorPanel } from "@/components/reading/ErrorPanel";
import { ReportReading } from "@/components/report/ReportReading";
import { LoginFirst } from "@/components/reading/LoginFirst";
import { Paper } from "@/components/tarot/Paper";
import { ShuffleStage } from "@/components/tarot/ShuffleStage";
import { Stepper } from "@/components/tarot/Stepper";
import { TarotCard } from "@/components/tarot/TarotCard";
import { Button } from "@/components/ui/Button";
import { ShareResultButton } from "@/components/share/ShareResultButton";
import { loginHref, loginMessage, useAccount, useShown } from "@/lib/account/client";
import { commitQuota, getJson } from "@/lib/reading/api";
import { describeApiError, type ErrorView } from "@/lib/reading/errors";
import { BOT_CHECK_LINE, progressPlan, timeFraction, waitLine } from "@/lib/reading/progress";
import type { DailyData, DailyDeal } from "@/lib/reading/types";
import { useBotCheck } from "@/lib/reading/useBotCheck";
import { useElapsed } from "@/lib/reading/useElapsed";
import { useGeneration } from "@/lib/reading/useGeneration";
import { createDailyShareLink, knownDailyShareLink, stopDailyShareLink } from "@/lib/share/client";
import { clearDaily, saveDaily, useDailySaved } from "@/lib/storage/daily";
import { kstDate } from "@/lib/kst";
import s from "./TodayView.module.css";
import { FRONT_DECKS, deckPrefs, type FrontDeck } from "@/lib/deck";
import { NEW_TAROT_HREF } from "@/lib/freshStart";
import { isDailyData, isDailyDeal } from "@/lib/reading/validate";
import { luckySwatch } from "@/lib/reading/luckySwatch";

const DAILY_PLAN = progressPlan("daily");
const DEAL = [0, 1, 2] as const;
/** The screen before the pick; the server HTML holds the same lines unseen (M-06). */
const PICK_TITLE = "오늘의 타로 카드를 골라 볼까요?";
const PICK_LEAD = "섞은 카드 세 장 가운데 마음이 가는 한 장을 골라 주세요";
const PICK_NOTE = "하루 한 장 · 로그인하면 어느 기기에서든 같은 카드가 보여요";
/** Where the card would turn over, for a visitor (owner 2026-11-04: 오늘의 한 장 needs a login; the shuffle and the pick do not). */
const LOGIN_TITLE = "오늘의 한 장은 로그인하고 볼 수 있어요";

/**
 * What a login brought back (`/today?pick=1&login=cancel`): the slot picked before it and the login's note. Read once and
 * taken off the address; the note stays on screen (code review 2026-11-04 #7).
 */
function resumedLogin(): { pick: number | null; note: string | null } {
  const query = new URLSearchParams(window.location.search);
  const value = query.get("pick");
  const note = loginMessage(query.get("login"));
  if (value === null) return { pick: null, note };
  window.history.replaceState(window.history.state, "", window.location.pathname);
  const pick = Number(value);
  return { pick: Number.isInteger(pick) && pick >= 0 && pick < DEAL.length ? pick : null, note };
}
/** 다시 섞기 plays one riffle (1.2s) like 지금의 한 장, so asking again stays quick; the first shuffle keeps its two. */
const RESHUFFLE_RIFFLES = 1;

/** Every way the three face-down slots can be laid out; 다시 섞기 moves to one of the others. */
const ARRANGEMENTS: ReadonlyArray<readonly number[]> = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];

/**
 * A new layout of the three face-down cards, never the one already on the table: which slot of the
 * server's deal each card on screen stands for. The cards stay unseen and the deal (fixed for the
 * device and KST day) is the same three, so this only changes what a tap sends once the pick is made.
 */
export function rearranged(order: readonly number[]): readonly number[] {
  const others = ARRANGEMENTS.filter((layout) => layout.some((slot, at) => slot !== order[at]));
  return others[Math.floor(Math.random() * others.length)]!;
}

function cardName(cardId: string, orientation: Orientation): string {
  try {
    return `${getCard(cardId).names.ko} · ${orientation === "reversed" ? "역방향" : "정방향"}`;
  } catch {
    return orientation === "reversed" ? "역방향" : "정방향";
  }
}

/**
 * The design today's fortune was read with: it quotes that picture, so it shows in it even after the
 * device switched designs. A fortune kept from before the deck was stored: this device's choice.
 */
const deckOf = (reading: DailyData): FrontDeck | undefined => FRONT_DECKS.find((deck) => deck === (reading as { deck?: unknown }).deck);

const ShuffleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" focusable="false">
    <path d="M3 7h3.5c2 0 3.2 1 4.3 2.6l2.4 3.8C14.3 15 15.5 16 17.5 16H21" />
    <path d="M3 16h3.5c1.3 0 2.3-.5 3.1-1.3" />
    <path d="M13.4 8.3C14.2 7.5 15.2 7 16.5 7H21" />
    <path d="m18 4 3 3-3 3" />
    <path d="m18 13 3 3-3 3" />
  </svg>
);

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
 * device, so it survives the server's limits). Until the pick, 다시 섞기 plays a quick shuffle again
 * and lays the three face-down cards out afresh, in the browser only: nothing is asked or shown.
 */
export function TodayView() {
  const saved = useDailySaved();
  const daily = useGeneration<DailyData>();
  const [phase, setPhase] = useState<Phase>("checking");
  const [picked, setPicked] = useState<number | null>(null);
  const [justPicked, setJustPicked] = useState(false);
  const [checkError, setCheckError] = useState<ErrorView | null>(null);
  const [attempt, setAttempt] = useState(0);
  // The server answered LOGIN_REQUIRED: the visitor shuffles and picks as anyone, and the pick asks for the login.
  const [needsLogin, setNeedsLogin] = useState(false);
  // The slot picked before the login (?pick=), turned over as soon as the account's deal is known.
  const resume = useRef<number | null | undefined>(undefined);
  const [loginNote, setLoginNote] = useState<string | null>(null);
  // The server's marker of the logged-in account (null for a visitor): a card kept on this device shows only for the same
  // marker (code review 2026-11-04), and one the server handed out in this visit shows as it is.
  const [viewer, setViewer] = useState<string | null | undefined>(undefined);
  const [fresh, setFresh] = useState<DailyData | null>(null);
  const savedRef = useRef(saved);
  savedRef.current = saved;
  const savedKnown = saved !== undefined;
  // Which slot of the server's deal each face-down card on screen stands for (the first layout is as dealt).
  const [order, setOrder] = useState<readonly number[]>(DEAL);
  // Shuffles asked for in this visit; focus follows them to 바로 펼치기 and back to 다시 섞기.
  const [reshuffles, setReshuffles] = useState(0);
  const lineRef = useRef<HTMLHeadingElement>(null);
  const reshuffleRef = useRef<HTMLDivElement>(null);

  const kept = saved && typeof viewer === "string" && saved.account === viewer ? saved.reading : null;
  const { shown: reading, loggedOut } = useShown(useAccount(), fresh ?? kept, null);

  /** The slot picked before the login, once (null when none). */
  const takeResume = () => {
    const resumed = resume.current ?? null;
    resume.current = null;
    return resumed;
  };

  // The server says who is logged in and whether today's card was picked (on any device of the account): the card it hands
  // back, the card kept here when it is the same account's, or the deal. A visitor shuffles and picks; the pick asks for the login.
  useEffect(() => {
    if (resume.current === undefined) {
      const back = resumedLogin();
      resume.current = back.pick;
      setLoginNote(back.note);
    }
    if (!savedKnown) return;
    let live = true;
    void getJson<(DailyData | DailyDeal) & { account?: unknown }>("/api/tarot/daily").then((result) => {
      if (!live) return;
      const here = savedRef.current;
      if (!result.ok) {
        if (result.error.code === "LOGIN_REQUIRED") {
          // Not to show without a session (a session that ended, another person on the device): the card kept here shows
          // only for its own account's marker, so it stays hidden, not deleted (owner 2026-11-05). A logout deletes it.
          setViewer(null);
          setCheckError(null);
          setNeedsLogin(true);
          const resumed = takeResume();
          if (resumed !== null) void read(resumed, true);
          else setPhase("shuffle");
          return;
        }
        setCheckError(describeApiError(result.error, "daily"));
        return;
      }
      const account = typeof result.data.account === "string" ? result.data.account : undefined;
      // Kept only when it has the fortune's shape; anything else is a failed answer to retry.
      if (isDailyData(result.data)) {
        setCheckError(null);
        setViewer(account ?? null);
        setFresh(result.data);
        saveDaily(result.data, Date.now(), account);
      } else if (isDailyDeal(result.data)) {
        setCheckError(null);
        setNeedsLogin(false);
        setViewer(account ?? null);
        // The server lost its copy, but this device kept the same account's: shown.
        if (here && account && here.account === account) return;
        if (here) clearDaily();
        const resumed = takeResume();
        if (resumed !== null) void read(resumed, false);
        else setPhase("shuffle");
      } else setCheckError(describeApiError({ code: "INVALID", status: 502 }, "daily"));
    });
    return () => {
      live = false;
    };
  }, [savedKnown, attempt]);

  // Once the card has turned over, start reading at today's line.
  useEffect(() => {
    if (reading && justPicked) lineRef.current?.focus();
  }, [reading, justPicked]);

  // After 다시 섞기 the button is gone while the cards shuffle; bring focus back once they are out.
  // Only when focus was lost with the button itself, never pulled away from anywhere else.
  useEffect(() => {
    const lost = !document.activeElement || document.activeElement === document.body;
    if (phase === "pick" && reshuffles > 0 && lost) reshuffleRef.current?.querySelector("button")?.focus();
  }, [phase, reshuffles]);

  const pick = async (index: number) => {
    if (phase !== "pick" && phase !== "reading") return;
    await read(index, needsLogin);
  };

  /** The picked slot turns over; a visitor's pick waits for the login instead (asked in place, below). */
  async function read(index: number, visitor: boolean) {
    setPicked(index);
    setPhase("reading");
    if (visitor) return;
    const result = await daily.run("/api/tarot/daily", { pick: index, deck: deckPrefs().front }, DAILY_PLAN, isDailyData);
    if (!result) return;
    if (result.ok) {
      setJustPicked(true);
      const account = (result.data as { account?: unknown }).account;
      setFresh(result.data);
      saveDaily(result.data, Date.now(), typeof account === "string" ? account : undefined);
      if (result.commit) void commitQuota(result.commit);
    } else if (result.error.code === "LOGIN_REQUIRED") {
      // A session that ended meanwhile: the pick is kept for after the login.
      setNeedsLogin(true);
    }
  }

  // Before the pick only (the button is shown in no other phase): the cards are laid out afresh and
  // the shuffle plays again. Nothing is asked of the server and nothing is turned over.
  const reshuffle = () => {
    if (phase !== "pick") return;
    setOrder(rearranged(order));
    setReshuffles((n) => n + 1);
    setPhase("shuffle");
  };

  const state = daily.state;
  const pickError = !reading && !needsLogin && state.status === "error" ? describeApiError(state.error, "daily") : null;
  const announce =
    phase === "pick" && !reading
      ? "마음이 가는 카드를 한 장 골라 주세요"
      : needsLogin && phase === "reading"
        ? LOGIN_TITLE
        : state.status === "running"
          ? state.progress.caption
          : (pickError ?? checkError)?.title ?? "";

  let content;
  if (saved === undefined) {
    // The server HTML and hydration: the page's heading is there before this device's card is known (SEO-06),
    // and the first visit's screen holds its room, unseen, so the guide below does not jump when it appears (M-06).
    content = (
      <>
        <h1 className="sr-only">오늘의 한 장</h1>
        <div className={`${s.closed} ${s.held}`} aria-hidden="true">
          <p className={s.title}>{PICK_TITLE}</p>
          <p className={s.lead}>{PICK_LEAD}</p>
          <div className={s.stagePlaceholder} />
          <p className={s.note}>{PICK_NOTE}</p>
        </div>
      </>
    );
  } else if (reading) {
    content = <Opened reading={reading} revisit={!justPicked} flip={justPicked} lineRef={lineRef} />;
  } else if (loggedOut) {
    content = (
      <div className={s.errorWrap}>
        <h1 className="sr-only">오늘의 한 장</h1>
        <LoginFirst
          title={LOGIN_TITLE}
          body="오늘 고른 카드는 그대로 있어요. 카카오나 Google로 로그인하면 다시 보여 드려요."
          href={loginHref("/today")}
          action="로그인하고 카드 보기"
          note={loginNote}
        />
      </div>
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
          {waiting ? (needsLogin ? "고른 카드는 로그인하면 펼쳐져요" : "고른 카드를 펼치고 있어요") : PICK_TITLE}
        </h1>
        <p className={s.lead}>{waiting ? " " : PICK_LEAD}</p>
        {phase === "checking" ? (
          <div className={s.stagePlaceholder} aria-hidden="true" />
        ) : phase === "shuffle" ? (
          <div className={s.shuffle}>
            <ShuffleStage onDone={() => setPhase("pick")} focusSkip={reshuffles > 0} riffles={reshuffles > 0 ? RESHUFFLE_RIFFLES : undefined} />
          </div>
        ) : (
          <ol className={s.deal} aria-label="세 장의 카드">
            {order.map((index, slot) => {
              // After the pick only the chosen card stays: the other two are never shown.
              if (waiting && picked !== index) return null;
              return (
                <li key={index} className={s.dealItem}>
                  <TarotCard
                    faceUp={false}
                    size="md"
                    highlight={picked === index}
                    onFlip={waiting ? undefined : () => void pick(index)}
                    label={`${slot + 1}번째 카드 고르기`}
                    className={s.dealCard}
                  />
                </li>
              );
            })}
          </ol>
        )}
        {waiting ? (
          needsLogin && picked !== null ? (
            <LoginFirst
              title={LOGIN_TITLE}
              body="고른 카드는 그대로 기억해 둘게요. 카카오나 Google로 로그인하면 바로 펼쳐 보여 드리고, 어느 기기에서든 같은 카드가 보여요."
              href={loginHref(`/today?pick=${picked}`)}
              action="로그인하고 카드 펼치기"
              note={loginNote}
            />
          ) : pickError ? (
            <ErrorPanel view={pickError} onRetry={() => picked !== null && void pick(picked)} />
          ) : (
            <DailyProgress caption={state.status === "running" ? state.progress.caption : DAILY_PLAN.opening} fraction={state.status === "running" ? state.progress.fraction : 0} />
          )
        ) : (
          <>
            {/* Before the pick only; after the cards in the tab order. */}
            {phase === "pick" ? (
              <div ref={reshuffleRef}>
                <Button variant="secondary" size="md" onClick={reshuffle} trailing={<ShuffleIcon />}>
                  다시 섞기
                </Button>
              </div>
            ) : null}
            <p className={s.note}>{PICK_NOTE}</p>
          </>
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

/**
 * While the picked card is read: the bar (the stream's share or the time's, whichever is further, so it never
 * stands still) and the seconds since the pick under it. Mounted with the pick, so its clock starts there.
 */
function DailyProgress({ caption, fraction }: { caption: string; fraction: number }) {
  const checking = useBotCheck();
  const elapsed = useElapsed(checking);
  return (
    <div className={s.progress}>
      <p className={s.caption}>{caption}</p>
      <div className={s.track} aria-hidden="true">
        <span className={s.fill} style={{ transform: `scaleX(${Math.max(0.06, fraction, timeFraction("daily", elapsed))})` }} />
      </div>
      <p className={s.note}>{checking ? BOT_CHECK_LINE : waitLine("daily", elapsed)}</p>
    </div>
  );
}

function Opened({ reading, revisit, flip, lineRef }: { reading: DailyData; revisit: boolean; flip: boolean; lineRef: RefObject<HTMLHeadingElement | null> }) {
  const { card, areas, lucky } = reading;
  // The card's own day (it is today's when shown): its share link is that day's, even past midnight (review 2026-10-20 A6).
  const [shownAt] = useState(() => Date.now());
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
        <TarotCard cardId={card.cardId} orientation={card.orientation} faceUp={faceUp} size="md" highlight className={s.card} label={cardName(card.cardId, card.orientation)} deck={deckOf(reading)} />
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

      {/* The Starlog app only: 신고 on this reading, and the free result's banner while it is shown. */}
      <ReportReading kind="daily" />
      <AppAdSignal on />

      <div className={s.after}>
        {/* The card's own page (/s/<id>, made by the server from this device's card), never the home (owner 2026-10-20). */}
        <ShareResultButton
          kind="daily"
          text={`오늘의 카드: ${reading.summary}`}
          create={createDailyShareLink}
          stop={() => stopDailyShareLink(kstDate(shownAt))}
          current={() => knownDailyShareLink(shownAt)}
        />
        <Button href={NEW_TAROT_HREF} variant="ghost" size="md">
          카드 세 장으로 더 물어보기
        </Button>
      </div>
    </article>
  );
}
