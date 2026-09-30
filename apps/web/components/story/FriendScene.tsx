"use client";

import { getCard } from "@starlog/core";
import { useState } from "react";
import { Paper } from "@/components/tarot/Paper";
import { TarotCard } from "@/components/tarot/TarotCard";
import { Button } from "@/components/ui/Button";
import type { FriendScene as FriendSceneData } from "@/lib/fixtures";
import s from "./FriendScene.module.css";

type Status = "pending" | "approved" | "hidden";

/**
 * A card a friend left through an invite link. Only the owner's approval puts it into the story
 * (spec §9); hiding keeps it out, with a way back. P1 keeps the choice in memory only.
 */
export function FriendScene({ scene }: { scene: FriendSceneData }) {
  const [status, setStatus] = useState<Status>(scene.status);
  const card = getCard(scene.cardId);
  const number = card.arcana === "major" ? card.roman : null;
  const name = `${scene.nickname}님`;

  if (status === "hidden") {
    return (
      <div className={s.hidden}>
        <p role="status">{`${name}의 카드를 숨겼어요`}</p>
        <Button variant="ghost" size="md" onClick={() => setStatus("pending")}>
          되돌리기
        </Button>
      </div>
    );
  }

  return (
    <Paper as="article" className={status === "pending" ? `${s.scene} ${s.pending}` : s.scene} aria-labelledby={`scene-${scene.id}`}>
      <header className={s.head}>
        <span className={s.avatar} aria-hidden="true">
          {scene.nickname.charAt(0)}
        </span>
        <h2 id={`scene-${scene.id}`} className={s.from}>{`${name}이 남긴 카드`}</h2>
        <span className={status === "pending" ? `${s.tag} ${s.tagPending}` : s.tag}>{status === "pending" ? "확인 대기" : "이야기에 넣음"}</span>
      </header>

      <div className={s.body}>
        <TarotCard cardId={scene.cardId} orientation={scene.orientation} faceUp size="sm" className={s.card} label={`${card.names.ko} 카드`} />
        <div className={s.text}>
          <p className={s.cardName}>
            {number ? <span className={s.number}>{number}</span> : null}
            {card.names.ko}
            <span className={s.orientation}>{scene.orientation === "reversed" ? " · 역방향" : " · 정방향"}</span>
          </p>
          <blockquote className={s.message}>
            <p>{scene.message}</p>
          </blockquote>
        </div>
      </div>

      {status === "pending" ? (
        <div className={s.actions}>
          <Button variant="secondary" size="md" onPaper onClick={() => setStatus("approved")}>
            이야기에 넣기
          </Button>
          <Button variant="ghost" size="md" onPaper onClick={() => setStatus("hidden")}>
            숨기기
          </Button>
        </div>
      ) : (
        <p className={s.done} role="status">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
          나의 스타로그에 넣었어요
        </p>
      )}
    </Paper>
  );
}
