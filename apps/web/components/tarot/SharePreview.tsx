"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { TarotSampleCard } from "@/lib/fixtures";
import { Paper } from "./Paper";
import { TarotCard } from "./TarotCard";
import s from "./SharePreview.module.css";

type SharePreviewProps = {
  titleId: string;
  card: TarotSampleCard | undefined;
  question: string;
  /** e.g. "나의 스타로그 · 1장" */
  chapter: string;
  inviteUrl: string;
};

/** What a friend will see when the invite link is shared, plus the link itself. */
export function SharePreview({ titleId, card, question, chapter, inviteUrl }: SharePreviewProps) {
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied("done");
    } catch {
      setCopied("failed");
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied("idle"), 2000);
  };

  return (
    <div className={s.share}>
      <h2 id={titleId} className={s.title}>
        친구에게 보낼 카드
      </h2>

      <Paper className={s.preview}>
        {card ? <TarotCard cardId={card.cardId} orientation={card.orientation} faceUp size="sm" className={s.card} /> : null}
        <div className={s.previewText}>
          <p className={s.chapter}>{chapter}</p>
          <p className={s.question}>{question}</p>
          <p className={s.ask}>이 이야기에 카드 한 장을 뽑아 줄래요?</p>
        </div>
      </Paper>

      <div className={s.link}>
        <span className={s.linkLabel}>초대 링크</span>
        <span className={s.url}>
          {/* Let a long link wrap after a slash, never mid-word. */}
          {inviteUrl.split("/").map((part, i) => (
            <Fragment key={i}>
              {i > 0 ? "/" : null}
              {i > 0 && part ? <wbr /> : null}
              {part}
            </Fragment>
          ))}
        </span>
      </div>

      <Button block onClick={copy}>
        {copied === "done" ? "복사했어요" : copied === "failed" ? "복사하지 못했어요" : "링크 복사"}
      </Button>
      <p className={s.srOnly} aria-live="polite">
        {copied === "done" ? "초대 링크를 복사했어요" : ""}
      </p>
    </div>
  );
}
