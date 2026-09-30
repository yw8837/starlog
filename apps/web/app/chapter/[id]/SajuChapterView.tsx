"use client";

import { useMemo, type ReactNode } from "react";
import { AiNote } from "@/components/reading/AiNote";
import { ChartPanel } from "@/components/saju/ChartPanel";
import { InputLine } from "@/components/saju/InputLine";
import { chartFor } from "@/components/saju/useSajuChart";
import { Feedback } from "@/components/tarot/Feedback";
import { FollowUp } from "@/components/tarot/FollowUp";
import { Paper } from "@/components/tarot/Paper";
import { ReadingLayout } from "@/components/tarot/ReadingLayout";
import { Stepper } from "@/components/tarot/Stepper";
import { Button } from "@/components/ui/Button";
import { ShareButton } from "@/components/ui/ShareButton";
import { SITE } from "@/lib/config";
import type { SajuReadingData } from "@/lib/reading/types";
import type { SajuForm } from "@/lib/sajuForm";
import { ChapterContents } from "./ChapterContents";
import type { ChapterFollowUp } from "./ChapterView";
import s from "./ChapterView.module.css";

type SajuChapterViewProps = {
  /** e.g. "사주 기록 · 10월 1일" */
  eyebrow: string;
  title: string;
  /** The birth data the reading was written for (its chart is recomputed here, not the current profile). */
  birth: SajuForm;
  reading: SajuReadingData;
  followUp: ChapterFollowUp;
  /** 돌아보기, shown first when it is due. */
  checkin?: ReactNode;
};

/** "월령과 뿌리 · 태·장생·건록으로 본 한겨울의 해" → a short label and the heading proper. */
function splitHeading(heading: string): { label: string | null; title: string } {
  const at = heading.indexOf(" · ");
  return at < 0 ? { label: null, title: heading } : { label: heading.slice(0, at), title: heading.slice(at + 3) };
}

/** An opened saju reading in one scroll: the chart, the sections, follow-ups, rating, and a way on to tarot. */
export function SajuChapterView({ eyebrow, title, birth, reading, followUp, checkin }: SajuChapterViewProps) {
  const result = useMemo(() => chartFor(birth), [birth]);
  const sections = reading.observation ? [...reading.sections, reading.observation] : reading.sections;

  return (
    <>
      <Stepper label="내 기록" backHref="/story" backLabel="내 기록으로" />
      <ReadingLayout
        spreadLabel="명식"
        head={
          <header className={s.head}>
            <p className={s.eyebrow}>{eyebrow}</p>
            <h1 className={s.title}>{title}</h1>
            <InputLine form={birth} className={s.question} />
            {/* Only the title and the site are shared, never the birth data above. */}
            <div className={s.share}>
              <ShareButton text={`나의 ${SITE.nameKo} · ${title}`} />
            </div>
          </header>
        }
        spread={<ChartPanel result={result} />}
      >
        {checkin}
        <ChapterContents />
        <div id="chapter-reading" className={`${s.sections} ${s.anchor}`}>
          {sections.map((section) => {
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
        <div id="chapter-follow-up" className={s.anchor}>
          <FollowUp {...followUp} reader="rabbit" />
        </div>
        <Feedback />
        <AiNote />

        <section className={s.invite} aria-labelledby="next-title">
          <h2 id="next-title" className={s.inviteTitle}>
            카드로 이어서 보기
          </h2>
          <p className={s.inviteText}>요즘 마음에 걸리는 일 하나를 카드 세 장으로 물어봐요.</p>
          <Button href="/tarot/new" block trailing="→">
            타로 보기
          </Button>
        </section>
      </ReadingLayout>
    </>
  );
}
