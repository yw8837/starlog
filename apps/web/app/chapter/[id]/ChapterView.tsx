"use client";

import { useState, type ReactNode } from "react";
import { AiNote } from "@/components/reading/AiNote";
import { Feedback } from "@/components/tarot/Feedback";
import { FollowUp, type AskResult } from "@/components/tarot/FollowUp";
import { ReadingArticle, type ReadingBody } from "@/components/tarot/ReadingArticle";
import { ReadingLayout } from "@/components/tarot/ReadingLayout";
import { ShareResultButton, type ShareActions } from "@/components/share/ShareResultButton";
import { SharePreview } from "@/components/tarot/SharePreview";
import { SpreadRow, cardLabel, type SpreadCard } from "@/components/tarot/SpreadRow";
import { Stepper } from "@/components/tarot/Stepper";
import { TarotCard } from "@/components/tarot/TarotCard";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { SITE } from "@/lib/config";
import type { FrontDeck } from "@/lib/deck";
import type { TarotSampleCard } from "@/lib/fixtures";
import { ChapterContents } from "./ChapterContents";
import s from "./ChapterView.module.css";

export interface ChapterFollowUp {
  suggestions: string[];
  turns: Array<{ question: string; answer: string }>;
  remaining: number;
  onAsk: (question: string) => Promise<AskResult>;
  /** A question sent earlier that is still being answered. */
  awaiting?: { question: string; done: Promise<AskResult> };
  /** Why no more questions can be asked, when it is not that they were all used. */
  endedText?: string;
}

type ChapterViewProps = {
  /** e.g. "타로 기록 · 10월 1일" */
  eyebrow: string;
  question: string;
  cards: SpreadCard[];
  reading: ReadingBody;
  /** Absent: the reading takes no follow-ups (오픈 기념 무료); `keepOnly` says so instead. */
  followUp?: ChapterFollowUp;
  /** 오픈 기념 무료: the one line under the title saying the reading is read and kept on this device only. */
  keepOnly?: string;
  /** 돌아보기, shown first when it is due. */
  checkin?: ReactNode;
  /** The demo's friend invite (a real reading has none until 별자리 인연). */
  invite?: { url: string; card: TarotSampleCard };
  /** 결과 공유: a saved reading's own share link. Without it (the demo) 공유하기 sends the site. */
  share?: ShareActions;
  /** The design the reading was written for; omitted, the viewer's choice. */
  deck?: FrontDeck;
  /** 풀이 후기 for a reading saved in the account; otherwise the plain stars. */
  rating?: ReactNode;
};

/**
 * An opened tarot reading in one scroll: the question and cards, the full reading, follow-ups,
 * rating. Sharing makes the reading's own link (the cards and the reading, never the question or note).
 */
export function ChapterView({ eyebrow, question, cards, reading, followUp, keepOnly, checkin, invite, share, deck, rating }: ChapterViewProps) {
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
            {/* Only the reading's own link is shared (owner 2026-10-14: a share that opened the home misled). */}
            {share ? (
              <div className={s.share}>
                <ShareResultButton kind="tarot" text={`${SITE.nameKo}에서 뽑은 카드 · ${names}`} {...share} />
              </div>
            ) : null}
            {keepOnly ? <p className={s.keepOnly}>{keepOnly}</p> : null}
          </header>
        }
        spread={<SpreadRow size="sm" cards={cards} onCardTap={setEnlarged} deck={deck} />}
      >
        {checkin}
        <ChapterContents followUp={Boolean(followUp)} />
        <div id="chapter-reading" className={s.anchor}>
          <ReadingArticle paid={reading} />
        </div>
        {followUp ? (
          <div id="chapter-follow-up" className={s.anchor}>
            <FollowUp {...followUp} />
          </div>
        ) : null}
        {rating ?? <Feedback />}
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
            <TarotCard cardId={shown.cardId} orientation={shown.orientation} faceUp size="lg" label={cardLabel(shown)} className={s.enlargedCard} deck={deck} />
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
