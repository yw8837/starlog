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
import { PrintFoot, PrintHead, SavePdfButton } from "@/components/share/SavePdfButton";
import { ShareImageButton } from "@/components/ui/ShareImageButton";
import { absoluteUrl } from "@/lib/hosts";
import { kstMonthDay } from "@/lib/kst";
import { MATCH_RELATION_OPTIONS } from "@/lib/premium/matchFlow";
import { SITE } from "@/lib/config";
import { PREMIUM, premiumShareHref } from "@/lib/premium/products";
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
  /** The record reads whole: it may make its share image. */
  shareable?: boolean;
};

/** The year titles /api/og/premium draws (plain Korean, 2–14 characters); any other title gets no share button. */
const SHARE_TITLE = /^[가-힣\s·,]{2,14}$/;

/**
 * What a premium record's share image is drawn from (plan task 23), built here by code from the chapter: the dealt
 * cards, the relation's fixed id (the 궁합 reads no cards, owner 2026-10-17), or the year's own title. Never the
 * question, note, label, concern or a birth.
 */
export function premiumShareBody(chapter: PremiumChapter): Record<string, unknown> | null {
  if (chapter.kind === "tarot-deep") return { product: "tarot-deep", cards: chapter.cards.map(({ cardId, orientation }) => ({ cardId, orientation })) };
  if (chapter.kind === "match") return MATCH_RELATION_OPTIONS.some((o) => o.value === chapter.relation) ? { product: "match", relation: chapter.relation } : null;
  const title = chapter.reading.title.trim();
  return SHARE_TITLE.test(title) ? { product: "newyear-2027", title } : null;
}

/** The 2027 chart beside the reading, recomputed from the birth it was written for (as the saju record does). */
function YearChart({ chapter }: { chapter: NewYearChapter }) {
  const result = useMemo(() => chartFor(chapter.birth), [chapter.birth]);
  return <ChartPanel result={result} />;
}

/**
 * An opened premium reading (P5) in one scroll, in the records' design: the product and date, the
 * question or theme, the cards or the chart beside the paid body, its three follow-ups, 돌아보기 and the
 * rating. No other product is offered here.
 */
export function PremiumChapterView({ chapter, followUp, checkin, rating, shareable = false }: PremiumChapterViewProps) {
  // A 궁합's title carries the product's name already ("프리미엄 궁합 · 친구"): its line above says the date only.
  const eyebrow = chapter.kind === "match" ? kstMonthDay(chapter.createdAt) : `${PREMIUM[chapter.kind].name} · ${kstMonthDay(chapter.createdAt)}`;
  // The design the reading was written for; one saved before readings kept their deck was written for the 1909 scans.
  const deck = chapter.deck ?? "rws1909";
  let title: string;
  let spread: ReactNode = null;
  let spreadLabel = "뽑은 카드";
  let article: ReactNode;
  let line: ReactNode = null;
  if (chapter.kind === "tarot-deep") {
    title = chapter.question;
    spread = <CrossSpread cards={chapter.cards} deck={deck} />;
    article = <DeepTarotArticle reading={chapter.reading} cards={chapter.cards} deck={deck} showSpread={false} />;
  } else if (chapter.kind === "match") {
    title = `${PREMIUM.match.name} · ${chapter.relationLabel}`;
    // Saju only (owner 2026-10-17): nothing beside it, no chart either (eight letters nearly give a birth away). One
    // written before keeps its five cards.
    if (chapter.cards?.length) spread = <SpreadRow size="sm" cards={chapter.cards.map(faceUpCard)} deck={deck} />;
    article = <MatchArticle reading={chapter.reading} cards={chapter.cards} deck={deck} />;
  } else {
    title = `2027년, ${chapter.title}`;
    spreadLabel = "명식";
    spread = <YearChart chapter={chapter} />;
    article = <NewYearArticle reading={chapter.reading} />;
    line = <InputLine form={chapter.birth} className={s.question} />;
  }

  // The image only, linking the product page (never the record): built from the allowed fields above.
  const shareBody = shareable ? premiumShareBody(chapter) : null;

  return (
    <>
      <Stepper label="내 기록" backHref="/story" backLabel="내 기록으로" />
      <PrintHead at={chapter.createdAt} />
      <ReadingLayout
        spreadLabel={spreadLabel}
        head={
          <header className={s.head}>
            <p className={s.eyebrow}>{eyebrow}</p>
            <h1 className={s.title}>{title}</h1>
            {line}
            <div className={s.share}>
              {shareBody ? (
                <ShareImageButton
                  imageUrl="/api/og/premium"
                  body={shareBody}
                  fileName={`starlog-${PREMIUM[chapter.kind].slug}.png`}
                  shareText={`${SITE.nameKo} · ${PREMIUM[chapter.kind].name}`}
                  shareUrl={absoluteUrl(premiumShareHref(chapter.kind))}
                  label="이미지로 공유"
                />
              ) : null}
              <SavePdfButton type={PREMIUM[chapter.kind].name} kept={{ at: chapter.createdAt, inAccount: Boolean(chapter.serverId) }} />
            </div>
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
      <PrintFoot />
    </>
  );
}
