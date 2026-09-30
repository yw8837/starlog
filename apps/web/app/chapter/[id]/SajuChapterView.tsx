"use client";

import { useState } from "react";
import { Rabbit } from "@/components/characters/Rabbit";
import { ChartPanel } from "@/components/saju/ChartPanel";
import { InputLine } from "@/components/saju/InputLine";
import { useSajuChart } from "@/components/saju/useSajuChart";
import { Feedback } from "@/components/tarot/Feedback";
import { FollowUp } from "@/components/tarot/FollowUp";
import { GeneratingState } from "@/components/tarot/GeneratingState";
import { Paper } from "@/components/tarot/Paper";
import { ReadingLayout } from "@/components/tarot/ReadingLayout";
import { Stepper } from "@/components/tarot/Stepper";
import { StoryPage } from "@/components/tarot/StoryPage";
import { StoryToggle, type ReadingMode } from "@/components/tarot/StoryToggle";
import { Button } from "@/components/ui/Button";
import { SITE } from "@/lib/config";
import type { SAJU_FOLLOW_UPS, SajuSample } from "@/lib/fixtures";
import s from "./ChapterView.module.css";

type SajuChapterViewProps = {
  sample: SajuSample;
  followUps: typeof SAJU_FOLLOW_UPS;
  /** e.g. "프롤로그" */
  chapterLabel: string;
  /** Show the writing state first (arriving from an unlock). */
  generate: boolean;
};

/** "월령과 뿌리 · 태·장생·건록으로 본 한겨울의 해" → a short label and the heading proper. */
function splitHeading(heading: string): { label: string | null; title: string } {
  const at = heading.indexOf(" · ");
  return at < 0 ? { label: null, title: heading } : { label: heading.slice(0, at), title: heading.slice(at + 3) };
}

/**
 * The opened saju prologue. The written sample (sections or story page, follow-ups, rating, next
 * chapter) appears only when the saved chart is the sample chart. Any other chart shows its own
 * computed chart and a calm "being written" state: P3 plugs the real, asynchronous generation in here.
 */
export function SajuChapterView({ sample, followUps, chapterLabel, generate }: SajuChapterViewProps) {
  const [writing, setWriting] = useState(generate);
  const [mode, setMode] = useState<ReadingMode>("plain");
  const { form, ready, result, isSample } = useSajuChart();

  const doneWriting = () => {
    setWriting(false);
    // Drop ?from=unlock so a reload shows the chapter instead of writing it again.
    window.history.replaceState(null, "", window.location.pathname);
    window.scrollTo(0, 0);
  };

  if (writing) return <GeneratingState mode="saju" onDone={doneWriting} />;

  const bookTitle = `나의 ${SITE.nameKo}`;
  const title = !ready ? " " : isSample ? sample.free.title : "나의 프롤로그";

  return (
    <>
      <Stepper label={bookTitle} backHref="/story" backLabel="내 이야기로" />
      <ReadingLayout
        spreadLabel="명식"
        head={
          <header className={s.head}>
            <p className={s.eyebrow}>{`${bookTitle} · ${chapterLabel}`}</p>
            <h1 className={s.title}>{title}</h1>
            <InputLine form={ready ? form : null} className={s.question} />
          </header>
        }
        spread={<ChartPanel result={result} />}
      >
        {!ready || !result || "error" in result ? null : isSample ? (
          <>
            <div className={s.toggle}>
              <StoryToggle value={mode} onChange={setMode} />
            </div>

            {mode === "plain" ? (
              <div className={s.sections}>
                {sample.paid.sections.map((section) => {
                  const { label, title: heading } = splitHeading(section.heading);
                  return (
                    <Paper key={section.heading} as="article">
                      <h2 className={s.sectionHeading}>
                        {label ? <span className={s.sectionLabel}>{label}</span> : null}
                        <span>{heading}</span>
                      </h2>
                      <p className={s.prose}>{section.body}</p>
                    </Paper>
                  );
                })}
              </div>
            ) : (
              <StoryPage mode="saju" title={sample.story.title} body={sample.story.body} />
            )}

            <FollowUp suggestions={followUps.suggestions} answer={followUps.answer} reader="rabbit" />
            <Feedback />

            <section className={s.invite} aria-labelledby="next-title">
              <h2 id="next-title" className={s.inviteTitle}>
                이야기의 다음 장
              </h2>
              <p className={s.inviteText}>요즘 마음에 걸리는 일 하나를 카드 세 장으로 이어서 적어 봐요.</p>
              <Button href="/tarot/new" block trailing="→">
                새 장 열기
              </Button>
            </section>
          </>
        ) : (
          <section className={s.pending} aria-labelledby="pending-title">
            <Rabbit outfit="hanbok" action="write" expression="focus" size={150} reactOnTap={false} />
            <p id="pending-title" className={s.pendingText} role="status">
              풀이를 적고 있어요. 다 적으면 내 이야기에 넣어 둘게요.
            </p>
            <Button href="/story" variant="secondary">
              내 이야기로
            </Button>
          </section>
        )}
      </ReadingLayout>
    </>
  );
}
