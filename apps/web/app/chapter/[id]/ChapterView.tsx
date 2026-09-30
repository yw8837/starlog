"use client";

import { useState, type ReactNode } from "react";
import { AiNote } from "@/components/reading/AiNote";
import { Feedback } from "@/components/tarot/Feedback";
import { FollowUp, type AskResult } from "@/components/tarot/FollowUp";
import { ReadingArticle, type ReadingBody } from "@/components/tarot/ReadingArticle";
import { ReadingLayout } from "@/components/tarot/ReadingLayout";
import { SharePreview } from "@/components/tarot/SharePreview";
import { SpreadRow, cardLabel, type SpreadCard } from "@/components/tarot/SpreadRow";
import { Stepper } from "@/components/tarot/Stepper";
import { TarotCard } from "@/components/tarot/TarotCard";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ShareButton } from "@/components/ui/ShareButton";
import { SITE } from "@/lib/config";
import type { TarotSampleCard } from "@/lib/fixtures";
import { ChapterContents } from "./ChapterContents";
import s from "./ChapterView.module.css";

export interface ChapterFollowUp {
  suggestions: string[];
  turns: Array<{ question: string; answer: string }>;
  remaining: number;
  onAsk: (question: string) => Promise<AskResult>;
}

type ChapterViewProps = {
  /** e.g. "타로 기록 · 10월 1일" */
  eyebrow: string;
  question: string;
  cards: SpreadCard[];
  reading: ReadingBody;
  followUp: ChapterFollowUp;
  /** 돌아보기, shown first when it is due. */
  checkin?: ReactNode;
  /** The demo's friend invite (a real reading has none until 별자리 인연). */
  invite?: { url: string; card: TarotSampleCard };
};

/**
 * An opened tarot reading in one scroll: the question and cards, the full reading, follow-ups,
 * rating. Sharing sends the site and the verdict's first words, never the question or note.
 */
export function ChapterView({ eyebrow, question, cards, reading, followUp, checkin, invite }: ChapterViewProps) {
  const [enlarged, setEnlarged] = useState<number | null>(null);
  const [sharing, setSharing] = useState(false);
  const shown = enlarged === null ? undefined : cards[enlarged];
  const names = cards.map((card) => card.name ?? card.position).join(" · ");

  return (
    <>
      <Stepper label="내 기록" backHref="/story" backLabel="내 기록으로" />
      <ReadingLayout
        head={
          <header className={s.head}>
            <p className={s.eyebrow}>{eyebrow}</p>
            <h1 className={s.title}>{question}</h1>
            {/* The reading lives on this device only: the share carries the card names and the site. */}
            <div className={s.share}>
              <ShareButton text={`${SITE.nameKo}에서 뽑은 카드 · ${names}`} />
            </div>
          </header>
        }
        spread={<SpreadRow size="sm" cards={cards} onCardTap={setEnlarged} />}
      >
        {checkin}
        <ChapterContents />
        <div id="chapter-reading" className={s.anchor}>
          <ReadingArticle paid={reading} />
        </div>
        <div id="chapter-follow-up" className={s.anchor}>
          <FollowUp {...followUp} />
        </div>
        <Feedback />
        <AiNote />

        {invite ? (
          <section className={s.invite} aria-labelledby="invite-title">
            <h2 id="invite-title" className={s.inviteTitle}>
              친구의 카드 한 장
            </h2>
            <p className={s.inviteText}>친구는 로그인 없이 카드 한 장을 뽑고, 자기 풀이도 짧게 받아요. 남긴 카드는 내가 확인한 뒤 기록에 들어가요.</p>
            <Button block onClick={() => setSharing(true)}>
              친구에게 한 장 받아보기
            </Button>
          </section>
        ) : null}
      </ReadingLayout>

      <Modal open={shown !== undefined} onClose={() => setEnlarged(null)} labelledBy="enlarged-title">
        {shown ? (
          <div className={s.enlarged}>
            <h2 id="enlarged-title" className={s.enlargedTitle}>
              {`${shown.position} · ${shown.name ?? ""}`}
            </h2>
            <TarotCard cardId={shown.cardId} orientation={shown.orientation} faceUp size="lg" label={cardLabel(shown)} className={s.enlargedCard} />
            <p className={s.enlargedMeta}>
              {shown.number ? <span className={s.enlargedNumber}>{shown.number}</span> : null}
              {shown.orientation === "reversed" ? "역방향" : "정방향"}
              {shown.keyword ? ` · ${shown.keyword}` : ""}
            </p>
          </div>
        ) : null}
      </Modal>

      {invite ? (
        <Modal open={sharing} onClose={() => setSharing(false)} labelledBy="share-title">
          <SharePreview
            titleId="share-title"
            card={invite.card}
            question={question}
            chapter={`나의 ${SITE.nameKo}`}
            inviteUrl={invite.url}
          />
        </Modal>
      ) : null}
    </>
  );
}
