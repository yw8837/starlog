"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PremiumProgress } from "@/components/premium/PremiumProgress";
import { PremiumUnlock } from "@/components/premium/PremiumUnlock";
import v from "@/components/premium/preview.module.css";
import { AiNote } from "@/components/reading/AiNote";
import { ErrorPanel } from "@/components/reading/ErrorPanel";
import { GeneratingState } from "@/components/tarot/GeneratingState";
import { LockedToc } from "@/components/tarot/LockedToc";
import { Paper } from "@/components/tarot/Paper";
import { Stepper } from "@/components/tarot/Stepper";
import s from "@/app/tarot/result/FreeResult.module.css";
import { useAccount } from "@/lib/account/client";
import { approxCharsText } from "@/lib/pricing";
import { premiumApiPath } from "@/lib/premium/client";
import { opensAtText } from "@/lib/premium/offer";
import { PREMIUM } from "@/lib/premium/products";
import { usePremiumStatus } from "@/lib/premium/status";
import { usePremiumOpen } from "@/lib/premium/useOpen";
import { describeApiError } from "@/lib/reading/errors";
import { premiumProgressPlans, premiumTeaserPlan } from "@/lib/reading/progress";
import { readTeaser, saveTeaser } from "@/lib/reading/teaserCache";
import type { NewYearPreviewData, NewYearReadingData } from "@/lib/reading/types";
import { useGeneration } from "@/lib/reading/useGeneration";
import { isNewYearPreview, isNewYearReading } from "@/lib/reading/validate";
import { sajuStatusBody, useSajuContext, useSajuProfile } from "@/lib/sajuFlow";
import { saveChapter, useChapters } from "@/lib/storage/chapters";

const ID = "newyear-2027";
const PREVIEW_PATH = "/premium/newyear-2027/preview";
const acceptPreview = (data: unknown): data is { preview: NewYearPreviewData } =>
  typeof data === "object" && data !== null && isNewYearPreview((data as { preview?: unknown }).preview);
/** A birth as both sides write it, whatever the key order. */
const birthKey = (b: unknown) => {
  const x = (b ?? {}) as Record<string, unknown>;
  return JSON.stringify([x.calendar, x.year, x.month, x.day, x.isLeapMonth, x.timeKnown, x.hour, x.minute, x.gender, x.placeId]);
};

/**
 * 2027 신년운세's step 2 (Task 21): the year's theme ("2027년, <title>"), the three lines code computed, the
 * free summary, the 21 locked headings and the open panel. Before 2026-11-15 00:00 KST the preview's 409
 * says when it opens instead of an error. Opening writes the three parts and opens the chapter.
 */
export function NewYearPreview({ autoUnlock = false }: { autoUnlock?: boolean }) {
  const router = useRouter();
  const { profile } = useSajuProfile();
  const context = useSajuContext();
  const account = useAccount();
  const status = usePremiumStatus();
  const chapters = useChapters();

  useEffect(() => {
    if (profile === null) router.replace("/premium/newyear-2027/new");
  }, [profile, router]);

  const fields = context ? sajuStatusBody(context) : null;
  const body = profile && fields ? { birth: profile, ...fields } : null;
  const teaserKey = body ? `${ID}|${JSON.stringify(body)}` : null;
  const teaserGen = useGeneration<{ preview: NewYearPreviewData }>();
  const [attempt, setAttempt] = useState(0);
  const [fresh, setFresh] = useState<{ key: string; data: NewYearPreviewData } | null>(null);
  const preview = teaserKey ? (fresh?.key === teaserKey ? fresh.data : readTeaser("premium", teaserKey, isNewYearPreview)) : null;

  // The free preview once per birth and chips (kept for this tab), through the browser check like the free teasers.
  const { run: runTeaser, cancel: cancelTeaser } = teaserGen;
  useEffect(() => {
    if (!teaserKey || !body || readTeaser("premium", teaserKey, isNewYearPreview)) return;
    void runTeaser(premiumApiPath(ID, "teaser"), body, premiumTeaserPlan(ID), acceptPreview).then((result) => {
      if (!result?.ok) return;
      saveTeaser("premium", teaserKey, result.data.preview);
      setFresh({ key: teaserKey, data: result.data.preview });
    });
    return cancelTeaser;
  }, [teaserKey, attempt, runTeaser, cancelTeaser]);

  // A purchase of it (unopened or being opened) opens when the free preview could not be written: the paid reading needs none.
  const holds = Boolean(account?.user && [...account.user.unused, ...account.user.opening].some((item) => item.productId === ID));
  const teaserFailed = !preview && teaserGen.state.status === "error";
  const opener = usePremiumOpen<NewYearReadingData>({
    id: ID,
    input: body,
    plans: premiumProgressPlans(ID),
    returnTo: PREVIEW_PATH,
    autoOpen: autoUnlock,
    ready: Boolean(preview) || (holds && teaserFailed),
    accept: isNewYearReading,
    matches: (chapter) => {
      const c = chapter as { kind?: string; birth?: unknown };
      return c.kind === ID && birthKey(c.birth) === birthKey(profile);
    },
    save: (done) => {
      const { chapter } = saveChapter({
        kind: ID,
        birth: profile!,
        title: done.reading.title,
        ...(fields && Object.keys(fields).length ? { context: fields } : {}),
        reading: done.reading,
        chapterToken: done.chapterToken,
        ...(done.readingId ? { serverId: done.readingId } : {}),
      });
      return chapter.serverId ?? chapter.id;
    },
  });

  useEffect(() => {
    if (!opener.error) return;
    const reason = document.getElementById("unlock-error");
    reason?.scrollIntoView({ block: "center" });
    reason?.focus({ preventScroll: true });
  }, [opener.error]);

  const teaserState = teaserGen.state;
  const failed = !preview && teaserState.status === "error" ? teaserState.error : null;
  // Not open yet (before 2026-11-15 for everyone but the owner pass): when it opens, not an error.
  const notYet = failed?.code === "NOT_AVAILABLE" ? opensAtText(PREMIUM[ID].opensAt ?? Date.now()) : null;
  const teaserError = failed && !notYet ? describeApiError(failed, "teaser") : null;
  const busy = Boolean(account?.user?.opening.some((item) => item.productId === ID));
  // This birth's year was opened already: offer that reading, not the payment again (review 2026-10-16 #2). A second
  // purchase held for it still opens.
  const opened = profile ? chapters?.find((c) => c.kind === ID && birthKey(c.birth) === birthKey(profile)) : undefined;
  const openedHref = opened && !account?.user?.unused.some((item) => item.productId === ID) ? `/chapter/${opened.id}` : undefined;
  const announce = opener.running
    ? opener.running.progress.caption
    : opener.error
      ? opener.error.title
      : teaserState.status === "running"
        ? teaserState.progress.caption
        : (notYet ?? teaserError?.title ?? "");

  const stepper = <Stepper step={2} total={2} label={PREMIUM[ID].name} backHref="/premium/newyear-2027/new" backLabel="태어난 날로" />;
  let content;
  if (!body) {
    content = stepper;
  } else if (opener.running) {
    content = <PremiumProgress id={ID} part={opener.running.part} state={opener.running.progress} live={false} />;
  } else {
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
        openedHref={openedHref}
        checking={opener.checking}
        onCheck={opener.stalled || (!opener.checking && busy) ? opener.recheck : undefined}
      />
    );
    content = (
      <>
        {stepper}
        {preview ? (
          <>
            <header className={s.head}>
              <h1 className={s.question}>{`2027년, ${preview.title}`}</h1>
            </header>
            <ul className={v.facts} aria-label="2027년과 나의 명식에서">
              {preview.facts.map((fact) => (
                <li key={fact} className={v.fact}>
                  {fact}
                </li>
              ))}
            </ul>
            <Paper as="article" aria-labelledby="ny-summary-title">
              <h2 id="ny-summary-title" className={s.cardHeading}>
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
            <header className={s.head}>
              <h1 className={s.question}>2027년 미리 보기</h1>
            </header>
            {unlock}
            <AiNote />
          </>
        ) : (
          <>
            <header className={s.head}>
              <h1 className={s.question}>2027년 미리 보기</h1>
            </header>
            {notYet ? (
              <p className={v.soon}>{notYet}</p>
            ) : teaserError ? (
              <ErrorPanel view={teaserError} onRetry={() => setAttempt((n) => n + 1)} editHref="/premium/newyear-2027/new" />
            ) : (
              <GeneratingState
                mode="saju"
                kind="saju-teaser"
                layout="inline"
                caption={teaserState.status === "running" ? teaserState.progress.caption : "2027년의 흐름을 살피고 있어요"}
                fraction={teaserState.status === "running" ? teaserState.progress.fraction : 0}
                live={false}
              />
            )}
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
