"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { DeckDraw } from "@/components/tarot/DeckDraw";
import f from "@/app/tarot/flow.module.css";
import { withFlags } from "@/lib/flowState";
import { matchReady, readMatchFlow, relationLabel, saveMatchFlow, useMatchFlow } from "@/lib/premium/matchFlow";
import { PREMIUM } from "@/lib/premium/products";

/**
 * 프리미엄 궁합's step 2 (Task 20): the five-card spread under "프리미엄 궁합 · <relation>". The server deals the
 * cards; they are kept with their token in the tab, then the preview opens. The faces follow the card
 * design the user chose (내 정보), the one the reading quotes (owner 2026-10-17). Without the form's
 * answers it goes back to the form.
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
        heading={flow?.relation && ready !== "form" ? `${PREMIUM.match.name} · ${relationLabel(flow.relation)}` : null}
        step={{ step: 2, total: 3, label: "카드 뽑기", backHref: "/premium/match/new", backLabel: "궁합 정보로" }}
        onDealt={({ drawToken, cards }) => saveMatchFlow({ ...readMatchFlow(), draw: { drawToken, cards } })}
        onRevealed={() => router.push(withFlags("/premium/match/preview", { instant }))}
      />
    </div>
  );
}
