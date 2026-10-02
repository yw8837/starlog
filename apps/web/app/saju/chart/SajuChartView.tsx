"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Cat } from "@/components/characters/Cat";
import { Rabbit } from "@/components/characters/Rabbit";
import { AiNote } from "@/components/reading/AiNote";
import { ErrorPanel } from "@/components/reading/ErrorPanel";
import { ChartPanel } from "@/components/saju/ChartPanel";
import { InputLine } from "@/components/saju/InputLine";
import { useSajuChart } from "@/components/saju/useSajuChart";
import { GeneratingState } from "@/components/tarot/GeneratingState";
import { LockedToc } from "@/components/tarot/LockedToc";
import { Paper } from "@/components/tarot/Paper";
import { ReadingLayout } from "@/components/tarot/ReadingLayout";
import { Stepper } from "@/components/tarot/Stepper";
import { UnlockSheet } from "@/components/tarot/UnlockSheet";
import { Button } from "@/components/ui/Button";
import { loginHref, loginMessage, refreshAccount, useAccount } from "@/lib/account/client";
import { SITE } from "@/lib/config";
import { standardProduct } from "@/lib/pay/catalog";
import { checkoutHref, unlockOffer } from "@/lib/pay/offer";
import type { UnlockMethod } from "@/lib/pay/unlockMethod";
import { commitQuota } from "@/lib/reading/api";
import { CREDIT_CHECKING, creditKept, creditUnknown, describeApiError, type ErrorView } from "@/lib/reading/errors";
import { progressPlan } from "@/lib/reading/progress";
import { readTeaser, saveTeaser } from "@/lib/reading/teaserCache";
import type { SajuContext, SajuReadingResponse, SajuTeaserData } from "@/lib/reading/types";
import { useGeneration } from "@/lib/reading/useGeneration";
import { sajuContextBody, useSajuContext } from "@/lib/sajuFlow";
import { sanitizeSajuForm, type SajuForm } from "@/lib/sajuForm";
import { SAJU_PROLOGUE_SECTIONS } from "@/lib/sajuPrologue";
import { countFullReading, markDayUsedUp, useRemainingToday } from "@/lib/storage/betaUsage";
import { historyFor, listChapters, mergeServerReadings, saveChapter, useChapters } from "@/lib/storage/chapters";
import { LATER_CHECK_DELAYS, OPENING_WINDOW_MS, checkDelivery, heldCredit, type DeliveryCheck, type HeldCredit } from "@/lib/storage/sync";
import s from "./SajuChartView.module.css";
import { NEW_SAJU_HREF } from "@/lib/freshStart";
import { isSajuReadingResponse, isSajuTeaser } from "@/lib/reading/validate";

/** The body /api/saju/* take: birth data, the optional chips, and recent readings as history. */
function sajuBody(birth: SajuForm, context: SajuContext) {
  const history = historyFor(listChapters());
  return { birth, ...sajuContextBody(context), ...(history.length > 0 ? { history } : {}) };
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const RETURN_TO = "/saju/chart";
/** Errors after which the server may still have saved the reading (M4). */
const UNSETTLED = new Set(["QUALITY", "UPSTREAM", "NETWORK", "TIMEOUT", "INVALID"]);

/**
 * Step 2/2: the chart computed from the saved input (here, in the browser), then the free
 * reading written for it and the unlock. Opening writes the full reading, saves it on this device
 * and goes to it. With nothing saved, an example chart asks for the user's own birth data.
 *
 * The sheet offers what this device may use (lib/pay/offer.ts): the 오픈 기념 reading, a login, a
 * purchase, 별조각 or paying. `autoUnlock` (?unlock= after checkout or login) opens it once.
 */
export function SajuChartView({ autoUnlock = null, loginFlag = null }: { autoUnlock?: UnlockMethod | null; loginFlag?: string | null } = {}) {
  const router = useRouter();
  const { form, ready, saved, result } = useSajuChart();
  const context = useSajuContext();
  const chapters = useChapters();
  const remaining = useRemainingToday();
  const chart = result && "chart" in result ? result.chart : null;
  const own = ready && saved && chart !== null && context !== undefined;
  const body = own ? { birth: form, ...sajuContextBody(context) } : null;
  const teaserKey = body ? JSON.stringify(body) : null;

  const teaserGen = useGeneration<SajuTeaserData>();
  const unlockGen = useGeneration<SajuReadingResponse>();
  const [attempt, setAttempt] = useState(0);
  const [fresh, setFresh] = useState<{ key: string; data: SajuTeaserData } | null>(null);
  const teaser = teaserKey ? (fresh?.key === teaserKey ? fresh.data : readTeaser("saju", teaserKey, isSajuTeaser)) : null;

  // The free reading, written once per birth data and chips (kept for this tab).
  const { run: runTeaser, cancel: cancelTeaser } = teaserGen;
  useEffect(() => {
    if (!teaserKey || !own || readTeaser("saju", teaserKey, isSajuTeaser)) return;
    void runTeaser("/api/saju/teaser", sajuBody(form, context), progressPlan("saju-teaser"), isSajuTeaser).then((res) => {
      if (!res?.ok) return;
      saveTeaser("saju", teaserKey, res.data);
      setFresh({ key: teaserKey, data: res.data });
      if (res.commit) void commitQuota(res.commit);
    });
    return cancelTeaser;
  }, [teaserKey, attempt, runTeaser, cancelTeaser]); // form and context are the key

  const opened = own
    ? chapters
        ?.filter((c) => c.kind === "saju" && sameJson(c.birth, form) && sameJson(sajuContextBody(c.context ?? {}), sajuContextBody(context)))
        .pop()
    : undefined;
  const account = useAccount();
  const product = standardProduct("saju");
  const offer = unlockOffer(account, product, SITE.price.signupGiftFree);
  const [method, setMethod] = useState<UnlockMethod>("opening");
  const [creditView, setCreditView] = useState<ErrorView | null>(null);
  // A paid or 별조각 opening not settled yet: "running" while the account is asked, "stalled" once
  // the rounds ran out. Either way the sheet offers nothing to buy or open (no second payment).
  const [check, setCheck] = useState<"running" | "stalled" | null>(null);
  const firstTry = useRef<number | null>(null);
  const checkAbort = useRef<AbortController | null>(null);
  useEffect(() => () => checkAbort.current?.abort(), []);
  const errorContext = method === "paid" ? "paid" : method === "free" ? "stardust" : "reading";
  const unlockError = creditView ?? (unlockGen.state.status === "error" ? describeApiError(unlockGen.state.error, errorContext) : null);
  const loginNote = loginMessage(loginFlag);

  // After a failed unlock, bring the reason into view and focus it.
  useEffect(() => {
    if (!unlockError) return;
    const reason = document.getElementById("unlock-error");
    reason?.scrollIntoView({ block: "center" });
    reason?.focus({ preventScroll: true });
  }, [unlockError]);

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
  const settle = async (chosen: "paid" | "free", startedAt: number, held: HeldCredit, birth: SajuForm, after: "cut" | "refused" | "recheck") => {
    checkAbort.current?.abort();
    const controller = new AbortController();
    checkAbort.current = controller;
    const credit = chosen === "paid" ? "paid" : "stardust";
    // This flow's reading: the same birth data (compared field by field, whatever the key order).
    const sent = sanitizeSajuForm(birth);
    const sameFlow = (chapter: unknown) => {
      const c = chapter as { kind?: string; birth?: unknown };
      return c.kind === "saju" && sent !== null && sameJson(sanitizeSajuForm(c.birth), sent);
    };
    const flow = { startedAt, matches: sameFlow, method: chosen, productId: product.id, units: product.units ?? 0, held };
    const stopWhenNone = after !== "cut";
    const apply = (result: DeliveryCheck): boolean => {
      if (result.status === "unknown") return false;
      setCheck(null);
      void refreshAccount();
      if (result.status === "delivered") {
        mergeServerReadings([result.reading]);
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
    if (!own || !teaser) return;
    setMethod(chosen);
    setCreditView(null);
    setCheck(null);
    checkAbort.current?.abort();
    window.scrollTo(0, 0);
    const plan = progressPlan("saju-reading", { sections: SAJU_PROLOGUE_SECTIONS });
    // A reading opened with credit (or the owner pass, when logged in) is saved to the account with
    // the teaser's title and summary.
    const body = {
      ...sajuBody(form, context),
      ...(chosen === "opening" ? {} : { unlock: { method: chosen }, display: { title: teaser.title, summary: teaser.summary } }),
    };
    const startedAt = Date.now();
    if (chosen === "paid" || chosen === "free") firstTry.current ??= startedAt;
    // What the account held as it started: "kept" later means all of it is back.
    const held = heldCredit(account?.user, product.id, product.units ?? 0);
    const res = await unlockGen.run("/api/saju/reading", body, plan, isSajuReadingResponse);
    if (!res) return;
    if (!res.ok) {
      const code = res.error.code;
      if (code === "BETA_LIMIT") markDayUsedUp();
      if (code === "LOGIN_REQUIRED") router.push(loginHref(RETURN_TO));
      if ((chosen === "paid" || chosen === "free") && UNSETTLED.has(code)) void settle(chosen, startedAt, held, form, "cut");
      else if ((chosen === "paid" || chosen === "free") && code === "NO_CREDIT") void settle(chosen, since(startedAt), held, form, "refused");
      else if (code === "NO_CREDIT" || code === "PAYMENT_REQUIRED") void refreshAccount();
      return;
    }
    if (chosen === "opening") countFullReading();
    else void refreshAccount();
    const contextBody = sajuContextBody(context);
    // Kept on this device first; only then is the quota cookie set.
    const { chapter } = saveChapter({
      kind: "saju",
      birth: form,
      title: teaser.title,
      summary: teaser.summary,
      ...(Object.keys(contextBody).length > 0 ? { context: contextBody } : {}),
      reading: res.data.reading,
      chapterToken: res.data.chapterToken,
      ...(res.data.readingId ? { serverId: res.data.readingId } : {}),
    });
    if (res.commit) void commitQuota(res.commit);
    router.push(`/chapter/${chapter.id}`);
  };

  // After checkout (?unlock=paid) or a 별조각 login (?unlock=free): open once, as soon as the
  // teaser and the account are known and the offer matches. Without the saved birth data (another
  // browser) nothing runs, and the purchase waits in 내 정보.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoUnlock || autoStarted.current || !own || !teaser || account === undefined || opened) return;
    if (autoUnlock === "paid" && offer.mode !== "open-paid") return;
    if (autoUnlock === "free" && offer.mode !== "stardust") return;
    autoStarted.current = true;
    router.replace(RETURN_TO);
    void unlock(autoUnlock);
  });

  /** 다시 확인하기: after the rounds ran out, or on a reading of this kind being opened (another tab, a reload). */
  const recheck = () => {
    const busy = account?.user?.opening.find((item) => item.productId === product.id);
    const chosen = busy ? (busy.currency === "stardust" ? "free" : "paid") : method === "free" ? "free" : "paid";
    setMethod(chosen); // the lines and the refund link that follow are about this credit
    void settle(chosen, since(Date.now()), heldCredit(account?.user, product.id, product.units ?? 0), form, check === "stalled" ? "cut" : "recheck");
  };

  const teaserState = teaserGen.state;
  const teaserError = !teaser && teaserState.status === "error" ? describeApiError(teaserState.error, "teaser") : null;
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

  if (unlockGen.state.status === "running" || unlockGen.state.status === "done") {
    const progress = unlockGen.state.status === "running" ? unlockGen.state.progress : { caption: "다 적었어요", fraction: 1 };
    return (
      <>
        <p className="sr-only" role="status">
          {announce}
        </p>
        <GeneratingState mode="saju" caption={progress.caption} fraction={progress.fraction} hint="보통 1~2분 걸려요. 이 화면을 열어 둔 채로 기다려 주세요." live={false} />
      </>
    );
  }

  let content: ReactNode = null;
  if (chart && ready && !saved) {
    content = (
      <section className={s.cta} aria-labelledby="own-chart-title">
        <h2 id="own-chart-title" className={s.ctaTitle}>
          내 명식은 어떨까요?
        </h2>
        <p className={s.ctaText}>태어난 날을 넣으면 내 명식을 세우고, 나에게 맞춘 풀이를 열 수 있어요.</p>
        <Button href={NEW_SAJU_HREF} block trailing="→">
          태어난 날 입력하기
        </Button>
      </section>
    );
  } else if (own && teaser) {
    content = (
      <>
        <Paper as="article" aria-labelledby="prologue-title">
          <p className={s.paperEyebrow}>첫 장</p>
          <h2 id="prologue-title" className={s.paperTitle}>
            {teaser.title}
          </h2>
          <p className={s.prose}>{teaser.summary}</p>
          <footer className={s.signature}>
            <span aria-hidden="true">
              <Rabbit outfit="hanbok" size={52} expression="happy" reactOnTap={false} />
            </span>
            <span>풀이 · 토끼 선생님</span>
          </footer>
        </Paper>
        <LockedToc items={teaser.lockedToc} meta={`소제목 ${teaser.lockedToc.length}개 · 약 ${new Intl.NumberFormat("ko-KR").format(SITE.reading.approxChars.saju)}자`} />
        <UnlockSheet
          kind="saju"
          offer={offer}
          remaining={remaining}
          onUnlock={(chosen) => void unlock(chosen)}
          loginHref={loginHref(RETURN_TO)}
          payHref={checkoutHref("saju", RETURN_TO)}
          owner={account?.owner}
          refundHref={method === "paid" && creditView?.action === "retry" ? "/me#purchases" : undefined}
          error={unlockError ?? (loginNote ? { title: loginNote, action: null } : null)}
          editHref="/saju/new"
          openedHref={opened ? `/chapter/${opened.id}` : undefined}
          checking={check !== null}
          onCheck={check === "stalled" || (check === null && offer.mode === "in-progress") ? recheck : undefined}
        />
        <AiNote />
      </>
    );
  } else if (own && teaserError) {
    content = <ErrorPanel view={teaserError} onRetry={() => setAttempt((n) => n + 1)} editHref="/saju/new" />;
  } else if (own) {
    content = (
      <GeneratingState
        mode="saju"
        layout="inline"
        caption={teaserState.status === "running" ? teaserState.progress.caption : "명식을 다시 살피고 있어요"}
        fraction={teaserState.status === "running" ? teaserState.progress.fraction : 0}
        live={false}
      />
    );
  }

  return (
    <>
      <p className="sr-only" role="status">
        {announce}
      </p>
      <Stepper step={2} total={2} label="명식 보기" backHref="/saju/new" backLabel="입력으로 돌아가기" />
      <ReadingLayout
        spreadLabel="명식"
        head={
          <header className={s.head}>
            <div className={s.cast}>
              <Rabbit outfit="hanbok" size={104} expression="focus" />
              <span className={s.assistant}>
                <Cat outfit="hanbok" size={64} />
              </span>
            </div>
            <div className={s.headText}>
              <p className={s.eyebrow}>사주</p>
              <h1 className={s.title}>{ready ? (saved ? "나의 명식" : "예시 명식") : " "}</h1>
              <InputLine form={ready ? form : null} className={s.input} />
            </div>
          </header>
        }
        spread={<ChartPanel result={result} />}
      >
        {content}
      </ReadingLayout>
    </>
  );
}
