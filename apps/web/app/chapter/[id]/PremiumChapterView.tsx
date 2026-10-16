"use client";

import { useMemo, type ReactNode } from "react";
import { MatchArticle } from "@/components/premium/MatchArticle";
import { CrossSpread } from "@/components/premium/CrossSpread";
import { DeepTarotArticle } from "@/components/premium/DeepTarotArticle";
import { NewYearArticle } from "@/components/premium/NewYearArticle";
import { AiNote } from "@/components/reading/AiNote";
import { ChartPanel } from "@/components/saju/ChartPanel";
import { InputLine } from "@/components/saju/InputLine";
import { chartFor } from "@/components/saju/useSajuChart";
import { Feedback } from "@/components/tarot/Feedback";
import { FollowUp } from "@/components/tarot/FollowUp";
import { ReadingLayout } from "@/components/tarot/ReadingLayout";
import { SpreadRow, faceUpCard } from "@/components/tarot/SpreadRow";
import { Stepper } from "@/components/tarot/Stepper";
import { kstMonthDay } from "@/lib/kst";
import { PREMIUM } from "@/lib/premium/products";
import type { NewYearChapter, PremiumChapter } from "@/lib/storage/chapters";
import { ChapterContents } from "./ChapterContents";
import type { ChapterFollowUp } from "./ChapterView";
import s from "./ChapterView.module.css";

type PremiumChapterViewProps = {
  chapter: PremiumChapter;
  followUp: ChapterFollowUp;
  /** 돌아보기, shown first when it is due. */
  checkin?: ReactNode;
  /** 풀이 후기 for a reading saved in the account; otherwise the plain stars. */
  rating?: ReactNode;
};

/** The 2027 chart beside the reading, recomputed from the birth it was written for (as the saju record does). */
function YearChart({ chapter }: { chapter: NewYearChapter }) {
  const result = useMemo(() => chartFor(chapter.birth), [chapter.birth]);
  return <ChartPanel result={result} />;
}

/**
 * An opened premium reading (P5) in one scroll, in the records' design: the product and date, the
 * question or theme, the cards or the chart beside the paid body, the five follow-ups, 돌아보기 and the
 * rating. No other product is offered here.
 */
export function PremiumChapterView({ chapter, followUp, checkin, rating }: PremiumChapterViewProps) {
  const eyebrow = `${PREMIUM[chapter.kind].name} · ${kstMonthDay(chapter.createdAt)}`;
  // The design the reading was written for; one saved before readings kept their deck was written for the 1909 scans.
  const deck = chapter.deck ?? "rws1909";
  let title: string;
  let spread: ReactNode;
  let spreadLabel = "뽑은 카드";
  let article: ReactNode;
  let line: ReactNode = null;
  if (chapter.kind === "tarot-deep") {
    title = chapter.question;
    spread = <CrossSpread cards={chapter.cards} deck={deck} />;
    article = <DeepTarotArticle reading={chapter.reading} cards={chapter.cards} deck={deck} showSpread={false} />;
  } else if (chapter.kind === "match") {
    title = `우리 사이 · ${chapter.relationLabel}`;
    spread = <SpreadRow size="sm" cards={chapter.cards.map(faceUpCard)} deck={deck} />;
    article = <MatchArticle reading={chapter.reading} cards={chapter.cards} deck={deck} />;
  } else {
    title = `2027년, ${chapter.title}`;
    spreadLabel = "명식";
    spread = <YearChart chapter={chapter} />;
    article = <NewYearArticle reading={chapter.reading} />;
    line = <InputLine form={chapter.birth} className={s.question} />;
  }

  return (
    <>
      <Stepper label="내 기록" backHref="/story" backLabel="내 기록으로" />
      <ReadingLayout
        spreadLabel={spreadLabel}
        head={
          <header className={s.head}>
            <p className={s.eyebrow}>{eyebrow}</p>
            <h1 className={s.title}>{title}</h1>
            {line}
          </header>
        }
        spread={spread}
      >
        {checkin}
        <ChapterContents />
        <div id="chapter-reading" className={s.anchor}>
          {article}
        </div>
        <div id="chapter-follow-up" className={s.anchor}>
          <FollowUp {...followUp} reader={chapter.kind === "tarot-deep" ? "cat" : "rabbit"} />
        </div>
        {rating ?? <Feedback />}
        <AiNote />
      </ReadingLayout>
    </>
  );
}
