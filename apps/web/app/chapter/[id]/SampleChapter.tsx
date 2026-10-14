"use client";

import { useState } from "react";
import type { AskResult } from "@/components/tarot/FollowUp";
import { SITE } from "@/lib/config";
import type { FollowUpFixture, TarotSample } from "@/lib/fixtures";
import { ChapterView } from "./ChapterView";

/** Fixture latency before a demo answer shows. */
const DEMO_DELAY_MS = 1000;

type SampleChapterProps = {
  sample: TarotSample;
  followUps: FollowUpFixture;
  /** The demo friend invite; none in production, where it would hand out a made-up invite. */
  inviteUrl?: string;
};

/** The noindex demo reading (/chapter/sample): the gold sample with its written follow-up answers. */
export function SampleChapter({ sample, followUps, inviteUrl }: SampleChapterProps) {
  const [turns, setTurns] = useState<Array<{ question: string; answer: string }>>([]);

  const onAsk = (question: string) =>
    new Promise<AskResult>((resolve) => {
      window.setTimeout(() => {
        const answer = followUps.answers[question] ?? followUps.other;
        setTurns((prev) => [...prev, { question, answer }]);
        resolve({ answer });
      }, DEMO_DELAY_MS);
    });

  return (
    <ChapterView
      eyebrow="타로"
      question={sample.question}
      cards={sample.cards.map((card) => ({ ...card, faceUp: true }))}
      reading={sample.paid}
      followUp={{ suggestions: followUps.suggestions, turns, remaining: SITE.reading.followUps - turns.length, onAsk }}
      invite={inviteUrl ? { url: inviteUrl, card: sample.cards[0]! } : undefined}
    />
  );
}
