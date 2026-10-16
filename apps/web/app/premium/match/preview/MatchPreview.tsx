"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PairCharts } from "@/components/premium/PairCharts";
import { PremiumProgress } from "@/components/premium/PremiumProgress";
import { PremiumUnlock } from "@/components/premium/PremiumUnlock";
import { SpreadList } from "@/components/premium/SpreadList";
import v from "@/components/premium/preview.module.css";
import { AiNote } from "@/components/reading/AiNote";
import { ErrorPanel } from "@/components/reading/ErrorPanel";
import { GeneratingState } from "@/components/tarot/GeneratingState";
import { LockedToc } from "@/components/tarot/LockedToc";
import { Paper } from "@/components/tarot/Paper";
import { Stepper } from "@/components/tarot/Stepper";
import s from "@/app/tarot/result/FreeResult.module.css";
import { useAccount } from "@/lib/account/client";
import { withFlags } from "@/lib/flowState";
import { approxCharsText } from "@/lib/pricing";
import { premiumApiPath } from "@/lib/premium/client";
import { clearMatchFlow, matchBody, matchReady, relationLabel, useMatchFlow } from "@/lib/premium/matchFlow";
import { PREMIUM } from "@/lib/premium/products";
import { usePremiumStatus } from "@/lib/premium/status";
import { usePremiumOpen } from "@/lib/premium/useOpen";
import { describeApiError } from "@/lib/reading/errors";
import { premiumProgressPlans, premiumTeaserPlan } from "@/lib/reading/progress";
import { clearPremiumTeaser, readTeaser, saveTeaser } from "@/lib/reading/teaserCache";
import type { MatchPreviewData, MatchReadingData } from "@/lib/reading/types";
import { useGeneration } from "@/lib/reading/useGeneration";
import { isMatchPreview, isMatchReading } from "@/lib/reading/validate";
import { saveChapter, useChapters } from "@/lib/storage/chapters";

const ID = "match";
const PREVIEW_PATH = "/premium/match/preview";
/** The 궁합 reading quotes the 1909 pictures: its request carries no card design (lib/premium/inputs.ts MatchBody). */
const DECK = "rws1909";
/** A birth as both sides write it, whatever the key order. */
const birthKey = (b: unknown) => {
  const x = (b ?? {}) as Record<string, unknown>;
  return JSON.stringify([x.calendar, x.year, x.month, x.day, x.isLeapMonth, x.timeKnown, x.hour, x.minute, x.gender]);
};
const acceptPreview = (data: unknown): data is { preview: MatchPreviewData } =>
  typeof data === "object" && data !== null && isMatchPreview((data as { preview?: unknown }).preview);

/**
 * 우리 사이 궁합's step 3 (Task 20): both computed charts side by side, the lines code wrote from them, the five
 * cards with their keywords, the free summary, the locked contents and the open panel. Opening writes the
 * two parts and keeps the reading on this device; then the tab forgets the flow and its preview, so the
 * other person's birth lives only in the user's own chapter (P5 spec §9).
 */
export function MatchPreview({ instant, autoUnlock = false }: { instant: boolean; autoUnlock?: boolean }) {
  const router = useRouter();
  const { flow } = useMatchFlow();
  const chapters = useChapters();
  const account = useAccount();
  const status = usePremiumStatus();
  const ready = flow ? matchReady(flow) : null;
  // Once the reading is kept the flow is cleared on purpose: the chapter opens, the form is not shown again.
  const left = useRef(false);

  useEffect(() => {
    if (left.current) return;
    if (ready === "form") router.replace("/premium/match/new");
    else if (ready === "draw") router.replace(withFlags("/premium/match/draw", { instant }));
  }, [ready, instant, router]);

  const body = ready === "ready" && flow ? matchBody(flow) : null;
  const teaserKey = body ? `${ID}|${JSON.stringify(body)}` : null;
  const teaserGen = useGeneration<{ preview: MatchPreviewData }>();
  const [attempt, setAttempt] = useState(0);
  const [fresh, setFresh] = useState<{ key: string; data: MatchPreviewData } | null>(null);
  const preview = teaserKey ? (fresh?.key === teaserKey ? fresh.data : readTeaser("premium", teaserKey, isMatchPreview)) : null;

  // The free preview once per answers and cards (kept for this tab), through the browser check like the free teasers.
  const { run: runTeaser, cancel: cancelTeaser } = teaserGen;
  useEffect(() => {
    if (!teaserKey || !body || readTeaser("premium", teaserKey, isMatchPreview)) return;
    void runTeaser(premiumApiPath(ID, "teaser"), body, premiumTeaserPlan(ID), acceptPreview).then((result) => {
      if (!result?.ok) return;
      saveTeaser("premium", teaserKey, result.data.preview);
      setFresh({ key: teaserKey, data: result.data.preview });
    });
    return cancelTeaser;
  }, [teaserKey, attempt, runTeaser, cancelTeaser]);

  const draw = flow?.draw;
  const plans = premiumProgressPlans(ID, { positions: draw?.cards.map((card) => card.position) ?? [] });
  const keywords = new Map(preview?.cards.map((card) => [card.position, card.keyword]));
  // A purchase of it (unopened or being opened) opens when the free preview could not be written: the paid reading needs none.
  const holds = Boolean(account?.user && [...account.user.unused, ...account.user.opening].some((item) => item.productId === ID));
  const teaserFailed = !preview && teaserGen.state.status === "error";
  const opener = usePremiumOpen<MatchReadingData>({
    id: ID,
    input: body,
    plans,
    returnTo: PREVIEW_PATH,
    cleanHref: withFlags(PREVIEW_PATH, { instant }),
    autoOpen: autoUnlock,
    ready: Boolean(preview) || (holds && teaserFailed),
    accept: isMatchReading,
    // This flow's reading: the same relation, the same other person and the very same five cards.
    matches: (chapter) => {
      const c = chapter as { kind?: string; relation?: string; partner?: { birth?: unknown }; cards?: Array<{ cardId: string; orientation: string }> };
      return (
        c.kind === ID &&
        c.relation === flow?.relation &&
        birthKey(c.partner?.birth) === birthKey(flow?.partner) &&
        JSON.stringify(c.cards?.map((x) => [x.cardId, x.orientation])) === JSON.stringify(draw?.cards.map((x) => [x.cardId, x.orientation]))
      );
    },
    save: (done) => {
      const { chapter } = saveChapter({
        kind: ID,
        relation: flow!.relation!,
        relationLabel: relationLabel(flow!.relation!),
        ...(body!.partner.label ? { partnerLabel: body!.partner.label } : {}),
        me: { birth: flow!.me! },
        partner: { birth: flow!.partner! },
        ...(body!.concern ? { concern: body!.concern } : {}),
        cards: draw!.cards.map((card) => {
          const keyword = keywords.get(card.position);
          return keyword ? { ...card, keyword } : card;
        }),
        reading: done.reading,
        chapterToken: done.chapterToken,
        ...(done.readingId ? { serverId: done.readingId } : {}),
      });
      // The other person's birth leaves the tab: it lives in the user's own chapter only.
      left.current = true;
      clearMatchFlow();
      clearPremiumTeaser();
      return chapter.serverId ?? chapter.id;
    },
  });

  useEffect(() => {
    if (!opener.error) return;
    const reason = document.getElementById("unlock-error");
    reason?.scrollIntoView({ block: "center" });
    reason?.focus({ preventScroll: true });
  }, [opener.error]);

  const openedId = draw?.chapterId && chapters?.some((c) => c.id === draw.chapterId) ? draw.chapterId : undefined;
  const teaserState = teaserGen.state;
  const teaserError = !preview && teaserState.status === "error" ? describeApiError(teaserState.error, "teaser") : null;
  const busy = Boolean(account?.user?.opening.some((item) => item.productId === ID));
  const announce = opener.running
    ? opener.running.progress.caption
    : opener.error
      ? opener.error.title
      : teaserState.status === "running"
        ? teaserState.progress.caption
        : (teaserError?.title ?? "");

  const stepper = <Stepper step={3} total={3} label={PREMIUM[ID].name} backHref="/premium/match/new" backLabel="궁합 정보로" />;
  let content;
  if (!body || !flow?.relation || !draw) {
    content = stepper;
  } else if (opener.running) {
    content = <PremiumProgress id={ID} part={opener.running.part} state={opener.running.progress} live={false} />;
  } else {
    const cards = draw.cards.map((card) => ({ ...card, keyword: keywords.get(card.position) }));
    const unlock = (
      <PremiumUnlock
        id={ID}
        account={account}
        status={status === null ? null : status?.[ID]}
        returnTo={PREVIEW_PATH}
        onOpen={opener.open}
        resumable={opener.resumable}
        error={opener.error}
        refundHref={opener.method === "paid" && opener.error?.action === "retry" ? "/me#purchases" : undefined}
        redrawHref={withFlags("/premium/match/draw", { instant })}
        openedHref={openedId ? `/chapter/${openedId}` : undefined}
        checking={opener.checking}
        onCheck={opener.stalled || (!opener.checking && busy) ? opener.recheck : undefined}
      />
    );
    content = (
      <>
        {stepper}
        <header className={s.head}>
          <h1 className={s.question}>{`우리 사이 · ${relationLabel(flow.relation)}`}</h1>
        </header>
        {preview ? (
          <>
            <PairCharts me={preview.charts.me} partner={preview.charts.partner} partnerLabel={body.partner.label} />
            <ul className={v.facts} aria-label="두 사람의 명식에서">
              {preview.facts.map((fact) => (
                <li key={fact} className={v.fact}>
                  {fact}
                </li>
              ))}
            </ul>
            <SpreadList title="카드 5장" cards={cards} deck={DECK} />
            <Paper as="article" aria-labelledby="match-summary-title">
              <h2 id="match-summary-title" className={s.cardHeading}>
                {preview.summary.heading}
              </h2>
              <p className={s.prose}>{preview.summary.body}</p>
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
            <SpreadList title="카드 5장" cards={cards} deck={DECK} />
            {unlock}
            <AiNote />
          </>
        ) : teaserError ? (
          <ErrorPanel
            view={teaserError}
            onRetry={() => setAttempt((n) => n + 1)}
            redrawHref={withFlags("/premium/match/draw", { instant })}
            editHref="/premium/match/new"
          />
        ) : (
          <>
            <SpreadList title="카드 5장" cards={cards} deck={DECK} />
            <GeneratingState
              mode="saju"
              kind="saju-teaser"
              layout="inline"
              caption={teaserState.status === "running" ? teaserState.progress.caption : "두 사람의 명식을 나란히 놓고 있어요"}
              fraction={teaserState.status === "running" ? teaserState.progress.fraction : 0}
              live={false}
            />
          </>
        )}
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
