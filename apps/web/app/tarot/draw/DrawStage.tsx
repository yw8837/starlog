"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useFlowSpread } from "@/components/tarot/DeepSpreadGate";
import { DeckDraw } from "@/components/tarot/DeckDraw";
import { spreadResultHref, summarizeFlow, useFlowState, withFlags } from "@/lib/flowState";
import f from "../flow.module.css";

type DrawStageProps = {
  /** Skip the shuffle and every reveal delay (tests). */
  instant: boolean;
};

/**
 * Step 2 of the tarot flow: the question and the spread come from the saved flow, which only the
 * browser can read (a visit without a question goes back to the builder). The cards the server deals
 * are kept with their signed token in the flow, then the result screen opens: the standard one, or the
 * 켈틱 크로스 10장 one for a flow standing on it (a standard flow decides at once, asking nothing new).
 */
export function DrawStage({ instant }: DrawStageProps) {
  const router = useRouter();
  const { flow, setFlow } = useFlowState();
  const summary = summarizeFlow(flow);
  const { spread, gate } = useFlowSpread(flow, setFlow);

  // A direct visit without a question goes to the builder.
  useEffect(() => {
    if (flow && !summary) router.replace("/tarot/new");
  }, [flow, summary, router]);

  return (
    <div className={f.screen}>
      {gate}
      <DeckDraw
        instant={instant}
        templateId={spread === "deep" ? "deep-tarot" : (summary?.template ?? "self-flow")}
        // The slots and the fan wait (the deck already shuffles) until the spread is known: no pick before it.
        heading={summary && spread ? summary.question : null}
        step={{ step: 2, label: "카드 뽑기", backHref: "/tarot/new/situation", backLabel: "상황 고르기로" }}
        onDealt={(draw) => setFlow((prev) => ({ ...prev, draw }))}
        onRevealed={() => router.push(withFlags(spreadResultHref(spread === "deep" ? "deep" : "standard"), { instant }))}
      />
    </div>
  );
}
