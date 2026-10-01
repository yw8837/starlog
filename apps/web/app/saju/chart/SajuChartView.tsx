"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
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
import { SITE } from "@/lib/config";
import { commitQuota } from "@/lib/reading/api";
import { describeApiError } from "@/lib/reading/errors";
import { progressPlan } from "@/lib/reading/progress";
import { readTeaser, saveTeaser } from "@/lib/reading/teaserCache";
import type { SajuContext, SajuReadingResponse, SajuTeaserData } from "@/lib/reading/types";
import { useGeneration } from "@/lib/reading/useGeneration";
import { sajuContextBody, useSajuContext } from "@/lib/sajuFlow";
import type { SajuForm } from "@/lib/sajuForm";
import { SAJU_PROLOGUE_SECTIONS } from "@/lib/sajuPrologue";
import { countFullReading, markDayUsedUp, useRemainingToday } from "@/lib/storage/betaUsage";
import { historyFor, listChapters, saveChapter, useChapters } from "@/lib/storage/chapters";
import s from "./SajuChartView.module.css";
import { NEW_SAJU_HREF } from "@/lib/freshStart";

/** The body /api/saju/* take: birth data, the optional chips, and recent readings as history. */
function sajuBody(birth: SajuForm, context: SajuContext) {
  const history = historyFor(listChapters());
  return { birth, ...sajuContextBody(context), ...(history.length > 0 ? { history } : {}) };
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Step 2/2: the chart computed from the saved input (here, in the browser), then the free
 * reading written for it and the unlock. Opening writes the full reading, saves it on this device
 * and goes to it. With nothing saved, an example chart asks for the user's own birth data.
 */
export function SajuChartView() {
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
  const teaser = teaserKey ? (fresh?.key === teaserKey ? fresh.data : readTeaser<SajuTeaserData>("saju", teaserKey)) : null;

  // The free reading, written once per birth data and chips (kept for this tab).
  const { run: runTeaser, cancel: cancelTeaser } = teaserGen;
  useEffect(() => {
    if (!teaserKey || !own || readTeaser("saju", teaserKey)) return;
    void runTeaser("/api/saju/teaser", sajuBody(form, context), progressPlan("saju-teaser")).then((res) => {
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
  const unlockError = unlockGen.state.status === "error" ? describeApiError(unlockGen.state.error) : null;

  // After a failed unlock, bring the reason into view and focus it.
  useEffect(() => {
    if (!unlockError) return;
    const reason = document.getElementById("unlock-error");
    reason?.scrollIntoView({ block: "center" });
    reason?.focus({ preventScroll: true });
  }, [unlockError]);

  const unlock = async () => {
    if (!own || !teaser) return;
    window.scrollTo(0, 0);
    const plan = progressPlan("saju-reading", { sections: SAJU_PROLOGUE_SECTIONS });
    const res = await unlockGen.run("/api/saju/reading", sajuBody(form, context), plan);
    if (!res) return;
    if (!res.ok) {
      if (res.error.code === "BETA_LIMIT") markDayUsedUp();
      return;
    }
    countFullReading();
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
    });
    if (res.commit) void commitQuota(res.commit);
    router.push(`/chapter/${chapter.id}`);
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
        <UnlockSheet kind="saju" remaining={remaining} onUnlock={unlock} error={unlockError} editHref="/saju/new" openedHref={opened ? `/chapter/${opened.id}` : undefined} />
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
