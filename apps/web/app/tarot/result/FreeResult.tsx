"use client";

import { LockedToc } from "@/components/tarot/LockedToc";
import { Paper } from "@/components/tarot/Paper";
import { ReadingLayout } from "@/components/tarot/ReadingLayout";
import { SpreadRow } from "@/components/tarot/SpreadRow";
import { Stepper } from "@/components/tarot/Stepper";
import { UnlockSheet, type Wallet } from "@/components/tarot/UnlockSheet";
import { SituationSummary } from "@/components/tarot/SituationSummary";
import type { TarotSample } from "@/lib/fixtures";
import { summarizeFlow, useFlowState, withFlags, type FlowFallback } from "@/lib/flowState";
import s from "./FreeResult.module.css";

type FreeResultProps = {
  fallback: FlowFallback;
  cards: TarotSample["cards"];
  free: TarotSample["free"];
  visit: "first" | "returning";
  instant: boolean;
  wallet: Wallet;
};

/** Step 3: the question as asked, the three cards face up, the first card read in full, the rest listed. */
export function FreeResult({ fallback, cards, free, visit, instant, wallet }: FreeResultProps) {
  const { flow } = useFlowState();
  const summary = summarizeFlow(flow, fallback);
  const openHref = withFlags("/chapter/sample?from=unlock", { instant });

  return (
    <>
      <Stepper step={3} label="카드 풀이" backHref="/" backLabel="홈으로" />
      <ReadingLayout
        head={
          <header className={s.head}>
            <h1 className={s.question}>{flow ? summary.question : " "}</h1>
            {flow ? <SituationSummary conditions={summary.conditions} note={summary.note} /> : null}
          </header>
        }
        spread={
          <SpreadRow
            size="md"
            cards={cards.map((card) => ({
              position: card.position,
              cardId: card.cardId,
              orientation: card.orientation,
              faceUp: true,
              number: card.number,
              name: card.name,
              keyword: card.keyword,
            }))}
          />
        }
      >
        <Paper as="article" aria-labelledby="first-card-title">
          <h2 id="first-card-title" className={s.cardHeading}>
            {free.firstCard.heading}
          </h2>
          <p className={s.prose}>{free.firstCard.body}</p>
        </Paper>
        <LockedToc items={free.lockedToc} />
        <UnlockSheet visit={visit} wallet={wallet} loginHref={withFlags("/login", { instant })} openHref={openHref} />
      </ReadingLayout>
    </>
  );
}
