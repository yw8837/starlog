"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { DeckDraw } from "@/components/tarot/DeckDraw";
import f from "@/app/tarot/flow.module.css";
import { withFlags } from "@/lib/flowState";
import { matchReady, readMatchFlow, relationLabel, saveMatchFlow, useMatchFlow } from "@/lib/premium/matchFlow";

/**
 * 우리 사이 궁합's step 2 (Task 20): the five-card spread under "우리 사이 · <relation>". The server deals the
 * cards; they are kept with their token in the tab, then the preview opens. The faces are the 1909
 * pictures the 궁합 reading quotes (its request carries no card design). Without the form's answers it
 * goes back to the form.
 */
export function MatchDraw({ instant }: { instant: boolean }) {
  const router = useRouter();
  const { flow } = useMatchFlow();
  const ready = flow ? matchReady(flow) : null;

  useEffect(() => {
    if (ready === "form") router.replace("/premium/match/new");
  }, [ready, router]);

  return (
    <div className={f.screen}>
      <DeckDraw
        instant={instant}
        templateId="match"
        deck="rws1909"
        heading={flow?.relation && ready !== "form" ? `우리 사이 · ${relationLabel(flow.relation)}` : null}
        step={{ step: 2, total: 3, label: "카드 뽑기", backHref: "/premium/match/new", backLabel: "궁합 정보로" }}
        onDealt={({ drawToken, cards }) => saveMatchFlow({ ...readMatchFlow(), draw: { drawToken, cards } })}
        onRevealed={() => router.push(withFlags("/premium/match/preview", { instant }))}
      />
    </div>
  );
}
