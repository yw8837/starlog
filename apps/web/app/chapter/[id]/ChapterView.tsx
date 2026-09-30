"use client";

import { useState } from "react";
import { Feedback } from "@/components/tarot/Feedback";
import { FollowUp } from "@/components/tarot/FollowUp";
import { GeneratingState } from "@/components/tarot/GeneratingState";
import { ReadingArticle } from "@/components/tarot/ReadingArticle";
import { ReadingLayout } from "@/components/tarot/ReadingLayout";
import { SharePreview } from "@/components/tarot/SharePreview";
import { SpreadRow, cardLabel, type SpreadCard } from "@/components/tarot/SpreadRow";
import { Stepper } from "@/components/tarot/Stepper";
import { StoryPage } from "@/components/tarot/StoryPage";
import { TarotCard } from "@/components/tarot/TarotCard";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ShareButton } from "@/components/ui/ShareButton";
import { SITE } from "@/lib/config";
import type { FollowUpFixture, TarotSample } from "@/lib/fixtures";
import { summarizeFlow, useFlowState, type FlowFallback } from "@/lib/flowState";
import { ChapterContents } from "./ChapterContents";
import s from "./ChapterView.module.css";

type ChapterViewProps = {
  sample: TarotSample;
  /** e.g. "1장" */
  chapterLabel: string;
  /** Show the writing state first (arriving from an unlock). */
  generate: boolean;
  inviteUrl: string;
  followUps: FollowUpFixture;
  fallback: FlowFallback;
};

/** An opened tarot chapter in one scroll: the story, the full reading, follow-ups, rating, friend invite. */
export function ChapterView({ sample, chapterLabel, generate, inviteUrl, followUps, fallback }: ChapterViewProps) {
  const [writing, setWriting] = useState(generate);
  const [enlarged, setEnlarged] = useState<number | null>(null);
  const [sharing, setSharing] = useState(false);
  const { flow } = useFlowState();
  const summary = summarizeFlow(flow, fallback);

  const doneWriting = () => {
    setWriting(false);
    // Drop ?from=unlock so a reload shows the chapter instead of writing it again.
    window.history.replaceState(null, "", window.location.pathname);
    window.scrollTo(0, 0);
  };

  if (writing) return <GeneratingState onDone={doneWriting} />;

  const cards: SpreadCard[] = sample.cards.map((card) => ({
    position: card.position,
    cardId: card.cardId,
    orientation: card.orientation,
    faceUp: true,
    number: card.number,
    name: card.name,
    keyword: card.keyword,
  }));
  const shown = enlarged === null ? undefined : cards[enlarged];
  const bookTitle = `나의 ${SITE.nameKo}`;

  return (
    <>
      <Stepper label={bookTitle} backHref="/story" backLabel="내 이야기로" />
      <ReadingLayout
        head={
          <header className={s.head}>
            <p className={s.eyebrow}>{`${bookTitle} · ${chapterLabel}`}</p>
            <h1 className={s.title}>{sample.story.title}</h1>
            <p className={s.question}>{flow ? summary.question : " "}</p>
            {/* The chapter lives on this device only: the share carries its title and the site, nothing else. */}
            <div className={s.share}>
              <ShareButton text={`${bookTitle} · ${sample.story.title}`} />
            </div>
          </header>
        }
        spread={<SpreadRow size="sm" cards={cards} onCardTap={setEnlarged} />}
      >
        <ChapterContents />
        <div id="chapter-story" className={s.anchor}>
          <StoryPage title={sample.story.title} body={sample.story.body} />
        </div>
        <div id="chapter-reading" className={s.anchor}>
          <ReadingArticle paid={sample.paid} />
        </div>
        <div id="chapter-follow-up" className={s.anchor}>
          <FollowUp suggestions={followUps.suggestions} answers={followUps.answers} otherAnswer={followUps.other} />
        </div>
        <Feedback />

        <section className={s.invite} aria-labelledby="invite-title">
          <h2 id="invite-title" className={s.inviteTitle}>
            친구의 카드 한 장
          </h2>
          <p className={s.inviteText}>친구는 로그인 없이 카드 한 장을 뽑고, 자기 풀이도 짧게 받아요. 남긴 카드는 내가 확인한 뒤 이야기에 들어가요.</p>
          <Button block onClick={() => setSharing(true)}>
            친구에게 한 장 받아보기
          </Button>
        </section>
      </ReadingLayout>

      <Modal open={shown !== undefined} onClose={() => setEnlarged(null)} labelledBy="enlarged-title">
        {shown ? (
          <div className={s.enlarged}>
            <h2 id="enlarged-title" className={s.enlargedTitle}>
              {`${shown.position} · ${shown.name}`}
            </h2>
            <TarotCard cardId={shown.cardId} orientation={shown.orientation} faceUp size="lg" label={cardLabel(shown)} className={s.enlargedCard} />
            <p className={s.enlargedMeta}>
              <span className={s.enlargedNumber}>{shown.number}</span>
              {shown.orientation === "reversed" ? "역방향" : "정방향"}
              {shown.keyword ? ` · ${shown.keyword}` : ""}
            </p>
          </div>
        ) : null}
      </Modal>

      <Modal open={sharing} onClose={() => setSharing(false)} labelledBy="share-title">
        <SharePreview
          titleId="share-title"
          card={sample.cards[0]}
          question={summary.question}
          chapter={`${bookTitle} · ${chapterLabel}`}
          inviteUrl={inviteUrl}
        />
      </Modal>
    </>
  );
}
