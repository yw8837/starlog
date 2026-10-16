"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CrossSpread } from "@/components/premium/CrossSpread";
import { PremiumProgress } from "@/components/premium/PremiumProgress";
import { PremiumUnlock } from "@/components/premium/PremiumUnlock";
import { SpreadList } from "@/components/premium/SpreadList";
import { AiNote } from "@/components/reading/AiNote";
import { ErrorPanel } from "@/components/reading/ErrorPanel";
import { SpreadChip, useFlowSpread } from "@/components/tarot/DeepSpreadGate";
import { GeneratingState } from "@/components/tarot/GeneratingState";
import { LockedToc } from "@/components/tarot/LockedToc";
import { Paper } from "@/components/tarot/Paper";
import { ReadingLayout } from "@/components/tarot/ReadingLayout";
import { SituationSummary } from "@/components/tarot/SituationSummary";
import { Stepper } from "@/components/tarot/Stepper";
import s from "@/app/tarot/result/FreeResult.module.css";
import { useAccount } from "@/lib/account/client";
import { deckPrefs } from "@/lib/deck";
import { DEEP_RESULT_PATH, deepResultGate, summarizeFlow, tarotInput, useFlowState, withFlags } from "@/lib/flowState";
import { DEEP_BUILDER_HREF } from "@/lib/freshStart";
import { approxCharsText } from "@/lib/pricing";
import { premiumApiPath } from "@/lib/premium/client";
import { PREMIUM } from "@/lib/premium/products";
import { usePremiumStatus } from "@/lib/premium/status";
import { usePremiumOpen } from "@/lib/premium/useOpen";
import { describeApiError } from "@/lib/reading/errors";
import { premiumProgressPlans, premiumTeaserPlan } from "@/lib/reading/progress";
import { readTeaser, saveTeaser } from "@/lib/reading/teaserCache";
import type { DeepTarotPreviewData, DeepTarotReadingData } from "@/lib/reading/types";
import { useGeneration } from "@/lib/reading/useGeneration";
import { isDeepTarotPreview, isDeepTarotReading } from "@/lib/reading/validate";
import { saveChapter, useChapters } from "@/lib/storage/chapters";

const ID = "tarot-deep";
const acceptPreview = (data: unknown): data is { preview: DeepTarotPreviewData } =>
  typeof data === "object" && data !== null && isDeepTarotPreview((data as { preview?: unknown }).preview);

/**
 * 켈틱 크로스 10장's step 3 (Task 19, plan-reconciled §4.0): the question as built in the shared builder, the ten
 * cards the server dealt, the free preview (the ten keywords and 지금의 나; the browser check like the free
 * teasers), the locked contents and the open panel. Opening writes the two parts, keeps the reading on
 * this device and opens its chapter. A flow not standing on the ten cards goes back where it belongs.
 */
export function DeepResult({ instant, autoUnlock = false }: { instant: boolean; autoUnlock?: boolean }) {
  const router = useRouter();
  const { flow, setFlow } = useFlowState();
  const { spread, gate: spreadGate } = useFlowSpread(flow, setFlow);
  const chapters = useChapters();
  const account = useAccount();
  const status = usePremiumStatus();
  const gate = flow && spread === "deep" ? deepResultGate(flow) : null;
  const summary = gate === "ready" ? summarizeFlow(flow) : null;
  const draw = gate === "ready" ? flow?.draw : undefined;

  // A flow on the standard spread (or one premium is off for) reads on the standard screen; no question → the
  // ten-card builder; no ten cards for it → the draw.
  useEffect(() => {
    if (spread === "standard") router.replace(withFlags("/tarot/result", { instant }));
    else if (gate === "builder") router.replace(DEEP_BUILDER_HREF);
    else if (gate === "draw") router.replace(withFlags("/tarot/draw", { instant }));
  }, [spread, gate, instant, router]);

  // The design the reader sees: the reading quotes its picture, and the record shows the cards in it.
  const [deck] = useState(() => deckPrefs().front);
  const input = flow && summary && draw ? { drawToken: draw.drawToken, input: { ...tarotInput(flow, summary), deck } } : null;
  const teaserKey = input ? `${ID}|${JSON.stringify(input)}` : null;

  const teaserGen = useGeneration<{ preview: DeepTarotPreviewData }>();
  const [attempt, setAttempt] = useState(0);
  const [fresh, setFresh] = useState<{ key: string; data: DeepTarotPreviewData } | null>(null);
  const preview = teaserKey ? (fresh?.key === teaserKey ? fresh.data : readTeaser("premium", teaserKey, isDeepTarotPreview)) : null;

  // The free preview, written once per draw and question (kept for this tab: a reload shows it again). It goes
  // through postGeneration, so a 403 BOT_CHECK runs the Turnstile check like the free teasers.
  const { run: runTeaser, cancel: cancelTeaser } = teaserGen;
  useEffect(() => {
    if (!teaserKey || !input || readTeaser("premium", teaserKey, isDeepTarotPreview)) return;
    void runTeaser(premiumApiPath(ID, "teaser"), input, premiumTeaserPlan(ID), acceptPreview).then((result) => {
      if (!result?.ok) return;
      saveTeaser("premium", teaserKey, result.data.preview);
      setFresh({ key: teaserKey, data: result.data.preview });
    });
    return cancelTeaser;
  }, [teaserKey, attempt, runTeaser, cancelTeaser]);

  const positions = draw?.cards.map((card) => card.position) ?? [];
  const plans = premiumProgressPlans(ID, { positions });
  const keywords = new Map(preview?.cards.map((card) => [card.position, card.keyword]));
  // A purchase of it (unopened or being opened) opens when the free preview could not be written: the paid reading needs none.
  const holds = Boolean(account?.user && [...account.user.unused, ...account.user.opening].some((item) => item.productId === ID));
  const teaserFailed = !preview && teaserGen.state.status === "error";
  const opener = usePremiumOpen<DeepTarotReadingData>({
    id: ID,
    input,
    plans,
    returnTo: DEEP_RESULT_PATH,
    cleanHref: withFlags(DEEP_RESULT_PATH, { instant }),
    autoOpen: autoUnlock,
    ready: Boolean(preview) || (holds && teaserFailed),
    accept: isDeepTarotReading,
    // This flow's reading: the same question and the very same ten cards.
    matches: (chapter) => {
      const c = chapter as { kind?: string; question?: string; cards?: Array<{ cardId: string; orientation: string }> };
      return (
        c.kind === ID &&
        c.question === summary?.question &&
        JSON.stringify(c.cards?.map((x) => [x.cardId, x.orientation])) === JSON.stringify(draw?.cards.map((x) => [x.cardId, x.orientation]))
      );
    },
    save: (done) => {
      const { chapter } = saveChapter({
        kind: ID,
        question: summary!.question,
        conditions: summary!.conditions,
        note: summary!.note.trim(),
        cards: draw!.cards.map((card) => {
          const keyword = keywords.get(card.position);
          return keyword ? { ...card, keyword } : card;
        }),
        reading: done.reading,
        chapterToken: done.chapterToken,
        deck,
        ...(done.readingId ? { serverId: done.readingId } : {}),
      });
      // Bound to these cards, so this draw is never offered for sale again.
      setFlow((prev) => (prev.draw ? { ...prev, draw: { ...prev.draw, chapterId: chapter.id } } : prev));
      return chapter.serverId ?? chapter.id;
    },
    // The account's copy (after a cut-off, or 409 opened) binds the draw the same way, by its account id.
    onDelivered: (readingId) => setFlow((prev) => (prev.draw ? { ...prev, draw: { ...prev.draw, chapterId: readingId } } : prev)),
  });

  // After a failed opening the reason comes into view and takes focus.
  useEffect(() => {
    if (!opener.error) return;
    const reason = document.getElementById("unlock-error");
    reason?.scrollIntoView({ block: "center" });
    reason?.focus({ preventScroll: true });
  }, [opener.error]);

  // Bound by its id on this device or, for the account's copy, its account id.
  const openedId = draw?.chapterId ? chapters?.find((c) => c.id === draw.chapterId || c.serverId === draw.chapterId)?.id : undefined;
  const teaserState = teaserGen.state;
  const teaserError = !preview && teaserState.status === "error" ? describeApiError(teaserState.error, "teaser") : null;
  const busy = Boolean(account?.user?.opening.some((item) => item.productId === ID));
  // One live region for the whole screen: progress, then what went wrong.
  const announce = opener.running
    ? opener.running.progress.caption
    : opener.error
      ? opener.error.title
      : teaserState.status === "running"
        ? teaserState.progress.caption
        : (teaserError?.title ?? "");

  let content;
  if (!draw || !summary) {
    content = <Stepper step={3} label="카드 풀이" backHref="/" backLabel="홈으로" />;
  } else if (opener.running) {
    content = <PremiumProgress id={ID} part={opener.running.part} state={opener.running.progress} live={false} />;
  } else {
    const cards = draw.cards.map((card) => ({ ...card, keyword: keywords.get(card.position) }));
    const unlock = (
      <PremiumUnlock
        id={ID}
        account={account}
        status={status === null ? null : status?.[ID]}
        returnTo={DEEP_RESULT_PATH}
        onOpen={opener.open}
        resumable={opener.resumable}
        error={opener.error}
        refundHref={opener.method === "paid" && opener.error?.action === "retry" ? "/me#purchases" : undefined}
        redrawHref={withFlags("/tarot/draw", { instant })}
        openedHref={openedId ? `/chapter/${openedId}` : undefined}
        checking={opener.checking}
        onCheck={opener.stalled || (!opener.checking && busy) ? opener.recheck : undefined}
      />
    );
    content = (
      <>
        <Stepper step={3} label="카드 풀이" backHref="/" backLabel="홈으로" />
        <ReadingLayout
          head={
            <header className={s.head}>
              <SpreadChip>{PREMIUM[ID].entry}</SpreadChip>
              <h1 className={s.question}>{summary.question}</h1>
              <SituationSummary conditions={summary.conditions} note={summary.note} />
            </header>
          }
          spread={<CrossSpread cards={draw.cards} deck={deck} />}
        >
          <SpreadList title="카드 10장" cards={cards} deck={deck} />
          {preview ? (
            <>
              <Paper as="article" aria-labelledby="deep-now-title">
                <h2 id="deep-now-title" className={s.cardHeading}>
                  {preview.now.heading}
                </h2>
                <p className={s.prose}>{preview.now.body}</p>
              </Paper>
              <LockedToc
                items={preview.lockedToc}
                meta={`소제목 ${preview.lockedToc.length}개 · 약 ${approxCharsText({ min: PREMIUM[ID].approxChars, max: PREMIUM[ID].approxChars })}자`}
              />
              {unlock}
              <AiNote />
            </>
          ) : holds && teaserError ? (
            <>
              {unlock}
              <AiNote />
            </>
          ) : teaserError ? (
            <ErrorPanel view={teaserError} onRetry={() => setAttempt((n) => n + 1)} redrawHref={withFlags("/tarot/draw", { instant })} editHref={DEEP_BUILDER_HREF} />
          ) : (
            <GeneratingState
              kind="tarot-teaser"
              layout="inline"
              caption={teaserState.status === "running" ? teaserState.progress.caption : "카드를 읽고 있어요"}
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
      {spreadGate}
      <p className="sr-only" role="status">
        {announce}
      </p>
      {content}
    </>
  );
}
