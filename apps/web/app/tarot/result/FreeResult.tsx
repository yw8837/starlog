"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
import { SITE } from "@/lib/config";
import { resultGate, summarizeFlow, tarotInput, useFlowState, withFlags } from "@/lib/flowState";
import { commitQuota } from "@/lib/reading/api";
import { describeApiError } from "@/lib/reading/errors";
import { progressPlan } from "@/lib/reading/progress";
import { readTeaser, saveTeaser } from "@/lib/reading/teaserCache";
import type { TarotInput, TarotReadingResponse, TarotTeaserData } from "@/lib/reading/types";
import { useGeneration } from "@/lib/reading/useGeneration";
import { countFullReading, markDayUsedUp, useRemainingToday } from "@/lib/storage/betaUsage";
import { historyFor, listChapters, saveChapter, useChapters } from "@/lib/storage/chapters";
import s from "./FreeResult.module.css";

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
 */
export function FreeResult({ instant }: { instant: boolean }) {
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
  const teaser = teaserKey ? (fresh?.key === teaserKey ? fresh.data : readTeaser<TarotTeaserData>("tarot", teaserKey)) : null;

  // The free teaser, written once per draw and question (kept for this tab, so a reload shows it
  // again). Keyed by what it is written for: the draw and the input are both in the key.
  const { run: runTeaser, cancel: cancelTeaser } = teaserGen;
  useEffect(() => {
    if (!teaserKey || !draw || !input || readTeaser("tarot", teaserKey)) return;
    const plan = progressPlan("tarot-teaser", { positions: draw.cards.map((card) => card.position) });
    void runTeaser("/api/tarot/teaser", { drawToken: draw.drawToken, input: withHistory(input) }, plan).then((result) => {
      if (!result?.ok) return;
      saveTeaser("tarot", teaserKey, result.data);
      setFresh({ key: teaserKey, data: result.data });
      if (result.commit) void commitQuota(result.commit);
    });
    return cancelTeaser;
  }, [teaserKey, attempt, runTeaser, cancelTeaser]);

  const openedId = draw?.chapterId && chapters?.some((chapter) => chapter.id === draw.chapterId) ? draw.chapterId : undefined;
  const unlockError = unlockGen.state.status === "error" ? describeApiError(unlockGen.state.error) : null;

  // After a failed unlock the result comes back; bring the reason into view and focus it.
  useEffect(() => {
    if (!unlockError) return;
    const reason = document.getElementById("unlock-error");
    reason?.scrollIntoView({ block: "center" });
    reason?.focus({ preventScroll: true });
  }, [unlockError]);

  const unlock = async () => {
    if (!draw || !input || !summary) return;
    window.scrollTo(0, 0);
    const plan = progressPlan("tarot-reading", { positions });
    const result = await unlockGen.run("/api/tarot/reading", { drawToken: draw.drawToken, input: withHistory(input) }, plan);
    if (!result) return;
    if (!result.ok) {
      if (result.error.code === "BETA_LIMIT") markDayUsedUp();
      return;
    }
    countFullReading();
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
    });
    setFlow((prev) => (prev.draw ? { ...prev, draw: { ...prev.draw, chapterId: chapter.id } } : prev));
    if (result.commit) void commitQuota(result.commit);
    router.push(`/chapter/${chapter.id}`);
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
                remaining={remaining}
                onUnlock={unlock}
                error={unlockError}
                redrawHref={withFlags("/tarot/draw", { instant })}
                editHref="/tarot/new"
                openedHref={openedId ? `/chapter/${openedId}` : undefined}
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
