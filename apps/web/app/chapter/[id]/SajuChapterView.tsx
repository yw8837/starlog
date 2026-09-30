"use client";

import { useState } from "react";
import { ChartPanel } from "@/components/saju/ChartPanel";
import { InputLine } from "@/components/saju/InputLine";
import { useSajuChart } from "@/components/saju/useSajuChart";
import { Feedback } from "@/components/tarot/Feedback";
import { GeneratingState } from "@/components/tarot/GeneratingState";
import { Paper } from "@/components/tarot/Paper";
import { ReadingLayout } from "@/components/tarot/ReadingLayout";
import { Stepper } from "@/components/tarot/Stepper";
import { StoryPage } from "@/components/tarot/StoryPage";
import { StoryToggle, type ReadingMode } from "@/components/tarot/StoryToggle";
import { Button } from "@/components/ui/Button";
import { SITE } from "@/lib/config";
import type { SajuSample } from "@/lib/fixtures";
import s from "./ChapterView.module.css";

type SajuChapterViewProps = {
  sample: SajuSample;
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

/** The opened saju prologue: the chart on the side, the paid sections (or the story page), rating, next chapter. */
export function SajuChapterView({ sample, chapterLabel, generate }: SajuChapterViewProps) {
  const [writing, setWriting] = useState(generate);
  const [mode, setMode] = useState<ReadingMode>("plain");
  const { form, ready, result } = useSajuChart();

  const doneWriting = () => {
    setWriting(false);
    // Drop ?from=unlock so a reload shows the chapter instead of writing it again.
    window.history.replaceState(null, "", window.location.pathname);
    window.scrollTo(0, 0);
  };

  if (writing) return <GeneratingState mode="saju" onDone={doneWriting} />;

  const bookTitle = `나의 ${SITE.nameKo}`;

  return (
    <>
      <Stepper label={bookTitle} backHref="/story" backLabel="내 이야기로" />
      <ReadingLayout
        spreadLabel="명식"
        head={
          <header className={s.head}>
            <p className={s.eyebrow}>{`${bookTitle} · ${chapterLabel}`}</p>
            <h1 className={s.title}>{sample.free.title}</h1>
            <InputLine form={ready ? form : null} className={s.question} />
          </header>
        }
        spread={<ChartPanel result={result} />}
      >
        <div className={s.toggle}>
          <StoryToggle value={mode} onChange={setMode} />
        </div>

        {mode === "plain" ? (
          <div className={s.sections}>
            {sample.paid.sections.map((section) => {
              const { label, title } = splitHeading(section.heading);
              return (
                <Paper key={section.heading} as="article">
                  <h2 className={s.sectionHeading}>
                    {label ? <span className={s.sectionLabel}>{label}</span> : null}
                    <span>{title}</span>
                  </h2>
                  <p className={s.prose}>{section.body}</p>
                </Paper>
              );
            })}
          </div>
        ) : (
          <StoryPage mode="saju" title={sample.story.title} body={sample.story.body} />
        )}

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
      </ReadingLayout>
    </>
  );
}
