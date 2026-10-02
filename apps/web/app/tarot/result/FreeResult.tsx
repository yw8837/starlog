"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AiNote } from "@/components/reading/AiNote";
import { ErrorPanel } from "@/components/reading/ErrorPanel";
import { GeneratingState } from "@/components/tarot/GeneratingState";
import { LockedToc } from "@/components/tarot/LockedToc";
import { Paper } from "@/components/tarot/Paper";
import { ReadingLayout } from "@/components/tarot/ReadingLayout";
import { SituationSummary } from "@/components/tarot/SituationSummary";
import { SpreadRow, faceUpCard } from "@/components/tarot/SpreadRow";
import { Stepper } from "@/components/tarot/Stepper";
import { UnlockSheet } from "@/components/tarot/UnlockSheet";
import { ShareButton } from "@/components/ui/ShareButton";
import { loginHref, loginMessage, refreshAccount, useAccount } from "@/lib/account/client";
import { SITE } from "@/lib/config";
import { resultGate, summarizeFlow, tarotInput, useFlowState, withFlags } from "@/lib/flowState";
import { standardProduct } from "@/lib/pay/catalog";
import { checkoutHref, unlockOffer } from "@/lib/pay/offer";
import type { UnlockMethod } from "@/lib/pay/unlockMethod";
import { commitQuota } from "@/lib/reading/api";
import { CREDIT_CHECKING, creditKept, creditUnknown, describeApiError, type ErrorView } from "@/lib/reading/errors";
import { progressPlan } from "@/lib/reading/progress";
import { readTeaser, saveTeaser } from "@/lib/reading/teaserCache";
import type { TarotInput, TarotReadingResponse, TarotTeaserData } from "@/lib/reading/types";
import { useGeneration } from "@/lib/reading/useGeneration";
import { countFullReading, markDayUsedUp, useRemainingToday } from "@/lib/storage/betaUsage";
import { historyFor, listChapters, mergeServerReadings, saveChapter, useChapters } from "@/lib/storage/chapters";
import { LATER_CHECK_DELAYS, OPENING_WINDOW_MS, checkDelivery, heldCredit, type DeliveryCheck, type HeldCredit } from "@/lib/storage/sync";
import s from "./FreeResult.module.css";
import { isTarotReadingResponse, isTarotTeaser } from "@/lib/reading/validate";

const RETURN_TO = "/tarot/result";
/** Errors after which the server may still have saved the reading (M4). */
const UNSETTLED = new Set(["QUALITY", "UPSTREAM", "NETWORK", "TIMEOUT", "INVALID"]);

/** The reading input with up to 3 recent readings on this device (omitted when there are none). */
function withHistory(input: TarotInput): TarotInput {
  const history = historyFor(listChapters());
  return history.length > 0 ? { ...input, history } : input;
}

/**
 * Step 3, in one scroll: the question as asked, the three cards the server dealt, the first card
 * read in full (the free teaser), the rest listed, and the unlock. Opening writes the full
 * reading, saves it on this device and goes to it. Sharing sends the site and the card names,
 * never the question or note.
 *
 * The sheet offers what this device may use (lib/pay/offer.ts): the 오픈 기념 reading, a login, a
 * purchase, 별조각 or paying. `autoUnlock` (?unlock= after checkout or login) opens it once.
 */
export function FreeResult({ instant, autoUnlock = null, loginFlag = null }: { instant: boolean; autoUnlock?: UnlockMethod | null; loginFlag?: string | null }) {
  const router = useRouter();
  const { flow, setFlow } = useFlowState();
  const chapters = useChapters();
  const remaining = useRemainingToday();
  const gate = flow ? resultGate(flow) : null;
  const summary = gate === "ready" ? summarizeFlow(flow) : null;
  const draw = gate === "ready" ? flow?.draw : undefined;

  // No question yet → the builder; a question without cards dealt for it → the draw.
  useEffect(() => {
    if (gate === "builder") router.replace("/tarot/new");
    else if (gate === "draw") router.replace(withFlags("/tarot/draw", { instant }));
  }, [gate, instant, router]);

  const input = flow && summary ? tarotInput(flow, summary) : null;
  const teaserKey = draw && input ? `${draw.drawToken}|${JSON.stringify(input)}` : null;
  const positions = draw?.cards.map((card) => card.position) ?? [];

  const teaserGen = useGeneration<TarotTeaserData>();
  const unlockGen = useGeneration<TarotReadingResponse>();
  const [attempt, setAttempt] = useState(0);
  const [fresh, setFresh] = useState<{ key: string; data: TarotTeaserData } | null>(null);
  const teaser = teaserKey ? (fresh?.key === teaserKey ? fresh.data : readTeaser("tarot", teaserKey, isTarotTeaser)) : null;

  // The free teaser, written once per draw and question (kept for this tab, so a reload shows it
  // again). Keyed by what it is written for: the draw and the input are both in the key.
  const { run: runTeaser, cancel: cancelTeaser } = teaserGen;
  useEffect(() => {
    if (!teaserKey || !draw || !input || readTeaser("tarot", teaserKey, isTarotTeaser)) return;
    const plan = progressPlan("tarot-teaser", { positions: draw.cards.map((card) => card.position) });
    void runTeaser("/api/tarot/teaser", { drawToken: draw.drawToken, input: withHistory(input) }, plan, isTarotTeaser).then((result) => {
      if (!result?.ok) return;
      saveTeaser("tarot", teaserKey, result.data);
      setFresh({ key: teaserKey, data: result.data });
      if (result.commit) void commitQuota(result.commit);
    });
    return cancelTeaser;
  }, [teaserKey, attempt, runTeaser, cancelTeaser]);

  const openedId = draw?.chapterId && chapters?.some((chapter) => chapter.id === draw.chapterId) ? draw.chapterId : undefined;
  const account = useAccount();
  const product = standardProduct("tarot");
  const offer = unlockOffer(account, product, SITE.price.signupGiftFree);
  const [method, setMethod] = useState<UnlockMethod>("opening");
  const [creditView, setCreditView] = useState<ErrorView | null>(null);
  // A paid or 별조각 opening not settled yet: "running" while the account is asked, "stalled" once
  // the rounds ran out. Either way the sheet offers nothing to buy or open (no second payment).
  const [check, setCheck] = useState<"running" | "stalled" | null>(null);
  const firstTry = useRef<number | null>(null);
  const checkAbort = useRef<AbortController | null>(null);
  useEffect(() => () => checkAbort.current?.abort(), []);
  const context = method === "paid" ? "paid" : method === "free" ? "stardust" : "reading";
  const unlockError = creditView ?? (unlockGen.state.status === "error" ? describeApiError(unlockGen.state.error, context) : null);
  const loginNote = loginMessage(loginFlag);

  // After a failed unlock the result comes back; bring the reason into view and focus it.
  useEffect(() => {
    if (!unlockError) return;
    const reason = document.getElementById("unlock-error");
    reason?.scrollIntoView({ block: "center" });
    reason?.focus({ preventScroll: true });
  }, [unlockError]);

  /** This flow's reading: the same question and the very same cards. */
  const sameFlow = (chapter: unknown) => {
    const c = chapter as { kind?: string; question?: string; cards?: Array<{ cardId: string; orientation: string }> };
    return (
      c.kind === "tarot" &&
      c.question === input?.question &&
      JSON.stringify(c.cards?.map((x) => [x.cardId, x.orientation])) === JSON.stringify(draw?.cards.map((x) => [x.cardId, x.orientation]))
    );
  };

  /** Since when an account reading of this flow counts as this opening's: a try made here, or the longest a reservation lives. */
  const since = (now: number) => Math.min(now - OPENING_WINDOW_MS, firstTry.current ?? now);

  /**
   * M4: find out what happened to a paid or 별조각 opening before saying anything, with nothing to
   * buy or open meanwhile.
   * - "cut": the answer broke off; wait for delivered or kept (the rounds may run out: "stalled");
   * - "refused": NO_CREDIT though the credit looked held (an opening still running took it, or one
   *   already delivered spent it); an account that is sure nothing is left then says so;
   * - "recheck": 다시 확인하기 on a reading being opened.
   */
  const settle = async (chosen: "paid" | "free", startedAt: number, held: HeldCredit, after: "cut" | "refused" | "recheck") => {
    checkAbort.current?.abort();
    const controller = new AbortController();
    checkAbort.current = controller;
    const credit = chosen === "paid" ? "paid" : "stardust";
    const flow = { startedAt, matches: sameFlow, method: chosen, productId: product.id, units: product.units ?? 0, held };
    const stopWhenNone = after !== "cut";
    const apply = (result: DeliveryCheck): boolean => {
      if (result.status === "unknown") return false;
      setCheck(null);
      void refreshAccount();
      if (result.status === "delivered") {
        mergeServerReadings([result.reading]);
        // Bound to these cards like a reading opened here, so this draw is never offered for sale again.
        setFlow((prev) => (prev.draw ? { ...prev, draw: { ...prev.draw, chapterId: result.reading.id } } : prev));
        router.push(`/chapter/${result.reading.id}`);
      } else if (result.status === "kept") {
        setCreditView(creditKept(credit));
      } else {
        // Nothing held, nothing being opened: the refreshed offer is the truth.
        setCreditView(after === "refused" ? describeApiError({ code: "NO_CREDIT", status: 402 }, credit) : null);
        if (after === "recheck") unlockGen.reset();
      }
      return true;
    };
    setCheck("running");
    setCreditView(CREDIT_CHECKING);
    if (apply(await checkDelivery(flow, { signal: controller.signal, stopWhenNone }))) return;
    if (controller.signal.aborted) return;
    setCreditView(creditUnknown(credit));
    if (apply(await checkDelivery(flow, { delays: LATER_CHECK_DELAYS, signal: controller.signal, stopWhenNone }))) return;
    if (controller.signal.aborted) return;
    setCheck("stalled");
    void refreshAccount();
  };

  const unlock = async (chosen: UnlockMethod) => {
    if (!draw || !input || !summary) return;
    setMethod(chosen);
    setCreditView(null);
    setCheck(null);
    checkAbort.current?.abort();
    window.scrollTo(0, 0);
    const plan = progressPlan("tarot-reading", { positions });
    const body = { drawToken: draw.drawToken, input: withHistory(input), ...(chosen === "opening" ? {} : { unlock: { method: chosen } }) };
    const startedAt = Date.now();
    if (chosen === "paid" || chosen === "free") firstTry.current ??= startedAt;
    // What the account held as it started: "kept" later means all of it is back.
    const held = heldCredit(account?.user, product.id, product.units ?? 0);
    const result = await unlockGen.run("/api/tarot/reading", body, plan, isTarotReadingResponse);
    if (!result) return;
    if (!result.ok) {
      const code = result.error.code;
      if (code === "BETA_LIMIT") markDayUsedUp();
      if (code === "LOGIN_REQUIRED") router.push(loginHref(RETURN_TO));
      if ((chosen === "paid" || chosen === "free") && UNSETTLED.has(code)) void settle(chosen, startedAt, held, "cut");
      else if ((chosen === "paid" || chosen === "free") && code === "NO_CREDIT") void settle(chosen, since(startedAt), held, "refused");
      else if (code === "NO_CREDIT" || code === "PAYMENT_REQUIRED") void refreshAccount();
      return;
    }
    if (chosen === "opening") countFullReading();
    else void refreshAccount();
    const keywords = new Map(teaser?.cards.map((card) => [card.position, card.keyword]));
    // Kept on this device first; only then is the quota cookie set.
    const { chapter } = saveChapter({
      kind: "tarot",
      question: summary.question,
      conditions: summary.conditions,
      note: summary.note.trim(),
      cards: draw.cards.map((card) => {
        const keyword = keywords.get(card.position);
        return keyword ? { ...card, keyword } : card;
      }),
      reading: result.data.reading,
      chapterToken: result.data.chapterToken,
      ...(result.data.readingId ? { serverId: result.data.readingId } : {}),
    });
    setFlow((prev) => (prev.draw ? { ...prev, draw: { ...prev.draw, chapterId: chapter.id } } : prev));
    if (result.commit) void commitQuota(result.commit);
    router.push(`/chapter/${chapter.id}`);
  };

  // After checkout (?unlock=paid) or a 별조각 login (?unlock=free): open once, as soon as the
  // teaser and the account are known and the offer matches. Without a draw (the flow was lost on
  // another browser) nothing runs, and the purchase waits in 내 정보.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoUnlock || autoStarted.current || !teaser || account === undefined || openedId) return;
    if (autoUnlock === "paid" && offer.mode !== "open-paid") return;
    if (autoUnlock === "free" && offer.mode !== "stardust") return;
    autoStarted.current = true;
    router.replace(withFlags(RETURN_TO, { instant }));
    void unlock(autoUnlock);
  });

  /** 다시 확인하기: after the rounds ran out, or on a reading of this kind being opened (another tab, a reload). */
  const recheck = () => {
    const busy = account?.user?.opening.find((item) => item.productId === product.id);
    const chosen = busy ? (busy.currency === "stardust" ? "free" : "paid") : method === "free" ? "free" : "paid";
    void settle(chosen, since(Date.now()), heldCredit(account?.user, product.id, product.units ?? 0), check === "stalled" ? "cut" : "recheck");
  };

  const teaserState = teaserGen.state;
  const teaserError = !teaser && teaserState.status === "error" ? describeApiError(teaserState.error, "teaser") : null;
  const opening = unlockGen.state.status === "running" || unlockGen.state.status === "done";
  // One live region for the whole screen: progress, then what went wrong.
  const announce =
    unlockGen.state.status === "running"
      ? unlockGen.state.progress.caption
      : unlockError
        ? unlockError.title
        : teaserState.status === "running"
          ? teaserState.progress.caption
          : teaserError
            ? teaserError.title
            : "";

  let content;
  if (!draw || !summary) {
    content = <Stepper step={3} label="카드 풀이" backHref="/" backLabel="홈으로" />;
  } else if (opening) {
    const progress = unlockGen.state.status === "running" ? unlockGen.state.progress : { caption: "다 적었어요", fraction: 1 };
    content = <GeneratingState caption={progress.caption} fraction={progress.fraction} hint="보통 1분 남짓 걸려요. 이 화면을 열어 둔 채로 기다려 주세요." live={false} />;
  } else {
    const keywords = new Map(teaser?.cards.map((card) => [card.position, card.keyword]));
    const cards = draw.cards.map((card) => faceUpCard({ ...card, keyword: keywords.get(card.position) }));
    content = (
      <>
        <Stepper step={3} label="카드 풀이" backHref="/" backLabel="홈으로" />
        <ReadingLayout
          head={
            <header className={s.head}>
              <h1 className={s.question}>{summary.question}</h1>
              <SituationSummary conditions={summary.conditions} note={summary.note} />
              <div className={s.share}>
                <ShareButton text={`${SITE.nameKo}에서 뽑은 카드 · ${cards.map((card) => card.name ?? card.position).join(" · ")}`} />
              </div>
            </header>
          }
          spread={<SpreadRow size="md" cards={cards} />}
        >
          {teaser ? (
            <>
              <Paper as="article" aria-labelledby="first-card-title">
                <h2 id="first-card-title" className={s.cardHeading}>
                  {teaser.firstCard.heading}
                </h2>
                <p className={s.prose}>{teaser.firstCard.body}</p>
              </Paper>
              <LockedToc items={teaser.lockedToc} meta={`소제목 ${teaser.lockedToc.length}개 · 약 ${new Intl.NumberFormat("ko-KR").format(SITE.reading.approxChars.tarot)}자`} />
              <UnlockSheet
                kind="tarot"
                offer={offer}
                remaining={remaining}
                onUnlock={(chosen) => void unlock(chosen)}
                loginHref={loginHref(RETURN_TO)}
                payHref={checkoutHref("tarot", RETURN_TO)}
                owner={account?.owner}
                refundHref={method === "paid" && creditView?.action === "retry" ? "/me#orders" : undefined}
                error={unlockError ?? (loginNote ? { title: loginNote, action: null } : null)}
                redrawHref={withFlags("/tarot/draw", { instant })}
                editHref="/tarot/new"
                openedHref={openedId ? `/chapter/${openedId}` : undefined}
                checking={check !== null}
                onCheck={check === "stalled" || (check === null && offer.mode === "in-progress") ? recheck : undefined}
              />
              <AiNote />
            </>
          ) : teaserError ? (
            <ErrorPanel view={teaserError} onRetry={() => setAttempt((n) => n + 1)} redrawHref={withFlags("/tarot/draw", { instant })} editHref="/tarot/new" />
          ) : (
            <GeneratingState
              layout="inline"
              caption={teaserState.status === "running" ? teaserState.progress.caption : "카드를 다시 읽고 있어요"}
              fraction={teaserState.status === "running" ? teaserState.progress.fraction : 0}
              live={false}
            />
          )}
        </ReadingLayout>
      </>
    );
  }

  return (
    <>
      <p className="sr-only" role="status">
        {announce}
      </p>
      {content}
    </>
  );
}
